// FotoVende — saca fotos, mejóralas y prepáralas para Vinted, Wallapop, eBay…
// Todo se procesa en el propio móvil/ordenador: las fotos no se suben a ningún servidor.

const MAX_SRC = 2400;   // lado largo máximo con el que guardamos cada foto
const EXPORT = 2048;    // lado largo de las fotos finales
const PREVIEW = 1000;   // lado largo de la vista previa del editor
const FORMATS = { '3:4': 3 / 4, '1:1': 1, '4:5': 4 / 5, original: null };
const BG_COLORS = { white: '#ffffff', grey: '#eceae6' };
const DEFAULTS = {
  auto: true, brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 35,
  bg: 'original', bgColor: '#f3dfd4', shadow: true, format: '3:4', rotate: 0,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { photos: [], sel: null, step: 'capturar', showOriginal: false };
let nextId = 1;

/* ===================== utilidades de imagen ===================== */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const ctx2d = (c) => c.getContext('2d');
const dims = (s) => [s.naturalWidth || s.videoWidth || s.width, s.naturalHeight || s.videoHeight || s.height];

function drawSmooth(ctx, src, ...args) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, ...args);
}

// Escala para que el lado largo mida `max` (reduce en pasos de 1/2 para que no se vea pixelado).
function scaled(src, max, allowUp = false) {
  const [w, h] = dims(src);
  let s = max / Math.max(w, h);
  if (!allowUp) s = Math.min(1, s);
  const tw = Math.round(w * s), th = Math.round(h * s);
  let cur = src, cw = w, ch = h;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const c = makeCanvas(cw / 2, ch / 2);
    drawSmooth(ctx2d(c), cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const out = makeCanvas(tw, th);
  drawSmooth(ctx2d(out), cur, 0, 0, tw, th);
  return out;
}

function rotate(src, deg) {
  deg = ((deg % 360) + 360) % 360;
  if (!deg) return src;
  const [w, h] = dims(src);
  const swap = deg === 90 || deg === 270;
  const c = makeCanvas(swap ? h : w, swap ? w : h);
  const x = ctx2d(c);
  x.translate(c.width / 2, c.height / 2);
  x.rotate((deg * Math.PI) / 180);
  x.drawImage(src, -w / 2, -h / 2);
  return c;
}

function copyCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

function cropCenter(src, ratio) {
  const { width: w, height: h } = src;
  let cw = w, ch = h;
  if (w / h > ratio) cw = h * ratio; else ch = w / ratio;
  const c = makeCanvas(cw, ch);
  ctx2d(c).drawImage(src, (w - c.width) / 2, (h - c.height) / 2, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (c, type = 'image/jpeg', q = 0.92) =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), type, q));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===================== mejora de la imagen ===================== */

// Estadísticas para la auto-mejora: niveles por canal (corrige luz y dominantes de color) y gamma.
function getStats(p, useCut) {
  const key = useCut ? 'c' : 'o';
  p.stats ||= {};
  if (p.stats[key]) return p.stats[key];
  const small = scaled(useCut ? p.cutout : p.src, 256);
  const d = ctx2d(small).getImageData(0, 0, small.width, small.height).data;
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; n++;
  }
  if (n < 50) return (p.stats[key] = null);
  const pct = (h, q) => {
    let acc = 0;
    const t = q * n;
    for (let v = 0; v < 256; v++) if ((acc += h[v]) >= t) return v;
    return 255;
  };
  const lo = hist.map((h) => pct(h, 0.005));
  const hi = hist.map((h) => pct(h, 0.995));
  const LLo = Math.min(...lo), LHi = Math.max(...hi);
  for (let c = 0; c < 3; c++) {
    // mezcla de estiramiento global y por canal: quita dominantes sin inventar colores
    // (con límite para no teñir la foto)
    lo[c] = Math.min(70, LLo + Math.min(18, (lo[c] - LLo) * 0.4));
    hi[c] = Math.max(160, LHi - Math.min(18, (LHi - hi[c]) * 0.4));
    if (hi[c] - lo[c] < 40) { lo[c] = 0; hi[c] = 255; }
  }
  // luminosidad media tras estirar → gamma suave hacia un punto medio agradable
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = Math.min(1, Math.max(0, (d[i] - lo[0]) / (hi[0] - lo[0])));
    const g = Math.min(1, Math.max(0, (d[i + 1] - lo[1]) / (hi[1] - lo[1])));
    const b = Math.min(1, Math.max(0, (d[i + 2] - lo[2]) / (hi[2] - lo[2])));
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const mean = Math.min(0.95, Math.max(0.05, sum / n));
  let gamma = Math.log(0.5) / Math.log(mean);
  gamma = Math.min(1.35, Math.max(0.7, gamma));
  gamma = 1 + (gamma - 1) * 0.6;
  return (p.stats[key] = { lo, hi, gamma });
}

