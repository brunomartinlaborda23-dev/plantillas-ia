// Modelos 3D propios (.glb / .gltf) para los coches del jugador.
// Dos fuentes, la segunda manda:
//   1. www/models/models.json  → modelos incluidos con el juego: { "rs": { "file": "rs.glb", "flip": false } }
//   2. Archivos que el jugador carga desde el garaje (se guardan en el navegador con IndexedDB).
// Cualquier modelo se adapta solo: se orienta a lo largo, se escala al largo real del coche, se apoya
// en el suelo, se detectan las ruedas (para que giren) y la pintura (para el color del jugador).
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { DRACOLoader } from '../vendor/DRACOLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';
import { CARS } from './specs.js';

const templates = {}; // clave del coche -> { root, info, wheelCenters, recolor }
const versions = {};
const listeners = new Set();
export const onModelsChanged = (fn) => listeners.add(fn);
const notify = (key) => { versions[key] = (versions[key] || 0) + 1; listeners.forEach(fn => fn(key)); };

export const getTemplate = (key) => templates[key] || null;
export const modelVersion = (key) => versions[key] || 0;
export const modelInfo = (key) => templates[key]?.info || null;

let loader = null;
function gltfLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath('vendor/draco/');
  draco.setDecoderConfig({ type: 'js' }); // sin WebAssembly: funciona también en visores restringidos
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

// ---------- Almacenamiento en el navegador ----------
const DB_NAME = 'parkingpro_models', STORE = 'models';
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbDo(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
const dbGet = (k) => dbDo('readonly', s => s.get(k));
const dbPut = (k, v) => dbDo('readwrite', s => s.put(v, k));
const dbDel = (k) => dbDo('readwrite', s => s.delete(k));
const dbKeys = () => dbDo('readonly', s => s.getAllKeys());

// ---------- Análisis del modelo ----------
const RE = {
  wheel: /(wheel|tire|tyre|rim|rueda|llanta|neum|whl|brake.?disc|caliper)/i,
  notWheel: /(steering|volante|spare|repuesto)/i,
  tire: /(tire|tyre|neum|rubber|goma)/i,
  rim: /(rim|llanta|wheel|alloy)/i,
  paint: /(paint|carpaint|car_paint|exterior|chassis|carroc|pintura|shell|coat|body)/i,
  glass: /(glass|window|vidrio|cristal|windshield|windscreen|luna)/i,
  brake: /(tail|brake.?light|stop|rear.?light|taillight|piloto|backlight)/i,
};
const fullName = (o) => {
  const parts = [];
  for (let p = o; p; p = p.parent) parts.push(p.name || '');
  return parts.join(' ');
};
const matsOf = (m) => (Array.isArray(m.material) ? m.material : [m.material]);
const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

function triangleArea(geo) {
  const p = geo.attributes.position;
  if (!p) return 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const idx = geo.index;
  const n = idx ? idx.count : p.count;
  let area = 0;
  // Muestreo: con modelos enormes basta una parte de los triángulos para comparar.
  const step = Math.max(3, Math.floor(n / 30000) * 3);
  for (let i = 0; i + 2 < n; i += step) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area * (step / 3);
}

// +1 si los faros están hacia +Z (o los pilotos hacia -Z), -1 si al revés, 0 si no se sabe.
const RE_HEAD = /(head.?light|headlamp|front.?light|faro|luz.?delant)/i;
function frontSign(scene, center) {
  const head = [], tail = [];
  const box = new THREE.Box3(), c = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.isMesh) return;
    for (const m of matsOf(o)) {
      const name = m.name + ' ' + fullName(o);
      const e = m.emissive && m.emissiveIntensity > 0 ? m.emissive : null;
      const isTail = RE.brake.test(name) || (e && e.r > 0.3 && e.r > e.g * 2);
      const isHead = RE_HEAD.test(name) || (e && !isTail && luminance(e) > 0.3);
      if (!isTail && !isHead) continue;
      box.setFromObject(o).getCenter(c);
      (isTail ? tail : head).push(c.z - center.z);
    }
  });
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  let score = 0;
  if (head.length) score += Math.sign(avg(head));
  if (tail.length) score -= Math.sign(avg(tail));
  return Math.sign(score);
}

