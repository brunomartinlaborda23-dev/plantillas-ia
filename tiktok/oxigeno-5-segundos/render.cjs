// Graba index.html a MP4 vertical 1080x1920 (30 fps) con música generada.
// Uso:  node render.cjs                    -> oxigeno-5-segundos.mp4
//       node render.cjs --preview 2,12,30  -> PNGs de esos segundos (en la carpeta indicada)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DIR = __dirname, FPS = 30, args = process.argv.slice(2);

// Música ambiental original: acorde sostenido brillante que se vuelve apagado
// mientras falta el oxígeno, tics de cuenta atrás y golpes de presión.
function makeAudio(out, dur, gone, back) {
  const tick = [...Array(5)].map((_, i) => gone - 5 + i);
  const inputs = [], f = [];
  const add = (src) => { inputs.push('-f', 'lavfi', '-i', src); return inputs.length / 4 - 1; };
  const notes = [110, 164.81, 220, 261.63, 329.63];
  notes.forEach((hz) => add(`sine=f=${hz}:d=${dur}:sample_rate=44100`));
  const nNoise = add(`anoisesrc=color=pink:d=${dur}:a=0.25:r=44100`);
  const nThump = add('sine=f=48:d=1.2:sample_rate=44100');
  const nThump2 = add('sine=f=48:d=1.2:sample_rate=44100');
  const nWhoosh = add('anoisesrc=color=white:d=2.5:a=0.6:r=44100');
  const nTick = add('sine=f=1200:d=0.05:sample_rate=44100');
  notes.forEach((_, i) => f.push(`[${i}]volume=${[0.16, 0.08, 0.1, 0.05, 0.04][i]},tremolo=f=${0.1 + i * 0.07}:d=0.5[n${i}]`));
  f.push(`${notes.map((_, i) => `[n${i}]`).join('')}amix=inputs=${notes.length}:normalize=0,asplit=2[padA][padB]`);
  // brillante fuera de la ausencia, apagado (filtro paso bajo) durante ella
  f.push(`[padA]volume='clip((${gone}-t)*3,0,1)+clip((t-${back})*3,0,1)':eval=frame[bright]`);
  f.push(`[padB]lowpass=f=350,volume='1.4*clip(min((t-${gone})*3,(${back}-t)*3),0,1)':eval=frame[dull]`);
  f.push(`[${nNoise}]highpass=f=300,lowpass=f=2500,volume=0.06[air]`);
  f.push(`[${nThump}]afade=t=out:st=0:d=1.1,volume=1.6,adelay=${Math.round(gone * 1000)}:all=1[th1]`);
  f.push(`[${nThump2}]afade=t=out:st=0:d=1.1,volume=1.8,adelay=${Math.round(back * 1000)}:all=1[th2]`);
  f.push(`[${nWhoosh}]highpass=f=800,lowpass=f=5000,afade=t=in:d=0.15,afade=t=out:st=0.2:d=2.2,volume=0.5,adelay=${Math.round(gone * 1000)}:all=1[wh]`);
  f.push(`[${nTick}]asplit=${tick.length}${tick.map((_, i) => `[tk${i}]`).join('')}`);
  tick.forEach((s, i) => f.push(`[tk${i}]volume=0.35,adelay=${Math.round(s * 1000)}:all=1[tick${i}]`));
  const mix = ['[bright]', '[dull]', '[air]', '[th1]', '[th2]', '[wh]', ...tick.map((_, i) => `[tick${i}]`)];
  f.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0,alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=1,afade=t=out:st=${dur - 2}:d=2,aformat=channel_layouts=stereo[out]`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', f.join(';'), '-map', '[out]', '-t', String(dur), out]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(DIR, 'index.html') + '?render=1');
  await page.evaluate(() => document.fonts.ready);
  const { dur, ev } = await page.evaluate(() => ({ dur: window.DUR, ev: window.EVENTS }));

  if (args[0] === '--preview') {
    const outDir = args[2] || DIR;
    for (const s of args[1].split(',').map(Number)) {
      const png = await page.evaluate((t) => { renderAt(t); return document.getElementById('c').toDataURL('image/png'); }, s);
      fs.writeFileSync(path.join(outDir, `preview-${s}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    await browser.close(); return;
  }

  const audio = path.join(DIR, 'audio.wav');
  makeAudio(audio, dur, ev.gone, ev.back);
  const out = path.join(DIR, 'oxigeno-5-segundos.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', audio, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(dur * FPS);
  for (let i = 0; i < total; i++) {
    const data = await page.evaluate((t) => { renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, i / FPS);
    if (!ff.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`fotograma ${i}/${total}`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  fs.unlinkSync(audio); await browser.close();
  console.log('Listo:', out);
})();