function buildLUTs(s, st) {
  const luts = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const b = s.brightness / 100;
  const con = s.contrast / 100 + (s.auto ? 0.06 : 0);
  const cf = con >= 0 ? 1 + con * 1.1 : 1 + con * 0.75;
  const warm = (s.warmth / 100) * 0.09;
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      let x = v / 255;
      if (s.auto && st) {
        x = Math.min(1, Math.max(0, (v - st.lo[c]) / (st.hi[c] - st.lo[c])));
        x = Math.pow(x, st.gamma);
      }
      if (b > 0) x = 1 - Math.pow(1 - x, 1 + b * 1.5);
      else if (b < 0) x = Math.pow(x, 1 - b * 1.5);
      x = (x - 0.5) * cf + 0.5;
      if (c === 0) x += warm;
      if (c === 2) x -= warm;
      luts[c][v] = x * 255;
    }
  }
  return luts;
}

function adjust(src, s, st) {
  const c = copyCanvas(src);
  const x = ctx2d(c);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const [R, G, B] = buildLUTs(s, st);
  const sat = 1 + s.saturation / 100 + (s.auto ? 0.08 : 0);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = R[d[i]], g = G[d[i + 1]], b = B[d[i + 2]];
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Enfoque (máscara de enfoque con los 4 vecinos).
function sharpen(c, amount) {
  const k = amount * 0.22;
  if (k <= 0) return;
  const x = ctx2d(c);
  const { width: w, height: h } = c;
  const img = x.getImageData(0, 0, w, h);
  const s = img.data;
  const o = new Uint8ClampedArray(s);
  const row = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let xx = 1; xx < w - 1; xx++) {
      const i = y * row + xx * 4;
      if (s[i + 3] === 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        const j = i + ch;
        o[j] = s[j] + k * (4 * s[j] - s[j - 4] - s[j + 4] - s[j - row] - s[j + row]);
      }
    }
  }
  img.data.set(o);
  x.putImageData(img, 0, 0);
}

