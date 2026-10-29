// Controles táctiles (volante, pedales, marcha) y de teclado.
import { clamp } from './physics.js';

const MAX_ROT = 450; // grados de volante hasta el tope

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
    this.gas = this.brk = this.hand = false;
    this.wheelRot = 0;
    this.wheelHeld = false;
    this.keys = {};
    this.setGear(1);
  }

  setGear(g) {
    this.gear = g;
    this.onGear?.(g);
  }

  bind({ wheel, gas, brake, hand, gear }) {
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
    wheel.addEventListener('pointerup', release);
    wheel.addEventListener('pointercancel', release);
    wheel.addEventListener('lostpointercapture', release);
  }

  // v: velocidad actual con signo (positiva hacia delante).
  update(dt, v) {
    const k = this.keys;
    const left = k.ArrowLeft || k.KeyA, right = k.ArrowRight || k.KeyD;
    const up = k.ArrowUp || k.KeyW, down = k.ArrowDown || k.KeyS;
    const kb = (left ? 1 : 0) - (right ? 1 : 0);

    if (!this.wheelHeld) {
      const rate = (kb ? 700 : 900) * dt;
      this.wheelRot += clamp(-kb * MAX_ROT - this.wheelRot, -rate, rate);
    }

    let throttle = this.gas ? 1 : 0, brake = this.brk ? 1 : 0;
    // Con teclado la marcha cambia sola: adelante = D, atrás = R.
    if (up) {
      if (this.gear === 1) throttle = 1;
      else if (v < -0.3) brake = 1;
      else { this.setGear(1); throttle = 1; }
    }
    if (down) {
      if (this.gear === -1) throttle = 1;
      else if (v > 0.3) brake = 1;
      else { this.setGear(-1); throttle = 1; }
    }
    return { throttle, brake, steer: -this.wheelRot / MAX_ROT, handbrake: this.hand || !!k.Space };
  }
}
