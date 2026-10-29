// Sonido de motor sintetizado en tiempo real, con un "carácter" distinto para cada tipo de motor.
// Capas: tono principal (armónicos propios del motor), bombeo irregular, distorsión de escape,
// ruido de admisión, silbido de turbo con soplido al soltar, petardeos y zumbido eléctrico.

// fire: explosiones por vuelta del cigüeñal (cilindros / 2); harm: peso de cada armónico;
// drive: distorsión del escape; cut: filtro [ralentí, corte]; lump: irregularidad del ralentí;
// noise: admisión; turbo/pops/whine: intensidad de cada efecto; vol: volumen relativo.
export const VOICES = {
  i4:   { label: '4 cilindros',              fire: 2, harm: [1, 0.55, 0.3, 0.18, 0.1, 0.06],             drive: 2.5, cut: [320, 2200], lump: 0.06, noise: 0.25, turbo: 0,   pops: 0,   whine: 0, vol: 0.8 },
  v6:   { label: 'V6',                       fire: 3, harm: [1, 0.5, 0.4, 0.2, 0.15, 0.08],              drive: 2.5, cut: [260, 1800], lump: 0.1,  noise: 0.2,  turbo: 0.25, pops: 0,  whine: 0, vol: 0.9 },
  v8:   { label: 'V8 atmosférico',           fire: 4, harm: [1, 0.85, 0.35, 0.3, 0.12, 0.08],            drive: 6,   cut: [170, 1500], lump: 0.42, noise: 0.3,  turbo: 0,   pops: 0.6, whine: 0, vol: 1.1 },
  v6tt: { label: 'V6 biturbo',               fire: 3, harm: [1, 0.6, 0.5, 0.3, 0.2, 0.12],               drive: 4.5, cut: [260, 2800], lump: 0.12, noise: 0.3,  turbo: 0.8, pops: 0.5, whine: 0, vol: 1 },
  i6t:  { label: '6 en línea biturbo',       fire: 3, harm: [1, 0.35, 0.65, 0.2, 0.32, 0.1, 0.12],       drive: 4,   cut: [270, 3200], lump: 0.04, noise: 0.3,  turbo: 1,   pops: 0.8, whine: 0, vol: 1 },
  f6:   { label: 'Bóxer 6 atmosférico',      fire: 3, harm: [1, 0.7, 0.8, 0.5, 0.42, 0.3, 0.22, 0.15],   drive: 8,   cut: [320, 5200], lump: 0.14, noise: 0.5,  turbo: 0,   pops: 0.4, whine: 0, vol: 1 },
  v12:  { label: 'V12 híbrido',              fire: 6, harm: [1, 0.45, 0.7, 0.3, 0.45, 0.2, 0.28, 0.12],  drive: 4,   cut: [380, 6500], lump: 0.03, noise: 0.35, turbo: 0,   pops: 0.3, whine: 1, vol: 1 },
};

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function shaperCurve(drive) {
  const n = 1024, c = new Float32Array(n), norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / norm;
  }
  return c;
}