// Caja que ocupa la prenda (píxeles no transparentes).
function bbox(c) {
  const { width: w, height: h } = c;
  const d = ctx2d(c).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (d[(y * w + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  return { x: x0, y: y0, w: Math.min(w, x1 + 2) - x0, h: Math.min(h, y1 + 2) - y0 };
}

function source(p, useCut, size) {
  const key = `${useCut ? 'c' : 'o'}|${p.s.rotate}|${size}`;
  p.cache ||= new Map();
  if (!p.cache.has(key)) {
    if (p.cache.size > 6) p.cache.clear();
    p.cache.set(key, rotate(scaled(useCut ? p.cutout : p.src, size, true), p.s.rotate));
  }
  return p.cache.get(key);
}

function paintBackground(x, W, H, p, s, size) {
  if (s.bg === 'blur') {
    const src = source(p, false, size);
    const tiny = makeCanvas(Math.max(8, W / 28), Math.max(8, H / 28));
    const tx = ctx2d(tiny);
    const sc = Math.max(tiny.width / src.width, tiny.height / src.height);
    drawSmooth(tx, src, (tiny.width - src.width * sc) / 2, (tiny.height - src.height * sc) / 2, src.width * sc, src.height * sc);
    drawSmooth(x, tiny, 0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.fillRect(0, 0, W, H);
  } else {
    x.fillStyle = s.bg === 'color' ? s.bgColor : BG_COLORS[s.bg] || '#fff';
    x.fillRect(0, 0, W, H);
  }
}

// Genera la foto final (o la vista previa) de una foto con sus ajustes.
function render(p, size, original = false) {
  const s = original ? { ...DEFAULTS, format: p.s.format, rotate: p.s.rotate, auto: false, sharpness: 0 } : p.s;
  const useCut = !original && s.bg !== 'original' && !!p.cutout;
  const src = source(p, useCut, size);
  const subj = original ? copyCanvas(src) : adjust(src, s, getStats(p, useCut));
  const ratio = FORMATS[s.format];
  let out;
  if (!useCut) {
    out = ratio ? cropCenter(subj, ratio) : subj;
  } else {
    const r = ratio || subj.width / subj.height;
    const W = Math.round(r >= 1 ? size : size * r), H = Math.round(r >= 1 ? size / r : size);
    out = makeCanvas(W, H);
    const x = ctx2d(out);
    paintBackground(x, W, H, p, s, size);
    let sc = W / subj.width, dx = 0, dy = 0;
    if (ratio) {
      // centra la prenda dejando un margen
      const bb = bbox(subj), m = 0.07;
      sc = Math.min((W * (1 - 2 * m)) / bb.w, (H * (1 - 2 * m)) / bb.h);
      dx = W / 2 - (bb.x + bb.w / 2) * sc;
      dy = H / 2 - (bb.y + bb.h / 2) * sc;
    }
    x.save();
    if (s.shadow && s.bg !== 'blur') {
      x.shadowColor = 'rgba(0,0,0,.26)';
      x.shadowBlur = W * 0.03;
      x.shadowOffsetY = W * 0.012;
    }
    drawSmooth(x, subj, dx, dy, subj.width * sc, subj.height * sc);
    x.restore();
  }
  if (Math.max(out.width, out.height) !== size) out = scaled(out, size, true);
  if (!original && s.sharpness > 0) sharpen(out, s.sharpness / 100);
  return out;
}

/* ===================== quitar fondo (IA en el navegador) ===================== */

let bgModule = null;
let cutQueue = Promise.resolve();
let bgStatus = '';

function ensureCutout(p) {
  if (p.cutout) return Promise.resolve();
  if (p.cutJob) return p.cutJob;
  p.cutting = true;
  updateBusy();
  p.cutJob = cutQueue = cutQueue.then(async () => {
    try {
      if (!state.photos.includes(p)) return;
      bgModule ||= import('./vendor/background-removal.mjs');
      const { removeBackground } = await bgModule;
      bgStatus = 'Recortando la prenda…';
      updateBusy();
      const input = await toBlob(p.src, 'image/jpeg', 0.95);
      const result = await removeBackground(input, {
        model: 'isnet_quint8',
        output: { format: 'image/png' },
        progress: (key, cur, total) => {
          if (key.startsWith('fetch') && total) {
            bgStatus = `Descargando la IA de recorte… ${Math.round((cur / total) * 100)}%`;
          } else {
            bgStatus = 'Recortando la prenda…';
          }
          updateBusy();
        },
      });
      const img = await loadImage(result);
      p.cutout = makeCanvas(p.src.width, p.src.height);
      drawSmooth(ctx2d(p.cutout), img, 0, 0, p.cutout.width, p.cutout.height);
      p.cache?.clear();
      if (p.stats) p.stats.c = undefined;
    } catch (err) {
      console.error(err);
      toast('No se pudo quitar el fondo. Revisa la conexión e inténtalo otra vez.');
      p.s.bg = 'original';
      if (p === state.sel) syncControls();
    } finally {
      p.cutting = false;
      p.cutJob = null;
      p.out = null;
      updateBusy();
      if (p === state.sel) schedulePreview();
    }
  });
  return p.cutJob;
}

function updateBusy() {
  const p = state.sel;
  const pending = state.photos.filter((x) => x.cutting).length;
  const show = state.step === 'mejorar' && p && p.cutting;
  $('#busy').hidden = !show;
  if (show) {
    $('#busyText').textContent = (bgStatus || 'Preparando…') + (pending > 1 ? ` (quedan ${pending} fotos)` : '');
  }
}

/* ===================== fotos ===================== */

async function addPhoto(blob) {
  try {
    const img = await loadImage(blob);
    const src = scaled(img, MAX_SRC);
    const thumb = scaled(src, 240).toDataURL('image/jpeg', 0.8);
    const p = { id: nextId++, src, thumb, cutout: null, s: { ...DEFAULTS } };
    state.photos.push(p);
    if (!state.sel) state.sel = p;
    renderStrips();
  } catch (e) {
    console.error(e);
    toast('No se pudo abrir esa imagen.');
  }
}

function removePhoto(p) {
  const i = state.photos.indexOf(p);
  if (i < 0) return;
  state.photos.splice(i, 1);
  if (state.sel === p) state.sel = state.photos[Math.min(i, state.photos.length - 1)] || null;
  renderStrips();
  if (!state.photos.length && state.step !== 'capturar') go('capturar');
  else if (state.step === 'mejorar') { syncControls(); schedulePreview(); }
  else if (state.step === 'publicar') buildFinals();
}

function thumbEl(p, i, { removable = false, onClick } = {}) {
  const b = document.createElement('div');
  b.className = 'thumb' + (p === state.sel && state.step === 'mejorar' ? ' sel' : '');
  b.role = 'button';
  b.tabIndex = 0;
  b.innerHTML = `<img src="${p.thumb}" alt="Foto ${i + 1}">` + (i === 0 ? '<span class="tag">Portada</span>' : '');
  if (removable) {
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.ariaLabel = 'Quitar foto';
    x.onclick = (e) => { e.stopPropagation(); removePhoto(p); };
    b.append(x);
  }
  if (onClick) b.onclick = onClick;
  return b;
}

function renderStrips() {
  const n = state.photos.length;
  $('#count').textContent = `(${n})`;
  $('#toEdit').disabled = !n;
  $$('.step').forEach((b) => { if (b.dataset.step !== 'capturar') b.disabled = !n; });
  $('#toEdit').textContent = n ? `Listo, mejorar ${n} foto${n > 1 ? 's' : ''} →` : 'Listo, mejorar fotos →';

  const cs = $('#captureStrip');
  cs.innerHTML = n ? '' : '<p class="empty">Aún no hay fotos. La primera será la portada del anuncio.</p>';
  state.photos.forEach((p, i) => cs.append(thumbEl(p, i, { removable: true })));
  cs.scrollLeft = cs.scrollWidth;

  const es = $('#editStrip');
  es.innerHTML = '';
  state.photos.forEach((p, i) =>
    es.append(thumbEl(p, i, { onClick: () => { state.sel = p; renderStrips(); syncControls(); schedulePreview(); updateBusy(); } })),
  );
}

/* ===================== cámara ===================== */

const video = $('#video');
let stream = null, track = null, facing = 'environment', torchOn = false, camWanted = false;

// Si el navegador no deja usar la cámara dentro de la página (archivo abierto en el móvil, página sin https,
// navegador de otra app…), el botón abre directamente la cámara del móvil.
let camMode = window.isSecureContext && navigator.mediaDevices?.getUserMedia ? 'live' : 'native';

function setNativeMode() {
  camMode = 'native';
  camWanted = false;
  $('#camMsg').textContent = 'Haz la foto con la cámara de tu móvil: al hacerla, vuelve aquí automáticamente.';
  $('#startCam').textContent = state.photos.length ? '📷 Hacer otra foto' : '📷 Abrir cámara';
  $('#camHint').textContent = 'Puedes repetirlo las veces que quieras';
}

function openCamera() {
  if (camMode === 'native') $('#nativeCam').click();
  else startCamera();
}

async function startCamera() {
  stopCamera();
  camWanted = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } },
      audio: false,
    });
  } catch (e) {
    console.error(e);
    setNativeMode();
    // abre la cámara del móvil directamente (si el navegador lo permite sin otro toque)
    try { $('#nativeCam').click(); } catch {}
    return;
  }
  video.srcObject = stream;
  video.style.transform = facing === 'user' ? 'scaleX(-1)' : '';
  await video.play().catch(() => {});
  track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  $('#torch').hidden = !caps.torch;
  torchOn = false;
  $('#torch').classList.remove('on');
  $('#camera').classList.add('live');
  $('#camOff').hidden = true;
  $('#camControls').hidden = false;
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = track = null;
  video.srcObject = null;
  $('#camera').classList.remove('live');
  $('#camOff').hidden = false;
  $('#camControls').hidden = true;
}

