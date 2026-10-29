// Sonidos sintetizados con WebAudio (no hacen falta archivos de audio).
import { EngineSound } from './engine-sound.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voice = 'i4';
  }

  // Debe llamarse tras un toque del usuario (requisito de iOS).
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    this.eng = new EngineSound(ctx, this.master);
    this.eng.setVoice(this.voice);

    // Chirrido de neumáticos: ruido en bucle por un filtro paso banda.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 9;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    src.connect(bp);
    bp.connect(this.squealGain);
    this.squealGain.connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  // Cambia el tipo de motor (ver VOICES en engine-sound.js).
  setEngine(voice) {
    this.voice = voice;
    this.eng?.setVoice(voice);
  }

  engine(on, rpm, throttle, red = 6500) {
    this.eng?.update(on, rpm, red, throttle);
  }

  shift() { this.eng?.shift(); }
  starter() { this.eng?.starter(); }

  squeal(amount) {
    if (!this.ctx) return;
    this.squealGain.gain.setTargetAtTime(Math.min(1, amount) * 0.12, this.ctx.currentTime, 0.06);
  }

  tone(freq, dur, vol = 0.15, type = 'sine', delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  beep() { this.tone(1500, 0.07, 0.12); }
  click() { this.tone(700, 0.04, 0.08, 'triangle'); }
  coin() { this.tone(988, 0.08, 0.15, 'square'); this.tone(1319, 0.16, 0.15, 'square', 0.08); }
  success() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 0.15, 'triangle', i * 0.12)); }
  fail() { this.tone(300, 0.25, 0.15, 'sawtooth'); this.tone(200, 0.4, 0.15, 'sawtooth', 0.2); }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }
}
