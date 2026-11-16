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

// En la versión con enlace (claude.ai) no hay cámara en vivo, ni IA de fondo, y las fotos se guardan con su botón.
const IN_ARTIFACT = !!window.FV_ARTIFACT;

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

function loadVia(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('img'));
    img.src = url;
  });
}

const readAsDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

// Comprueba que la imagen se puede dibujar y leer (algunos navegadores la "bloquean" al abrir la página como archivo).
function usable(src) {
  const [w, h] = dims(src);
  if (!w || !h) return false;
  const c = makeCanvas(1, 1);
  const x = ctx2d(c);
  x.drawImage(src, 0, 0, 1, 1);
  x.getImageData(0, 0, 1, 1);
  return true;
}

async function isHeic(blob) {
  if (/hei[cf]/i.test(blob.type) || /\.hei[cf]$/i.test(blob.name || '')) return true;
  const head = new TextDecoder().decode(await blob.slice(4, 12).arrayBuffer());
  return /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(head);
}

let heicModule = null;
async function heicToJpeg(blob) {
  heicModule ||= import('./vendor/heic2any.mjs');
  const heic2any = (await heicModule).default;
  const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.95 });
  return Array.isArray(out) ? out[0] : out;
}

// Abre una imagen probando varios métodos, porque cada móvil/navegador falla en uno distinto.
async function loadImage(blob, allowHeic = true) {
  const tries = [
    async () => {
      const url = URL.createObjectURL(blob);
      try { return await loadVia(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    },
    async () => createImageBitmap(blob, { imageOrientation: 'from-image' }),
    async () => createImageBitmap(blob),
    async () => loadVia(await readAsDataURL(blob)),
  ];
  for (const t of tries) {
    try {
      const img = await t();
      if (usable(img)) return img;
    } catch (e) {
      console.warn('loadImage', e);
    }
  }
  if (allowHeic && (await isHeic(blob))) return loadImage(await heicToJpeg(blob), false);
  throw new Error('formato');
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
    lo[c] = Math.min(25, LLo + Math.min(14, (lo[c] - LLo) * 0.4));
    hi[c] = Math.max(210, LHi - Math.min(14, (LHi - hi[c]) * 0.4));
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

// Balance de blancos: busca zonas casi grises/blancas de la foto (pared, suelo, etiqueta) y quita el tono.
function getWB(p) {
  if (p.wb) return p.wb;
  const small = scaled(p.src, 200);
  const d = ctx2d(small).getImageData(0, 0, small.width, small.height).data;
  let r = 0, g = 0, b = 0, n = 0, all = 0;
  for (let i = 0; i < d.length; i += 4) {
    all++;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx < 60 || mx > 250 || mx - mn > 45) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  if (n < all * 0.03) return (p.wb = [1, 1, 1]);
  const gray = (r + g + b) / 3;
  const k = (v) => Math.min(1.2, Math.max(0.85, gray / v));
  return (p.wb = [k(r), k(g), k(b)]);
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
        if (st.wb) x *= st.wb[c];
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

/* ---------- fondos de estudio (generados a la resolución exacta de cada foto) ---------- */

const STUDIOS = {
  'studio-white': { name: 'Estudio blanco', kind: 'sweep', wall: [247, 246, 243], floor: [231, 229, 225] },
  'studio-grey': { name: 'Estudio gris', kind: 'sweep', wall: [216, 216, 212], floor: [190, 190, 186] },
  'studio-sand': { name: 'Estudio arena', kind: 'sweep', wall: [238, 228, 213], floor: [218, 204, 184] },
  'studio-rose': { name: 'Estudio rosa', kind: 'sweep', wall: [245, 224, 218], floor: [229, 199, 191] },
  'studio-sky': { name: 'Estudio azul', kind: 'sweep', wall: [222, 231, 239], floor: [197, 211, 224] },
  'studio-dark': { name: 'Estudio oscuro', kind: 'sweep', wall: [58, 58, 62], floor: [40, 40, 44] },
  marble: { name: 'Mármol', kind: 'marble' },
  wood: { name: 'Madera', kind: 'wood' },
  linen: { name: 'Lino', kind: 'linen' },
};
const isSweep = (bg) => STUDIOS[bg]?.kind === 'sweep';

// ruido suave (value noise + fbm) para texturas naturales
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 5) {
  let sum = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, seed + o * 17); f *= 2; amp *= 0.5; }
  return sum / (1 - Math.pow(0.5, oct));
}

function studioTexture(kind, W, H) {
  // las texturas se calculan a ~1200 px y se amplían suavemente; el grano fino se añade luego a resolución completa
  const k = Math.min(1, 1200 / Math.max(W, H));
  const w = Math.max(16, Math.round(W * k)), h = Math.max(16, Math.round(H * k));
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  const img = x.createImageData(w, h);
  const d = img.data;
  const sc = 1 / Math.max(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const u = px * sc, v = py * sc, i = (py * w + px) * 4;
      let r, g, b;
      if (kind === 'marble') {
        const t = fbm(u * 5, v * 5, 3, 6);
        const vein = Math.abs(Math.sin((u * 2.2 + v * 3.1) * 6 + t * 9));
        const fine = Math.abs(Math.sin((u * 4.1 - v * 1.7) * 9 + fbm(u * 9, v * 9, 7, 5) * 7));
        const dark = Math.pow(1 - vein, 10) * 0.30 + Math.pow(1 - fine, 40) * 0.09;
        const cloud = (fbm(u * 2.5, v * 2.5, 11, 4) - 0.5) * 0.06;
        r = 243 - dark * 120 + cloud * 255; g = 241 - dark * 118 + cloud * 255; b = 237 - dark * 112 + cloud * 255;
      } else if (kind === 'wood') {
        const plank = Math.floor(u * 5.2);
        const tone = (hash2(plank, 1, 5) - 0.5) * 0.12;
        const grain = fbm(u * 60 + plank * 3.1, v * 4, 13 + plank, 5);
        const ring = Math.sin((u * 5.2 - plank) * 40 + grain * 10) * 0.5 + 0.5;
        const seam = Math.min(1, Math.abs((u * 5.2 - plank) - 0.5) * 2) > 0.985 ? 0.75 : 1;
        const lum = (0.86 + tone - ring * 0.06 - (grain - 0.5) * 0.12) * seam;
        r = 222 * lum; g = 190 * lum; b = 150 * lum;
      } else {
        // lino: trama fina de hilos + irregularidad
        const n = fbm(u * 30, v * 30, 21, 3) - 0.5;
        const warp = Math.sin(px * 1.9 + n * 3) * 0.5 + 0.5, weft = Math.sin(py * 1.9 + n * 3) * 0.5 + 0.5;
        const lum = 0.93 + (warp * weft - 0.25) * 0.08 + n * 0.04 + (fbm(u * 4, v * 4, 31, 3) - 0.5) * 0.025;
        r = 233 * lum; g = 225 * lum; b = 210 * lum;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

const studioCache = new Map();
function studioCanvas(bg, W, H) {
  const key = `${bg}|${W}|${H}`;
  if (studioCache.has(key)) return studioCache.get(key);
  const S = STUDIOS[bg];
  const c = makeCanvas(W, H);
  const x = ctx2d(c);
  if (S.kind === 'sweep') {
    // fondo infinito de estudio: pared, curva suave hacia el suelo, foco de luz y viñeta
    const img = x.createImageData(W, H);
    const d = img.data;
    const horizon = 0.66, soft = 0.16;
    const lx = W * 0.5, ly = H * 0.42, R = Math.hypot(W, H) * 0.62;
    for (let y = 0; y < H; y++) {
      const t = (y / H - (horizon - soft / 2)) / soft;
      const m = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      const br = S.wall[0] + (S.floor[0] - S.wall[0]) * m;
      const bgc = S.wall[1] + (S.floor[1] - S.wall[1]) * m;
      const bb = S.wall[2] + (S.floor[2] - S.wall[2]) * m;
      for (let xx = 0; xx < W; xx++) {
        const dist = Math.hypot(xx - lx, (y - ly) * 1.15) / R;
        const light = 1 + 0.055 * Math.max(0, 1 - dist * 1.6) - 0.11 * Math.pow(Math.min(1, dist), 2.2);
        const grain = (hash2(xx, y, 99) - 0.5) * 3;
        const i = (y * W + xx) * 4;
        d[i] = br * light + grain; d[i + 1] = bgc * light + grain; d[i + 2] = bb * light + grain; d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  } else {
    drawSmooth(x, studioTexture(S.kind, W, H), 0, 0, W, H);
    // luz suave de ventana desde arriba a la izquierda + grano fino
    const gr = x.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, Math.hypot(W, H) * 0.9);
    gr.addColorStop(0, 'rgba(255,255,255,.10)');
    gr.addColorStop(1, 'rgba(0,0,0,.10)');
    x.fillStyle = gr;
    x.fillRect(0, 0, W, H);
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const g = (hash2(j % W, (j / W) | 0, 77) - 0.5) * 4;
      d[i] += g; d[i + 1] += g; d[i + 2] += g;
    }
    x.putImageData(img, 0, 0);
  }
  if (studioCache.size > 5) studioCache.clear();
  studioCache.set(key, c);
  return c;
}

function studioSwatches() {
  for (const b of $$('[data-bg]')) {
    if (!STUDIOS[b.dataset.bg]) continue;
    const i = b.querySelector('i');
    if (i) i.style.backgroundImage = `url(${studioCanvas(b.dataset.bg, 64, 64).toDataURL()})`;
  }
}

function paintBackground(x, W, H, p, s, size) {
  if (STUDIOS[s.bg]) {
    x.drawImage(studioCanvas(s.bg, W, H), 0, 0);
    return;
  }
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
  const st = original ? null : getStats(p, false);
  const subj = original ? copyCanvas(src) : adjust(src, s, st && { ...st, wb: getWB(p) });
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
    const sweep = isSweep(s.bg);
    if (sweep) {
      // en un estudio la prenda se apoya en el suelo, con sombra de contacto
      const bb = bbox(subj), floorY = H * 0.885;
      sc = Math.min((W * 0.84) / bb.w, (H * 0.76) / bb.h);
      dx = W / 2 - (bb.x + bb.w / 2) * sc;
      dy = floorY - (bb.y + bb.h) * sc;
      const rx = bb.w * sc * 0.46, ry = H * 0.022;
      x.save();
      x.translate(W / 2, floorY);
      x.scale(1, ry / rx);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(0,0,0,.30)');
      g.addColorStop(0.6, 'rgba(0,0,0,.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(-rx, -rx, rx * 2, rx * 2);
      x.restore();
    } else if (ratio) {
      // centra la prenda dejando un margen
      const bb = bbox(subj), m = 0.07;
      sc = Math.min((W * (1 - 2 * m)) / bb.w, (H * (1 - 2 * m)) / bb.h);
      dx = W / 2 - (bb.x + bb.w / 2) * sc;
      dy = H / 2 - (bb.y + bb.h / 2) * sc;
    }
    x.save();
    if (s.shadow && s.bg !== 'blur') {
      x.shadowColor = sweep ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.26)';
      x.shadowBlur = W * (sweep ? 0.04 : 0.03);
      x.shadowOffsetY = W * (sweep ? 0.008 : 0.012);
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

// Versión enlace: la IA (modelo + motor) se publica junto a la página, en la carpeta ia/.
let iaSession = null;
function getIa(onProgress) {
  iaSession ||= (async () => {
    const base = new URL('ia/', document.baseURI).href;
    const ort = await import(base + 'ort.wasm.min.mjs');
    ort.env.wasm.wasmPaths = base;
    ort.env.wasm.numThreads = 1;
    const info = await (await fetch(base + 'modelo.json')).json();
    const buf = new Uint8Array(info.size);
    let off = 0;
    for (const name of info.chunks) {
      const r = await fetch(base + name);
      if (!r.ok) throw new Error('modelo ' + r.status);
      const part = new Uint8Array(await r.arrayBuffer());
      buf.set(part, off);
      off += part.length;
      onProgress(off / info.size);
    }
    const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session };
  })();
  iaSession.catch(() => (iaSession = null));
  return iaSession;
}

// Se queda solo con la prenda (las zonas grandes) y descarta manchitas sueltas del fondo.
function mainBlobs(m, R) {
  const S = R / 4, bin = new Uint8Array(S * S), lab = new Int32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) v = Math.max(v, m[(y * 4 + dy) * R + x * 4 + dx]);
    bin[y * S + x] = v > 0.5 ? 1 : 0;
  }
  const sizes = [0];
  const stack = [];
  for (let i = 0; i < S * S; i++) {
    if (!bin[i] || lab[i]) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(i);
    lab[i] = id;
    while (stack.length) {
      const q = stack.pop();
      size++;
      const x = q % S, y = (q / S) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const r = ny * S + nx;
        if (bin[r] && !lab[r]) { lab[r] = id; stack.push(r); }
      }
    }
    sizes.push(size);
  }
  const big = Math.max(...sizes);
  const keep = new Uint8Array(S * S);
  // dilata un poco lo que se queda para no cortar los bordes suaves
  for (let i = 0; i < S * S; i++) {
    if (!lab[i] || sizes[lab[i]] < big * 0.08) continue;
    const x = i % S, y = (i / S) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < S && ny < S) keep[ny * S + nx] = 1;
    }
  }
  if (big === 0) keep.fill(1);
  return keep;
}