async function capture() {
  if (!track || !video.videoWidth) return;
  const f = $('#flash');
  f.classList.add('go');
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('go')));
  if (navigator.vibrate) navigator.vibrate(30);
  let blob = null;
  // ImageCapture saca la foto a resolución completa del sensor (Chrome/Android)
  if ('ImageCapture' in window && facing === 'environment') {
    try {
      blob = await Promise.race([new ImageCapture(track).takePhoto(), sleep(4000).then(() => null)]);
    } catch { blob = null; }
  }
  if (!blob) {
    const c = makeCanvas(video.videoWidth, video.videoHeight);
    const x = ctx2d(c);
    if (facing === 'user') { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(video, 0, 0);
    blob = await toBlob(c, 'image/jpeg', 0.95);
  }
  await addPhoto(blob);
}

/* ===================== editor ===================== */

let previewQueued = false;
function schedulePreview() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    drawPreview();
  });
}

function drawPreview() {
  const p = state.sel;
  const cv = $('#preview');
  if (!p || state.step !== 'mejorar') return;
  const out = render(p, PREVIEW, state.showOriginal);
  cv.width = out.width;
  cv.height = out.height;
  ctx2d(cv).drawImage(out, 0, 0);
}

function syncControls() {
  const p = state.sel;
  if (!p) return;
  const s = p.s;
  $('#auto').checked = s.auto;
  $$('.slider input').forEach((r) => (r.value = s[r.dataset.k]));
  $$('#bgChips button').forEach((b) => b.classList.toggle('on', b.dataset.bg === s.bg));
  $$('#fmtChips button').forEach((b) => b.classList.toggle('on', b.dataset.fmt === s.format));
  $('#bgExtra').hidden = s.bg === 'original';
  $('#bgColor').value = s.bgColor;
  $('#bgSwatch').style.background = s.bgColor;
  $('#shadow').checked = s.shadow;
  $('#shadow').closest('label').hidden = s.bg === 'blur';
  $('#bgColor').closest('label').hidden = s.bg !== 'color';
}

