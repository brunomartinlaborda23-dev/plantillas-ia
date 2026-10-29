// Sonidos sintetizados con WebAudio (no hacen falta archivos de audio).
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
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

    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 380;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.osc.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.engGain);
    this.engGain.connect(this.master);
    this.osc.start();
    this.osc2.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  engine(on, speed, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 34 + speed * 4.5 + throttle * 22;
    this.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + throttle * 0.05 : 0, t, 0.12);
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