async function cutoutLocal(src, onProgress) {
  const { ort, session } = await getIa(onProgress);
  bgStatus = 'Recortando la prenda…';
  updateBusy();
  await nextFrame();
  const R = 1024;
  const c = makeCanvas(R, R);
  drawSmooth(ctx2d(c), src, 0, 0, R, R);
  const d = ctx2d(c).getImageData(0, 0, R, R).data;
  const n = R * R;
  const f = new Float32Array(3 * n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    f[j] = (d[i] - 128) / 256;
    f[j + n] = (d[i + 1] - 128) / 256;
    f[j + 2 * n] = (d[i + 2] - 128) / 256;
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, R, R]) });
  const m = out[session.outputNames[0]].data;
  const mask = makeCanvas(R, R);
  const mx = ctx2d(mask);
  const md = mx.createImageData(R, R);
  const keep = mainBlobs(m, R);
  for (let j = 0; j < n; j++) {
    // curva suave: quita restos débiles del fondo y deja bordes limpios
    const t = Math.min(1, Math.max(0, (m[j] - 0.25) / 0.5));
    const k = keep[((j / R / 4) | 0) * (R / 4) + (((j % R) / 4) | 0)];
    md.data[j * 4 + 3] = k ? t * t * (3 - 2 * t) * 255 : 0;
  }
  mx.putImageData(md, 0, 0);
  const cut = copyCanvas(src);
  const cx = ctx2d(cut);
  cx.globalCompositeOperation = 'destination-in';
  drawSmooth(cx, mask, 0, 0, cut.width, cut.height);
  return cut;
}
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
      if (IN_ARTIFACT) {
        bgStatus = 'Preparando la IA de recorte…';
        updateBusy();
        p.cutout = await cutoutLocal(p.src, (f) => {
          bgStatus = `Preparando la IA de recorte (solo la 1ª vez)… ${Math.round(f * 100)}%`;
          updateBusy();
        });
        p.cache?.clear();
        if (p.stats) p.stats.c = undefined;
        return;
      }
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
    if (await isHeic(blob).catch(() => false)) toast('Convirtiendo foto HEIC…');
    const img = await loadImage(blob);
    const src = scaled(img, MAX_SRC);
    img.close?.();
    let thumb;
    try { thumb = scaled(src, 240).toDataURL('image/jpeg', 0.8); } catch { thumb = ''; }
    const p = { id: nextId++, src, thumb, cutout: null, s: { ...DEFAULTS } };
    state.photos.push(p);
    if (!state.sel) state.sel = p;
    renderStrips();
  } catch (e) {
    console.error(e);
    const kind = blob.type || (blob.name || '').split('.').pop() || 'desconocido';
    toast(`No se pudo abrir la imagen (${kind}). Prueba desde "Galería" o haz la foto otra vez.`);
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
let camMode = !IN_ARTIFACT && window.isSecureContext && navigator.mediaDevices?.getUserMedia ? 'live' : 'native';

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
  $$('#bgChips button, #studioChips button').forEach((b) => b.classList.toggle('on', b.dataset.bg === s.bg));
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

let savesApi;
const getSaves = () => (savesApi ||= window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null));