export class EngineSound {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2);
    this.boost = 0;
    this.lastThrottle = 0;
    this.lastPops = 0;

    // Tono principal → bombeo (AM) → distorsión → filtro → corte de cambio → volumen
    this.osc = ctx.createOscillator();
    this.am = ctx.createGain();
    this.lfo = ctx.createOscillator();
    this.lfoDepth = ctx.createGain();
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.am.gain);
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '2x';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2;
    this.shiftGain = ctx.createGain();
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.am);
    this.am.connect(this.shaper);
    this.shaper.connect(this.filter);
    this.filter.connect(this.shiftGain);
    this.shiftGain.connect(this.gain);
    this.gain.connect(out);

    // Sub-armónico (media orden): da cuerpo y el "borboteo" del V8.
    this.sub = ctx.createOscillator();
    this.sub.type = 'triangle';
    this.subGain = ctx.createGain();
    this.sub.connect(this.subGain);
    this.subGain.connect(this.filter);

    // Admisión: ruido filtrado que sube con las revoluciones.
    this.intake = ctx.createBufferSource();
    this.intake.buffer = this.noise;
    this.intake.loop = true;
    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.Q.value = 1.2;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intake.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(out);

    // Silbido del turbo y zumbido eléctrico.
    this.turbo = ctx.createOscillator();
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain);
    this.turboGain.connect(out);
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain);
    this.whineGain.connect(out);

    this.out = out;
    for (const o of [this.osc, this.lfo, this.sub, this.intake, this.turbo, this.whine]) o.start();
    this.setVoice('i4');
  }

  setVoice(name) {
    const v = this.v = VOICES[name] || VOICES.i4;
    const real = new Float32Array(v.harm.length + 1);
    const imag = new Float32Array(v.harm.length + 1);
    v.harm.forEach((h, i) => { imag[i + 1] = h; });
    this.osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag));
    this.shaper.curve = shaperCurve(v.drive);
    this.lfoDepth.gain.value = v.lump;
    this.am.gain.value = 1 - v.lump * 0.5;
    this.subGain.gain.value = 0.25 + v.lump;
    this.boost = 0;
  }

  // rpm: revoluciones; red: corte de inyección; throttle 0..1.
  update(on, rpm, red, throttle) {
    const v = this.v, t = this.ctx.currentTime;
    const n = Math.min(1, rpm / red);
    const f = Math.max(8, (rpm / 60) * v.fire);
    const k = 0.025;
    this.osc.frequency.setTargetAtTime(f, t, k);
    this.sub.frequency.setTargetAtTime(f / 2, t, k);
    this.lfo.frequency.setTargetAtTime(rpm / 120, t, k);
    const cut = (v.cut[0] + (v.cut[1] - v.cut[0]) * (0.2 + 0.8 * n)) * (0.5 + 0.5 * throttle);
    this.filter.frequency.setTargetAtTime(cut, t, 0.04);
    const vol = on ? v.vol * (0.07 + 0.13 * throttle + 0.1 * n) : 0;
    this.gain.gain.setTargetAtTime(vol, t, 0.05);

    this.intakeFilter.frequency.setTargetAtTime(350 + n * 2600, t, 0.05);
    this.intakeGain.gain.setTargetAtTime(on ? v.noise * 0.05 * (0.2 + throttle) * (0.3 + n) : 0, t, 0.05);

    // Turbo: se carga con gas y revoluciones; al soltar, soplido.
    const target = on && v.turbo ? throttle * Math.min(1, Math.max(0, (n - 0.25) / 0.45)) : 0;
    this.boost += (target - this.boost) * (target > this.boost ? 0.03 : 0.25);
    this.turbo.frequency.setTargetAtTime(1800 + this.boost * 5200, t, 0.05);
    this.turboGain.gain.setTargetAtTime(v.turbo * 0.022 * this.boost, t, 0.05);

    this.whine.frequency.setTargetAtTime(200 + (rpm / 60) * 10, t, 0.05);
    this.whineGain.gain.setTargetAtTime(on ? v.whine * 0.012 * (0.3 + throttle) * n : 0, t, 0.08);

    // Al levantar el pie a altas vueltas: soplido de turbo y petardeos.
    if (on && this.lastThrottle > 0.6 && throttle < 0.1) {
      if (v.turbo && this.boost > 0.35) this.burst(0.35, 'highpass', 1800, v.turbo * 0.1);
      if (v.pops && n > 0.5 && t - this.lastPops > 0.8) {
        this.lastPops = t;
        const count = 3 + Math.floor(Math.random() * 4);
        let d = 0.05;
        for (let i = 0; i < count; i++) {
          this.burst(0.035, 'lowpass', 700 + Math.random() * 500, v.pops * (0.18 + Math.random() * 0.15), d);
          d += 0.05 + Math.random() * 0.1;
        }
      }
    }
    this.lastThrottle = throttle;
  }

  burst(dur, type, freq, vol, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // Corte de gas en el cambio de marcha (los turbo sueltan un pequeño soplido).
  shift() {
    const g = this.shiftGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.2, t);
    g.linearRampToValueAtTime(1, t + 0.14);
    if (this.v.turbo && this.boost > 0.3) this.burst(0.15, 'highpass', 2500, this.v.turbo * 0.05);
  }

  // Motor de arranque: golpes graves rápidos durante medio segundo.
  starter() {
    const ctx = this.ctx;
    for (let i = 0; i < 9; i++) this.burst(0.05, 'lowpass', 260, 0.16, i * 0.06);
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(14, t);
    o.frequency.linearRampToValueAtTime(18, t + 0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.linearRampToValueAtTime(0, t + 0.55);
    o.connect(f);
    f.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.6);
  }
}