function changed(fn) {
  const p = state.sel;
  if (!p) return;
  fn(p.s, p);
  p.out = null;
  syncControls();
  schedulePreview();
}

function setBg(bg) {
  changed((s, p) => {
    s.bg = bg;
    if (bg !== 'original' && !p.cutout) ensureCutout(p);
  });
}

/* ===================== publicar ===================== */

let buildToken = 0;
async function buildFinals() {
  const token = ++buildToken;
  const box = $('#finals');
  box.innerHTML = '';
  const n = state.photos.length;
  state.photos.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'final' + (p.out ? '' : ' loading');
    el.innerHTML = `<img alt="Foto ${i + 1}" src="${p.out?.url || p.thumb}">` +
      (i === 0 ? '<span class="tag">Portada</span>' : '') +
      `<div class="bar"><button data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="Mover antes">◀</button>` +
      `<span class="n">${i + 1}/${n}</span>` +
      `<button data-mv="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Mover después">▶</button></div>`;
    el.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => move(p, Number(b.dataset.mv))));
    el.querySelector('img').onclick = () => p.out && downloadOne(p, i);
    p.el = el;
    box.append(el);
  });
  for (const p of state.photos) {
    if (token !== buildToken) return;
    if (p.cutJob) await p.cutJob;
    if (!p.out) {
      await nextFrame();
      if (token !== buildToken) return;
      const blob = await toBlob(render(p, EXPORT), 'image/jpeg', 0.92);
      p.out = { blob, url: URL.createObjectURL(blob) };
    }
    p.el.classList.remove('loading');
    p.el.querySelector('img').src = p.out.url;
  }
}