async function downloadOne(p, i) {
  if (IN_ARTIFACT) {
    const dl = await getSaves();
    if (!dl) { toast('Mantén el dedo sobre la foto y elige "Guardar imagen".'); return false; }
    try {
      await dl.save({ filename: `foto-${i + 1}.jpg`, data: p.out.blob });
      return true;
    } catch (e) {
      if (e?.code !== 'declined') toast('No se pudo guardar. Mantén el dedo sobre la foto y elige "Guardar imagen".');
      return false;
    }
  }
  const a = document.createElement('a');
  a.href = p.out.url;
  a.download = `foto-${i + 1}.jpg`;
  document.body.append(a);
  a.click();
  a.remove();
}

async function downloadAll() {
  await readyFiles();
  let n = 0;
  for (const [i, p] of state.photos.entries()) {
    if (IN_ARTIFACT) {
      if (await downloadOne(p, i)) n++;
      else if (i === 0) return;
    } else {
      downloadOne(p, i);
      n++;
      await sleep(350);
    }
  }
  if (n) toast(n === 1 ? 'Foto guardada' : `${n} fotos guardadas`);
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

/* ===================== sitios de venta ===================== */

const PLATFORMS = {
  vinted: {
    name: 'Vinted', format: '3:4', bg: 'studio-white',
    url: () => `https://www.vinted.${country.value}/items/new`,
    why: 'La app nº 1 para ropa de segunda mano en España y Europa. Sin comisión para quien vende.',
    fondo: 'Estudio blanco o claro, en vertical 3:4 (como se ve en la app).',
    tips: ['Portada: la prenda entera de frente, centrada.', 'Después: detrás, etiqueta, talla, detalles y defectos.', 'Título con lo que la gente busca: tipo + marca + talla.'],
    desc: 'Lista clara: marca, talla, estado, medidas y defectos.',
  },
  wallapop: {
    name: 'Wallapop', format: '1:1', bg: 'white',
    url: () => 'https://es.wallapop.com/app/catalog/upload',
    why: 'Muy usada en España; vende rápido en tu zona y con envío.',
    fondo: 'Fondo blanco, foto cuadrada para que se vea entera en el listado.',
    tips: ['Título corto: tipo + marca + talla.', 'Di si envías o entregas en mano y en qué zona.', 'Pon el precio un poco alto para dejar margen a ofertas.'],
    desc: 'Corta y directa, con forma de entrega.',
  },
  depop: {
    name: 'Depop', format: '1:1', bg: 'studio-rose',
    url: () => 'https://www.depop.com/products/create/',
    why: 'La favorita para vintage, streetwear y estilo Y2K; público joven.',
    fondo: 'Cuadrada con estudio de color suave (rosa, azul), mármol o madera: aquí se vende el estilo.',
    tips: ['Primera foto con estilo: puesta o con un fondo de color.', 'Usa hasta 5 hashtags (#vintage #y2k…).', 'Indica cómo queda: oversize, ajustada, largo…'],
    desc: 'Con estilo y hashtags al final.',
  },
  ebay: {
    name: 'eBay', format: '1:1', bg: 'white',
    url: () => 'https://www.ebay.es/sl/sell',
    why: 'Llega a compradores de toda Europa; bueno para marcas y piezas de valor.',
    fondo: 'Fondo blanco liso (lo que recomienda eBay) y foto grande y nítida.',
    tips: ['Título de hasta 80 caracteres con marca, tipo, talla, color y estado.', 'Rellena las "características del artículo".', 'Pon medidas exactas: evitan devoluciones.'],
    desc: 'Detallada y ordenada, con medidas.',
  },
};
let platform = 'vinted';
try { if (PLATFORMS[localStorage.getItem('fv-platform')]) platform = localStorage.getItem('fv-platform'); } catch {}

function renderPlatforms() {
  const P = PLATFORMS[platform];
  $$('[data-platform]').forEach((b) => b.classList.toggle('on', b.dataset.platform === platform));
  $('#platformTip').innerHTML = `<b>${P.name}:</b> ${P.fondo}`;
  const box = $('#sites');
  box.innerHTML = '';
  for (const [key, Q] of Object.entries(PLATFORMS)) {
    const el = document.createElement('article');
    el.className = 'site' + (key === platform ? ' on' : '');
    el.innerHTML = `<div class="site-head"><h4>${Q.name}</h4>${key === platform ? '<span class="pill">Elegido</span>' : ''}</div>
      <p class="why">${Q.why}</p>
      <dl><dt>Fondo y foto</dt><dd>${Q.fondo}</dd><dt>Descripción</dt><dd>${Q.desc}</dd></dl>
      <ul>${Q.tips.map((t) => `<li>${t}</li>`).join('')}</ul>
      <div class="site-actions"><button class="btn" data-use="${key}">${key === platform ? '✓ Fotos y texto preparados' : 'Preparar para ' + Q.name}</button>
      <a class="btn primary" href="${Q.url()}" target="_blank" rel="noopener">Abrir ${Q.name} ↗</a></div>`;
    el.querySelector('[data-use]').onclick = () => choosePlatform(key, true);
    box.append(el);
  }
  buildText();
}

function choosePlatform(key, apply) {
  platform = key;
  try { localStorage.setItem('fv-platform', key); } catch {}
  if (apply && state.photos.length) {
    const P = PLATFORMS[key];
    for (const p of state.photos) {
      p.s.format = P.format;
      p.s.bg = P.bg;
      if (P.bg === 'color') p.s.bgColor = '#f3dfd4';
      p.out = null;
      ensureCutout(p);
    }
    toast(`Fotos preparadas para ${P.name}`);
    syncControls();
    schedulePreview();
    if (state.step === 'publicar') buildFinals();
  }
  renderPlatforms();
}

/* ===================== descripción ===================== */

function buildText() {
  const v = (id) => $(id).value.trim();
  const que = v('#dQue'), marca = v('#dMarca'), talla = v('#dTalla'), color = v('#dColor');
  const estado = v('#dEstado'), medidas = v('#dMedidas'), notas = v('#dNotas');
  const head = [que, marca && `de ${marca}`].filter(Boolean).join(' ') || 'Prenda';
  const tag = (t) => '#' + t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  let title, lines;
  if (platform === 'ebay') {
    title = [marca, que, talla && `Talla ${talla}`, color, estado].filter(Boolean).join(' ').slice(0, 80);
    lines = [`${head}${talla ? ` – talla ${talla}` : ''}`, '', 'CARACTERÍSTICAS', `• Marca: ${marca || '—'}`, `• Talla: ${talla || '—'}`,
      `• Color: ${color || '—'}`, `• Estado: ${estado}`];
    if (medidas) lines.push(`• Medidas: ${medidas}`);
    if (notas) lines.push('', 'DETALLES', notas);
    lines.push('', 'ENVÍO', 'Envío en 24-48 h, bien empaquetado. Consulta cualquier duda antes de comprar.');
  } else if (platform === 'depop') {
    title = [marca, que, talla && `talla ${talla}`].filter(Boolean).join(' ');
    lines = [`✨ ${head}${color ? `, ${color.toLowerCase()}` : ''}${talla ? ` · talla ${talla}` : ''}`, `Estado: ${estado.toLowerCase()}`];
    if (medidas) lines.push(`📏 ${medidas}`);
    if (notas) lines.push(notas);
    lines.push('', 'Envío rápido 📦 ¡Pregunta lo que quieras!', '');
    const tags = [marca, que.split(' ')[0], color, 'vintage', 'secondhand'].filter(Boolean).map(tag).filter((t) => t.length > 1);
    lines.push([...new Set(tags)].slice(0, 5).join(' '));
  } else if (platform === 'wallapop') {
    title = [que, marca, talla && `T.${talla}`].filter(Boolean).join(' ');
    lines = [`${head}${talla ? `, talla ${talla}` : ''}${color ? `, color ${color.toLowerCase()}` : ''}. Estado: ${estado.toLowerCase()}.`];
    if (medidas) lines.push(`Medidas: ${medidas}.`);
    if (notas) lines.push(notas);
    lines.push('', 'Hago envíos 📦 y también entrego en mano. ¡Escríbeme sin compromiso!');
  } else {
    title = [que, marca, talla && `talla ${talla}`, color.toLowerCase()].filter(Boolean).join(' ');
    lines = [`${head}${talla ? `, talla ${talla}` : ''}.`];
    if (color) lines.push(`🎨 Color: ${color}`);
    lines.push(`✅ Estado: ${estado}`);
    if (medidas) lines.push(`📏 Medidas: ${medidas}`);
    if (notas) lines.push(`ℹ️ ${notas}`);
    lines.push('', '📦 Envío rápido y bien empaquetado.', '💬 Pregúntame cualquier duda, ¡acepto ofertas razonables!');
  }
  $('#outTitle').value = title || '—';
  $('#outDesc').value = lines.join('\n');
  $('#descFor').textContent = PLATFORMS[platform].name;
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
$$('#bgChips button, #studioChips button').forEach((b) => (b.onclick = () => setBg(b.dataset.bg)));
studioSwatches();
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

$$('#platformChips [data-platform]').forEach((b) => (b.onclick = () => choosePlatform(b.dataset.platform, true)));

$('#share').onclick = shareAll;
$('#download').onclick = downloadAll;

const country = $('#vintedCountry');
try { country.value = localStorage.getItem('fv-country') || 'es'; } catch {}
const updateVinted = () => {
  $('#goVinted').href = `https://www.vinted.${country.value}/items/new`;
  try { localStorage.setItem('fv-country', country.value); } catch {}
};
country.onchange = () => { updateVinted(); renderPlatforms(); };
updateVinted();

$$('.form input, .form select').forEach((el) => (el.oninput = buildText));
buildText();
$$('[data-copy]').forEach((b) => (b.onclick = async () => {
  try {
    await navigator.clipboard.writeText($('#' + b.dataset.copy).value);
    toast('Copiado ✔');
  } catch { toast('No se pudo copiar'); }
}));

let newItemArmed = null;
$('#newItem').onclick = () => {
  const btn = $('#newItem');
  if (state.photos.length && !newItemArmed) {
    btn.textContent = '¿Seguro? Toca otra vez para borrar estas fotos';
    newItemArmed = setTimeout(() => { newItemArmed = null; btn.textContent = '＋ Empezar otro artículo'; }, 4000);
    return;
  }
  clearTimeout(newItemArmed);
  newItemArmed = null;
  btn.textContent = '＋ Empezar otro artículo';
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

renderPlatforms();

if (IN_ARTIFACT) {
  $('#bgHint').textContent = 'La IA recorta la prenda (la 1ª vez carga ~57 MB, mejor con wifi)';
  $('#share').hidden = true;
  $('#download').classList.add('primary');
  $('#download').textContent = '⬇️ Guardar fotos';
  $('#finalsHint').textContent = 'Ordénalas con las flechas: la primera es la portada. Toca una foto para guardarla.';
  if ($$('.howto li')[0]) $$('.howto li')[0].innerHTML = 'Pulsa <b>Guardar fotos</b> y acepta cada una (o mantén el dedo sobre una foto → <i>Guardar imagen</i>).';
}

// Para pruebas automáticas
window.__fotovende = { state, addPhoto, render, go };
