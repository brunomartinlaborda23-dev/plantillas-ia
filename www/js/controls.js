// Controles táctiles (volante, pedales, marcha) y de teclado.
import { clamp } from './physics.js';

const MAX_ROT = 300; // grados de volante hasta el tope (menos de una vuelta: cómodo con el dedo)
// Los pedales no saltan de 0 a 100 %: suben y bajan progresivamente (por segundo).
const PEDAL_UP = 2.6, PEDAL_DOWN = 6, BRAKE_UP = 4;

export class Controls {
  constructor() {
    this.keys = {};
    this.onCamera = null;
    this.onPause = null;
    this.onGear = null;
    this.reset();
    addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyC') this.onCamera?.();
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
  }

  reset() {
    this.gas = this.brk = this.hand = this.btnL = this.btnR = false;
    this.thr = this.brkVal = 0;
    this.wheelRot = 0;
    this.wheelHeld = false;
    this.keys = {};
    this.setGear(1);
  }

  setGear(g) {
    this.gear = g;
    this.onGear?.(g);
  }

  bind({ wheel, gas, brake, hand, gear, left, right }) {
    const hold = (el, prop) => {
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        this[prop] = true;
        el.classList.add('on');
      });
      const up = () => { this[prop] = false; el.classList.remove('on'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    };
    hold(gas, 'gas');
    hold(brake, 'brk');
    hold(hand, 'hand');
    hold(left, 'btnL');
    hold(right, 'btnR');

    gear.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.setGear(this.gear === 1 ? -1 : 1);
    });

    const angle = e => {
      const r = wheel.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };
    wheel.addEventListener('pointerdown', e => {
      e.preventDefault();
      wheel.setPointerCapture(e.pointerId);
      this.wheelHeld = true;
      this.lastAng = angle(e);
    });
    wheel.addEventListener('pointermove', e => {
      if (!this.wheelHeld) return;
      const a = angle(e);
      let d = a - this.lastAng;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      this.lastAng = a;
      this.wheelRot = clamp(this.wheelRot + d, -MAX_ROT, MAX_ROT);
    });
    const release = () => { this.wheelHeld = false; };
    // Al soltar el volante vuelve al centro él solo (ver update).
    wheel.addEventListener('pointerup', release);
    wheel.addEventListener('pointercancel', release);
    wheel.addEventListener('lostpointercapture', release);
  }

  // v: velocidad actual con signo (positiva hacia delante).
  update(dt, v) {
    const k = this.keys;
    const left = k.ArrowLeft || k.KeyA, right = k.ArrowRight || k.KeyD;
    const up = k.ArrowUp || k.KeyW, down = k.ArrowDown || k.KeyS;
    const kb = (left || this.btnL ? 1 : 0) - (right || this.btnR ? 1 : 0);

    if (!this.wheelHeld) {
      // Teclas y botones: a más velocidad, menos giro máximo y más suave (como la dirección real).
      const sp = Math.abs(v);
      const reach = 1 / (1 + sp / 9);
      const rate = (kb ? 520 / (1 + sp / 12) : 480) * dt;
      this.wheelRot += clamp(-kb * MAX_ROT * reach - this.wheelRot, -rate, rate);
    }

    let gas = this.gas, brk = this.brk;
    // Con teclado la marcha cambia sola: adelante = D, atrás = R.
    if (up) {
      if (this.gear === 1) gas = true;
      else if (v < -0.3) brk = true;
      else { this.setGear(1); gas = true; }
    }
    if (down) {
      if (this.gear === -1) gas = true;
      else if (v > 0.3) brk = true;
      else { this.setGear(-1); gas = true; }
    }
    this.thr = gas ? Math.min(1, this.thr + PEDAL_UP * dt) : Math.max(0, this.thr - PEDAL_DOWN * dt);
    this.brkVal = brk ? Math.min(1, this.brkVal + BRAKE_UP * dt) : 0;
    return { throttle: this.thr, brake: this.brkVal, steer: -this.wheelRot / MAX_ROT, handbrake: this.hand || !!k.Space };
  }
}