function prepare(scene, key, flip, sourceName) {
  const spec = CARS[key];
  const root = new THREE.Group();
  root.add(scene);
  const box = new THREE.Box3();
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  const measure = () => { root.updateMatrixWorld(true); box.setFromObject(scene); box.getSize(size); box.getCenter(center); };

  // Largo a lo largo del eje Z (en glTF el frente mira a +Z, igual que en el juego).
  measure();
  if (size.x > size.z * 1.15) scene.rotation.y += Math.PI / 2;
  measure();
  // ¿Hacia dónde está el morro? Los faros (luces blancas) van delante y los pilotos (rojos) detrás.
  const front = frontSign(scene, center);
  let autoFlipped = false;
  if (front < 0) { scene.rotation.y += Math.PI; autoFlipped = true; }
  if (flip) scene.rotation.y += Math.PI;
  measure();
  scene.scale.multiplyScalar(spec.l / Math.max(size.z, 1e-6));
  measure();
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;
  measure();
  const W = size.x, L = size.z, H = size.y;

  const meshes = [];
  scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  let triangles = 0;
  const mbox = new THREE.Box3(), msize = new THREE.Vector3(), mcenter = new THREE.Vector3();

  // Ruedas: primero por nombre; si no hay, por forma (piezas redondas, bajas y en las esquinas).
  const wheelOf = new Map();
  const quadrant = (c) => (c.z > 0 ? 'F' : 'R') + (c.x > 0 ? 'L' : 'R');
  const byName = [], byShape = [];
  for (const m of meshes) {
    const g = m.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    mbox.setFromObject(m); mbox.getSize(msize); mbox.getCenter(mcenter);
    if (msize.z > L * 0.45 || msize.x > W * 0.6) continue; // pieza que abarca varias ruedas: no se puede girar
    const name = fullName(m) + ' ' + matsOf(m).map(x => x.name).join(' ');
    const round = Math.abs(msize.y - msize.z) < 0.35 * Math.max(msize.y, msize.z);
    const low = mbox.min.y < H * 0.12 && msize.y < H * 0.6;
    const corner = Math.abs(mcenter.x) > W * 0.2 && Math.abs(mcenter.z) > L * 0.15;
    if (RE.wheel.test(name) && !RE.notWheel.test(name) && corner) byName.push([m, quadrant(mcenter)]);
    else if (round && low && corner) byShape.push([m, quadrant(mcenter)]);
  }
  for (const [m, q] of (byName.length ? byName : byShape)) wheelOf.set(m, q);

  const wheelCenters = {};
  for (const q of ['FL', 'FR', 'RL', 'RR']) {
    const parts = [...wheelOf].filter(([, p]) => p === q).map(([m]) => m);
    if (!parts.length) continue;
    const u = new THREE.Box3();
    parts.forEach(m => u.expandByObject(m));
    wheelCenters[q] = u.getCenter(new THREE.Vector3());
    parts.forEach(m => { m.userData.wheel = q; });
  }

  // Materiales: pintura, cristal, pilotos y llantas.
  const area = new Map();
  for (const m of meshes) {
    const isWheel = wheelOf.has(m);
    for (const mat of matsOf(m)) {
      const name = mat.name + ' ' + fullName(m);
      mat.userData.role = mat.userData.role || null;
      if (RE.glass.test(name) || (mat.transparent && mat.opacity < 0.9)) mat.userData.role = 'glass';
      else if (RE.brake.test(name)) mat.userData.role = 'brake';
      else if (isWheel) {
        if (RE.rim.test(name) && !RE.tire.test(name) && luminance(mat.color || new THREE.Color(0)) > 0.12) mat.userData.role = 'rim';
      } else if (RE.paint.test(mat.name)) mat.userData.role = 'paint';
      if (!isWheel && mat.userData.role !== 'glass' && mat.userData.role !== 'brake') {
        area.set(mat, (area.get(mat) || 0) + triangleArea(m.geometry) * Math.abs(m.matrixWorld.determinant()) ** (2 / 3));
      }
    }
    m.castShadow = true;
    m.receiveShadow = true;
  }
  // Sin material de pintura con nombre: la pintura es el material que más superficie cubre.
  let paintFound = [...area.keys()].some(m => m.userData.role === 'paint');
  if (!paintFound) {
    const best = [...area].filter(([m]) => m.color && luminance(m.color) > 0.04).sort((a, b) => b[1] - a[1])[0];
    if (best) { best[0].userData.role = 'paint'; paintFound = true; }
  }

  const count = (role) => {
    const set = new Set();
    meshes.forEach(m => matsOf(m).forEach(x => { if (x.userData.role === role) set.add(x); }));
    return set.size;
  };
  return {
    root,
    wheelCenters,
    info: {
      name: sourceName, triangles: Math.round(triangles), wheels: Object.keys(wheelCenters).length,
      paint: paintFound, rims: count('rim') > 0, brake: count('brake') > 0, flip: !!flip, autoFlipped, front,
      size: { w: +W.toFixed(2), l: +L.toFixed(2), h: +H.toFixed(2) },
    },
  };
}

