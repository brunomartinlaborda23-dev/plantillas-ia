// Definición de niveles y del mapa de ciudad (datos puros, sin Three.js).
import { CARS } from './specs.js';

// Generador pseudoaleatorio con semilla (mulberry32): mismos niveles en cada partida.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARKED_MODELS = ['sedan', 'hatch', 'suv', 'sedan'];
const PARKED_COLORS = ['#b91c1c', '#1e3a8a', '#e5e7eb', '#111827', '#9ca3af', '#065f46', '#92400e', '#f59e0b', '#475569', '#7f1d1d'];

function make(name, par, start, bounds, hint, seed) {
  const lv = { name, par, start, bounds, hint, obstacles: [], lines: [], target: null, rand: rng(seed) };
  const { minX, maxX, minZ, maxZ } = bounds;
  addWall(lv, minX, minZ, maxX, minZ);
  addWall(lv, maxX, minZ, maxX, maxZ);
  addWall(lv, maxX, maxZ, minX, maxZ);
  addWall(lv, minX, maxZ, minX, minZ);
  return lv;
}

function addWall(lv, x1, z1, x2, z2, t = 0.4, h = 1.1) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  lv.obstacles.push({ type: 'wall', x: (x1 + x2) / 2, z: (z1 + z2) / 2, a: Math.atan2(dx, dz), hw: t / 2, hl: len / 2 + t / 2, h });
}

function addCar(lv, x, z, a) {
  const model = PARKED_MODELS[Math.floor(lv.rand() * PARKED_MODELS.length)];
  const color = PARKED_COLORS[Math.floor(lv.rand() * PARKED_COLORS.length)];
  const s = CARS[model];
  lv.obstacles.push({ type: 'car', model, color, x, z, a, hw: s.w / 2, hl: s.l / 2 });
}

const cone = (lv, x, z) => lv.obstacles.push({ type: 'cone', x, z, r: 0.25 });
const pillar = (lv, x, z, r = 0.35) => lv.obstacles.push({ type: 'pillar', x, z, r });

// Fila de plazas. Las plazas se colocan a lo largo de `dir` (por defecto, la derecha de la plaza).
// back: +1/-1 dibuja la línea del fondo hacia delante/atrás de la plaza, 0 no la dibuja.
function addRow(lv, { x, z, a = 0, count, spotW = 2.8, spotL = 5.6, step, dir, target = -1, empty = [], back = 1, fill = true, flip = true, fillRate = 1 }) {
  const u = dir || [Math.cos(a), -Math.sin(a)];
  const f = [Math.sin(a), Math.cos(a)];
  const s = step || spotW;
  for (let i = 0; i < count; i++) {
    const cx = x + u[0] * i * s, cz = z + u[1] * i * s;
    if (i === target) lv.target = { x: cx, z: cz, a, hw: spotW / 2, hl: spotL / 2 };
    else if (fill && !empty.includes(i) && lv.rand() < fillRate) addCar(lv, cx, cz, a + (flip && lv.rand() < 0.5 ? Math.PI : 0));
  }
  for (let i = 0; i <= count; i++) {
    const off = (i - 0.5) * s;
    lv.lines.push({ x: x + u[0] * off, z: z + u[1] * off, a, w: 0.12, l: spotL });
  }
  if (back) {
    const mid = (count - 1) / 2 * s;
    lv.lines.push({
      x: x + u[0] * mid + f[0] * back * spotL / 2,
      z: z + u[1] * mid + f[1] * back * spotL / 2,
      a: Math.atan2(u[0], u[1]), w: 0.12, l: count * s,
    });
  }
}