function move(p, dir) {
  const i = state.photos.indexOf(p), j = i + dir;
  if (j < 0 || j >= state.photos.length) return;
  [state.photos[i], state.photos[j]] = [state.photos[j], state.photos[i]];
  renderStrips();
  buildFinals();
}

async function readyFiles() {
  await buildFinals();
  return state.photos.filter((p) => p.out).map((p, i) => new File([p.out.blob], `foto-${i + 1}.jpg`, { type: 'image/jpeg' }));
}

function downloadOne(p, i) {
  const a = document.createElement('a');
  a.href = p.out.url;
  a.download = `foto-${i + 1}.jpg`;
  document.body.append(a);
  a.click();
  a.remove();
}

async function downloadAll() {
  await readyFiles();
  for (const [i, p] of state.photos.entries()) {
    downloadOne(p, i);
    await sleep(350);
  }
  toast('Fotos descargadas');
}

async function shareAll() {
  const files = await readyFiles();
  if (!files.length) return;
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: 'Fotos del artículo' });
    } catch (e) {
      if (e.name !== 'AbortError') toast('No se pudo compartir. Prueba "Descargar todas".');
    }
  } else {
    toast('Tu navegador no permite compartir fotos: las descargo.');
    downloadAll();
  }
}

/* ===================== descripción ===================== */

function buildText() {
  const v = (id) => $(id).value.trim();
  const que = v('#dQue'), marca = v('#dMarca'), talla = v('#dTalla'), color = v('#dColor');
  const estado = v('#dEstado'), medidas = v('#dMedidas'), notas = v('#dNotas');
  const title = [que, marca, talla && `talla ${talla}`, color.toLowerCase()].filter(Boolean).join(' ');
  const lines = [];
  const head = [que, marca && `de ${marca}`].filter(Boolean).join(' ');
  if (head || talla) lines.push(`${head || 'Prenda'}${talla ? `, talla ${talla}` : ''}.`);
  if (color) lines.push(`🎨 Color: ${color}`);
  lines.push(`✅ Estado: ${estado}`);
  if (medidas) lines.push(`📏 Medidas: ${medidas}`);
  if (notas) lines.push(`ℹ️ ${notas}`);
  lines.push('', '📦 Envío rápido y bien empaquetado.', '💬 Pregúntame cualquier duda, ¡acepto ofertas razonables!');
  $('#outTitle').value = title || '—';
  $('#outDesc').value = lines.join('\n');
}

/* ===================== navegación ===================== */