async function parse(data, key, flip, name) {
  const gltf = await gltfLoader().parseAsync(data, '');
  return prepare(gltf.scene, key, flip, name);
}

// ---------- API ----------
export async function initCustomModels() {
  try {
    const res = await fetch('models/models.json');
    if (res.ok) {
      const manifest = await res.json();
      for (const [key, m] of Object.entries(manifest)) {
        if (!CARS[key] || !m.file) continue;
        try {
          const buf = await (await fetch(`models/${m.file}`)).arrayBuffer();
          templates[key] = await parse(buf, key, m.flip, m.file);
          templates[key].info.source = 'incluido';
          notify(key);
        } catch (e) { console.warn('No se pudo cargar el modelo', m.file, e); }
      }
    }
  } catch { /* sin modelos incluidos */ }
  try {
    for (const key of await dbKeys()) {
      const rec = await dbGet(key);
      if (!rec || !CARS[key]) continue;
      templates[key] = await parse(rec.data, key, rec.flip, rec.name);
      templates[key].info.source = 'archivo';
      notify(key);
    }
  } catch (e) { console.warn('Modelos guardados no disponibles', e); }
}

export async function setUserModel(key, file) {
  const data = await file.arrayBuffer();
  const t = await parse(data, key, false, file.name);
  t.info.source = 'archivo';
  templates[key] = t;
  try { await dbPut(key, { name: file.name, data, flip: false }); } catch { t.info.notSaved = true; }
  notify(key);
  return t.info;
}

export async function flipUserModel(key) {
  const rec = await dbGet(key).catch(() => null);
  if (!rec) return null;
  rec.flip = !rec.flip;
  await dbPut(key, rec);
  templates[key] = await parse(rec.data, key, rec.flip, rec.name);
  templates[key].info.source = 'archivo';
  notify(key);
  return templates[key].info;
}

export async function removeUserModel(key) {
  try { await dbDel(key); } catch { /* nada guardado */ }
  delete templates[key];
  notify(key);
}

// ---------- Construcción de un coche con el modelo propio ----------
let glow = null;
function glowTexture() {
  if (glow) return glow;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glow = new THREE.CanvasTexture(cv);
  return glow;
}

// opts: { color, rimColor, neonColor, height } (los colores ya resueltos desde el taller)
export function buildFromTemplate(key, opts) {
  const t = templates[key];
  const spec = CARS[key];
  const car = new THREE.Group();
  const body = new THREE.Group();
  car.add(body);
  const model = t.root.clone(true);
  body.add(model);

  const swap = new Map();
  const brakeMats = [];
  let paint = null;
  model.traverse(o => {
    if (!o.isMesh) return;
    const out = matsOf(o).map(m => {
      const role = m.userData.role;
      if (role !== 'paint' && role !== 'brake' && !(role === 'rim' && opts.rimColor)) return m;
      if (!swap.has(m)) {
        const c = m.clone();
        if (role === 'paint') { c.color.set(opts.color); paint = paint || c; }
        if (role === 'rim') c.color.set(opts.rimColor);
        if (role === 'brake' && c.emissive) { c.emissive.set(0xff1010); brakeMats.push(c); }
        swap.set(m, c);
      }
      return swap.get(m);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  body.position.y = opts.height || 0;

  // Ruedas: pivote (dirección) -> giro, en el centro de cada rueda detectada.
  car.updateMatrixWorld(true);
  const wheels = [], fronts = [];
  const byQuadrant = {};
  model.traverse(o => { if (o.isMesh && o.userData.wheel) (byQuadrant[o.userData.wheel] ||= []).push(o); });
  for (const [q, center] of Object.entries(t.wheelCenters)) {
    const pivot = new THREE.Group();
    pivot.position.copy(center);
    const spin = new THREE.Group();
    pivot.add(spin);
    car.add(pivot);
    car.updateMatrixWorld(true);
    for (const m of byQuadrant[q] || []) spin.attach(m);
    wheels.push(spin);
    if (q[0] === 'F') fronts.push(pivot);
  }

  if (opts.neonColor) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w * 1.7, spec.l * 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: opts.neonColor, map: glowTexture(), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    plane.position.y = 0.03;
    car.add(plane);
  }

  const dummy = new THREE.MeshStandardMaterial();
  car.userData = { spec, wheels, fronts, body, paint: paint || dummy, brakeMat: brakeMats[0] || dummy, brakeMats, revMat: new THREE.MeshStandardMaterial(), custom: true };
  return car;
}