function buildLevels() {
  const L = [];
  let lv;

  // 1
  lv = make('Primeros pasos', 15, { x: 0, z: 0, a: 0 }, { minX: -15, maxX: 15, minZ: -8, maxZ: 26 },
    'Conduce hasta la plaza amarilla y detente dentro.', 11);
  addRow(lv, { x: -6.4, z: 16, count: 5, spotW: 3.2, target: 2, fill: false });
  cone(lv, -4, 8); cone(lv, 4, 8);
  L.push(lv);

  // 2
  lv = make('Entre coches', 20, { x: -8, z: 0, a: 0 }, { minX: -16, maxX: 16, minZ: -8, maxZ: 26 },
    'Aparca entre los coches sin rozarlos.', 22);
  addRow(lv, { x: -8.7, z: 16, count: 7, spotW: 2.9, target: 5 });
  cone(lv, 12, 6); cone(lv, -12, 6);
  L.push(lv);

  // 3
  lv = make('Pasillo estrecho', 30, { x: -16.5, z: 0, a: Math.PI / 2 }, { minX: -20, maxX: 20, minZ: -10, maxZ: 10 },
    'Gira en el pasillo y entra en la plaza. Usa la marcha atrás (R) si hace falta.', 33);
  addRow(lv, { x: -14.5, z: -6.2, count: 11, spotW: 2.9, target: 4, back: -1 });
  addRow(lv, { x: 14.5, z: 6.2, a: Math.PI, count: 11, spotW: 2.9, back: -1, empty: [3] });
  L.push(lv);

  // 4
  lv = make('Aparcamiento en línea', 35, { x: -20, z: 3, a: Math.PI / 2 }, { minX: -26, maxX: 26, minZ: -4, maxZ: 10 },
    'Aparca en paralelo junto al bordillo.', 44);
  addWall(lv, -26, -3.1, 26, -3.1, 0.4, 0.25);
  for (let i = 0; i < 7; i++) {
    const x = -18 + i * 6.5;
    if (i === 3) lv.target = { x, z: -1.55, a: Math.PI / 2, hw: 1.3, hl: 3.25 };
    else addCar(lv, x, -1.55, lv.rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    lv.lines.push({ x: x - 3.25, z: -1.55, a: 0, w: 0.12, l: 2.6 });
  }
  lv.lines.push({ x: 22.75, z: -1.55, a: 0, w: 0.12, l: 2.6 });
  lv.lines.push({ x: 2.75, z: -0.25, a: Math.PI / 2, w: 0.12, l: 45.5 });
  for (let i = 0; i < 7; i++) if (i !== 2 && i !== 5) addCar(lv, -20 + i * 7, 7.5, Math.PI / 2);
  L.push(lv);

  // 5
  lv = make('El garaje', 30, { x: -10, z: 0, a: Math.PI / 2 }, { minX: -18, maxX: 18, minZ: -8, maxZ: 22 },
    'Mete el coche en el garaje del centro.', 55);
  for (const wx of [-5.4, -1.8, 1.8, 5.4]) addWall(lv, wx, 11, wx, 17.4, 0.3, 2.4);
  addWall(lv, -5.4, 17.4, 5.4, 17.4, 0.3, 2.4);
  lv.target = { x: 0, z: 14.2, a: 0, hw: 1.6, hl: 3.0 };
  addCar(lv, -3.6, 14.2, 0); addCar(lv, 3.6, 14.2, Math.PI);
  lv.lines.push({ x: 0, z: 11, a: Math.PI / 2, w: 0.15, l: 10.8 });
  cone(lv, -7, 7); cone(lv, 7, 7);
  L.push(lv);

  // 6
  lv = make('Slalom', 35, { x: 0, z: 0, a: 0 }, { minX: -8, maxX: 8, minZ: -4, maxZ: 50 },
    'Esquiva los conos y aparca al final.', 66);
  for (let z = 3; z <= 36; z += 3) { cone(lv, -5.5, z); cone(lv, 5.5, z); }
  for (let x = -4.7; x <= 1.01; x += 0.8) cone(lv, x, 10);
  for (let x = -1; x <= 4.71; x += 0.8) cone(lv, x, 19);
  for (let x = -4.7; x <= 1.01; x += 0.8) cone(lv, x, 28);
  addRow(lv, { x: -3, z: 42, count: 3, spotW: 3, target: 2 });
  L.push(lv);

  // 7
  lv = make('En diagonal', 25, { x: -18, z: 2, a: Math.PI / 2 }, { minX: -22, maxX: 22, minZ: -6, maxZ: 18 },
    'Aparca en batería inclinada.', 77);
  addRow(lv, { x: -12, z: 10, a: Math.PI / 4, count: 7, step: 2.8 * Math.SQRT2, dir: [1, 0], target: 4, back: 0, flip: false });
  cone(lv, 14, 2); cone(lv, 10, -2); cone(lv, 18, -3);
  L.push(lv);

  // 8
  lv = make('Parking subterráneo', 35, { x: -15, z: 0, a: Math.PI / 2 }, { minX: -19, maxX: 19, minZ: -9.4, maxZ: 9.4 },
    'Cuidado con las columnas.', 88);
  lv.indoor = true;
  addRow(lv, { x: -13.05, z: -5.9, count: 10, spotW: 2.9, back: -1, empty: [2] });
  addRow(lv, { x: 13.05, z: 5.9, a: Math.PI, count: 10, spotW: 2.9, back: -1, target: 6 });
  for (const k of [0, 3, 6, 9]) pillar(lv, -13.05 + (k - 0.5) * 2.9, -3.3);
  for (const k of [1, 4, 8]) pillar(lv, 13.05 - (k - 0.5) * 2.9, 3.3);
  L.push(lv);

  // 9
  lv = make('Línea experto', 40, { x: -22, z: 2.6, a: Math.PI / 2 }, { minX: -28, maxX: 28, minZ: -4, maxZ: 8.2 },
    'Paralelo con muy poco espacio.', 99);
  addWall(lv, -28, -3.1, 28, -3.1, 0.4, 0.25);
  for (let i = 0; i < 8; i++) {
    const x = -21 + i * 6;
    if (i === 4) lv.target = { x, z: -1.55, a: Math.PI / 2, hw: 1.3, hl: 3.0 };
    else addCar(lv, x, -1.55, Math.PI / 2);
    lv.lines.push({ x: x - 3, z: -1.55, a: 0, w: 0.12, l: 2.6 });
  }
  lv.lines.push({ x: 27, z: -1.55, a: 0, w: 0.12, l: 2.6 });
  for (let i = 0; i < 10; i++) if (i !== 3 && i !== 7) addCar(lv, -24 + i * 5.5, 5.6, -Math.PI / 2);
  L.push(lv);

  // 10
  lv = make('Laberinto final', 50, { x: -15, z: 0, a: Math.PI / 2 }, { minX: -20, maxX: 20, minZ: -5, maxZ: 46 },
    'Atraviesa el recinto y encuentra tu plaza.', 1010);
  addWall(lv, -20, 12, 8, 12, 0.4, 1.2);
  addWall(lv, -8, 26, 20, 26, 0.4, 1.2);
  cone(lv, 2, -2.5); cone(lv, 2, 2.5);
  pillar(lv, -2, 19, 0.6); pillar(lv, 10, 17, 0.6); pillar(lv, -12, 20, 0.6);
  addRow(lv, { x: -6, z: 38, count: 5, spotW: 3, target: 3 });
  cone(lv, -14, 34); cone(lv, -10, 42); cone(lv, 14, 32);
  L.push(lv);

  for (const l of L) delete l.rand;
  return L;
}

export const LEVELS = buildLevels();

let freeMap = null;
export function getFreeMap() {
  if (freeMap) return freeMap;
  const lv = make('Ciudad', 0, { x: 0, z: 0, a: 0 }, { minX: -130, maxX: 130, minZ: -130, maxZ: 130 },
    'Explora la ciudad y recoge monedas.', 2024);
  const r = lv.rand;
  lv.roads = [];
  const roadPos = [-120, -80, -40, 0, 40, 80, 120];
  for (const p of roadPos) {
    lv.roads.push({ x: p, z: 0, w: 12, l: 260 });
    lv.roads.push({ x: 0, z: p, w: 260, l: 12 });
    for (let t = -127; t <= 127; t += 6) {
      if (roadPos.some(q => Math.abs(t + 1.5 - q) < 7.5)) continue;
      lv.lines.push({ x: p, z: t + 1.5, a: 0, w: 0.2, l: 3, color: 'yellow' });
      lv.lines.push({ x: t + 1.5, z: p, a: Math.PI / 2, w: 0.2, l: 3, color: 'yellow' });
    }
  }
  const cells = [-100, -60, -20, 20, 60, 100];
  const lots = ['20,20', '-20,-60', '60,-20', '-60,60'];
  const BCOLORS = ['#e2d6c3', '#c9d6df', '#b7c4cf', '#d9c2a7', '#c7b8a1', '#a7b6c2', '#e6e1d6', '#cdb4a0'];
  lv.obstacles.forEach(o => { o.h = 2; });
  for (const cx of cells) for (const cz of cells) {
    if (lots.includes(`${cx},${cz}`)) {
      addRow(lv, { x: cx - 11.2, z: cz - 7, count: 9, spotW: 2.8, back: -1, fillRate: 0.45 });
      addRow(lv, { x: cx + 11.2, z: cz + 7, a: Math.PI, count: 9, spotW: 2.8, back: -1, fillRate: 0.45 });
      continue;
    }
    const n = r() < 0.4 ? 2 : 1;
    if (n === 1) {
      lv.obstacles.push({ type: 'building', x: cx, z: cz, a: 0, hw: 9 + r() * 4, hl: 9 + r() * 4, h: 8 + r() * 32, color: BCOLORS[Math.floor(r() * BCOLORS.length)] });
    } else {
      for (const s of [-1, 1]) {
        lv.obstacles.push({ type: 'building', x: cx + s * 6.5, z: cz, a: 0, hw: 5 + r() * 1, hl: 9 + r() * 4, h: 8 + r() * 24, color: BCOLORS[Math.floor(r() * BCOLORS.length)] });
      }
    }
  }
  lv.coins = [];
  for (let i = 0; i < 40; i++) {
    const p = roadPos[Math.floor(r() * roadPos.length)];
    const t = -120 + r() * 240;
    const off = (r() - 0.5) * 6;
    lv.coins.push(r() < 0.5 ? { x: p + off, z: t } : { x: t, z: p + off });
  }
  delete lv.rand;
  freeMap = lv;
  return lv;
}