function go(step) {
  if (step !== 'capturar' && !state.photos.length) return;
  state.step = step;
  $$('.panel').forEach((s) => s.classList.toggle('active', s.id === step));
  $$('.step').forEach((b) => b.classList.toggle('active', b.dataset.step === step));
  if (step === 'capturar') {
    if (camWanted && !stream) startCamera();
  } else if (stream) {
    stopCamera();
    camWanted = true;
  }
  if (step === 'mejorar') {
    if (!state.photos.includes(state.sel)) state.sel = state.photos[0];
    renderStrips();
    syncControls();
    schedulePreview();
  }
  if (step === 'publicar') buildFinals();
  updateBusy();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

/* ===================== eventos ===================== */

$$('.step').forEach((b) => (b.onclick = () => go(b.dataset.step)));
$('#toEdit').onclick = () => go('mejorar');
$('#toPublish').onclick = () => go('publicar');

$('#startCam').onclick = openCamera;
if (camMode === 'native') setNativeMode();
$('#shutter').onclick = capture;
$('#flip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; startCamera(); };
$('#torch').onclick = async () => {
  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    $('#torch').classList.toggle('on', torchOn);
  } catch { toast('No se pudo encender la linterna'); }
};
for (const id of ['#nativeCam', '#gallery']) {
  $(id).onchange = async (e) => {
    for (const f of e.target.files) await addPhoto(f);
    e.target.value = '';
    if (camMode === 'native') setNativeMode();
  };
}

$$('.slider input').forEach((r) => (r.oninput = () => changed((s) => (s[r.dataset.k] = Number(r.value)))));
$('#auto').onchange = (e) => changed((s) => (s.auto = e.target.checked));
$$('#bgChips button').forEach((b) => (b.onclick = () => setBg(b.dataset.bg)));
$('#bgColor').oninput = (e) => changed((s) => { s.bgColor = e.target.value; s.bg = 'color'; });
$('#shadow').onchange = (e) => changed((s) => (s.shadow = e.target.checked));
$$('#fmtChips button').forEach((b) => (b.onclick = () => changed((s) => (s.format = b.dataset.fmt))));
$('#rotL').onclick = () => changed((s) => (s.rotate = (s.rotate + 270) % 360));
$('#rotR').onclick = () => changed((s) => (s.rotate = (s.rotate + 90) % 360));
$('#delPhoto').onclick = () => state.sel && removePhoto(state.sel);
$('#reset').onclick = () => changed((s, p) => (p.s = { ...DEFAULTS, rotate: s.rotate }));
$('#applyAll').onclick = () => {
  const { rotate, ...rest } = state.sel.s;
  for (const p of state.photos) {
    if (p === state.sel) continue;
    p.s = { ...p.s, ...rest };
    p.out = null;
    if (p.s.bg !== 'original') ensureCutout(p);
  }
  toast(`Ajustes aplicados a ${state.photos.length} fotos`);
};

const cmp = $('#compare');
const showOrig = (on) => (e) => {
  if (e.cancelable) e.preventDefault();
  if (state.showOriginal === on) return;
  state.showOriginal = on;
  cmp.textContent = on ? 'Original' : 'Mantén para ver el original';
  schedulePreview();
};
for (const el of [cmp, $('#preview')]) {
  el.addEventListener('pointerdown', showOrig(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, showOrig(false));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

$('#share').onclick = shareAll;
$('#download').onclick = downloadAll;

const country = $('#vintedCountry');
try { country.value = localStorage.getItem('fv-country') || 'es'; } catch {}
const updateVinted = () => {
  $('#goVinted').href = `https://www.vinted.${country.value}/items/new`;
  try { localStorage.setItem('fv-country', country.value); } catch {}
};
country.onchange = updateVinted;
updateVinted();

$$('.form input, .form select').forEach((el) => (el.oninput = buildText));
buildText();
$$('[data-copy]').forEach((b) => (b.onclick = async () => {
  try {
    await navigator.clipboard.writeText($('#' + b.dataset.copy).value);
    toast('Copiado ✔');
  } catch { toast('No se pudo copiar'); }
}));

$('#newItem').onclick = () => {
  if (!confirm('¿Empezar otro artículo? Se quitarán las fotos actuales.')) return;
  state.photos.forEach((p) => p.out && URL.revokeObjectURL(p.out.url));
  state.photos = [];
  state.sel = null;
  $$('.form input').forEach((i) => (i.value = ''));
  buildText();
  renderStrips();
  go('capturar');
};

window.addEventListener('beforeunload', (e) => {
  if (state.photos.length) e.preventDefault();
});

// Para pruebas automáticas
window.__fotovende = { state, addPhoto, render, go };
