// Graba index.html a MP4 vertical 1080x1920 (30 fps) con sonido.
// Uso:  node render.cjs                 -> tierra-explota.mp4 (usa narracion.wav si existe)
//       node render.cjs --solo-audio    -> rehace solo el sonido del MP4
//       node render.cjs --preview 3,17,30 -> PNGs de esos segundos
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DIR = __dirname;
const FPS = 30;
const args = process.argv.slice(2);

function makeAudio(out, dur) {
  // Dron grave + rumor creciente + explosión a los 16 s
  const fc = [
    '[0]volume=0.16[a0]',
    '[1]volume=0.07,tremolo=f=0.25:d=0.6[a1]',
    "[2]lowpass=f=260,volume='if(between(t,11,16),0.05+(t-11)/5*0.9,if(lt(t,16),0.05,0.04))':eval=frame[a2]",
    '[3]lowpass=f=160,afade=t=out:st=0.2:d=6,volume=2.4,adelay=16000:all=1[a3]',
    '[4]afade=t=out:st=0:d=4.5,volume=0.9,adelay=16000:all=1[a4]',
    `[a0][a1][a2][a3][a4]amix=inputs=5:normalize=0,alimiter=limit=0.9,afade=t=in:d=1.2,afade=t=out:st=${dur - 2}:d=2,aformat=channel_layouts=stereo:sample_rates=44100[mus]`,
  ];
  const narr = path.join(DIR, 'narracion.wav');
  const extra = [];
  if (fs.existsSync(narr)) {
    // con narración: la música baja automáticamente cuando habla la voz
    extra.push('-i', narr);
    fc.push('[5]asplit=2[vz][key]', '[mus][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck]',
      '[duck][vz]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]');
  } else fc.push('[mus]anull[out]');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=f=55:d=${dur}:sample_rate=44100`,
    '-f', 'lavfi', '-i', `sine=f=82.41:d=${dur}:sample_rate=44100`,
    '-f', 'lavfi', '-i', `anoisesrc=color=brown:d=${dur}:a=0.5:r=44100`,
    '-f', 'lavfi', '-i', 'anoisesrc=color=brown:d=7:a=0.9:r=44100',
    '-f', 'lavfi', '-i', 'sine=f=38:d=6:sample_rate=44100',
    ...extra, '-filter_complex', fc.join(';'), '-map', '[out]', '-t', String(dur), out]);
}

(async () => {
  if (args[0] === '--solo-audio') {
    // Rehace solo el sonido (p. ej. tras cambiar la narración) sin volver a grabar la imagen
    const out = path.join(DIR, 'tierra-explota.mp4'), tmp = path.join(DIR, 'tmp.mp4'), audio = path.join(DIR, 'audio.wav');
    makeAudio(audio, 66);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-i', audio, '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, out); fs.unlinkSync(audio);
    console.log('Listo:', out);
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(DIR, 'index.html') + '?render=1');
  await page.evaluate(() => document.fonts.ready);
  const dur = await page.evaluate(() => window.DUR);
  const grab = (t) => page.evaluate((t) => { renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, t);

  if (args[0] === '--preview') {
    const outDir = args[2] || DIR;
    for (const s of args[1].split(',').map(Number)) {
      const png = await page.evaluate((t) => { renderAt(t); return document.getElementById('c').toDataURL('image/png'); }, s);
      fs.writeFileSync(path.join(outDir, `preview-${s}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    await browser.close();
    return;
  }

  const audio = path.join(DIR, 'audio.wav');
  makeAudio(audio, dur);
  const out = path.join(DIR, 'tierra-explota.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', audio, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });

  const total = Math.round(dur * FPS);
  for (let i = 0; i < total; i++) {
    const data = await grab(i / FPS);
    const buf = Buffer.from(data.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`fotograma ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  fs.unlinkSync(audio);
  await browser.close();
  console.log('Listo:', out);
})();
