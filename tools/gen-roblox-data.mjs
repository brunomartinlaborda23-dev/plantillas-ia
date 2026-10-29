// Genera roblox/src/ReplicatedStorage/ParkingShared/GameData.lua a partir de los datos del juego web,
// para que Roblox y la web compartan coches, niveles, ciudad y taller.
// Uso: node tools/gen-roblox-data.mjs
import { writeFileSync } from 'node:fs';
import { CARS, CAR_ORDER, COLORS } from '../www/js/specs.js';
import { LEVELS, getFreeMap } from '../www/js/levels.js';
import { TUNING, TUNING_ORDER } from '../www/js/tuning.js';

const round = (n) => Math.round(n * 1000) / 1000;

// Convierte un valor JS en una tabla Lua legible.
function lua(v, indent = '') {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return String(round(v));
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  const next = indent + '\t';
  if (Array.isArray(v)) {
    if (v.every(x => typeof x !== 'object')) return '{ ' + v.map(x => lua(x)).join(', ') + ' }';
    return '{\n' + v.map(x => next + lua(x, next)).join(',\n') + '\n' + indent + '}';
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined && typeof x !== 'function');
  const flat = entries.every(([, x]) => typeof x !== 'object' || x === null);
  const key = (k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${JSON.stringify(k)}]`);
  if (flat) return '{ ' + entries.map(([k, x]) => `${key(k)} = ${lua(x)}`).join(', ') + ' }';
  return '{\n' + entries.map(([k, x]) => `${next}${key(k)} = ${lua(x, next)}`).join(',\n') + '\n' + indent + '}';
}

const level = (lv) => ({
  name: lv.name, par: lv.par, hint: lv.hint, indoor: !!lv.indoor,
  start: lv.start, bounds: lv.bounds, target: lv.target,
  obstacles: lv.obstacles, lines: lv.lines,
});
const city = getFreeMap();

const data = {
  CARS, CAR_ORDER, COLORS,
  LEVELS: LEVELS.map(level),
  CITY: { ...level(city), roads: city.roads, coins: city.coins },
  TUNING: Object.fromEntries(TUNING_ORDER.map(k => [k, TUNING[k]])),
  TUNING_ORDER,
};

const out = `-- ARCHIVO GENERADO por tools/gen-roblox-data.mjs a partir del juego web. No editar a mano.
-- Unidades en metros y ángulos en radianes (Config.SCALE convierte a studs).
-- Ángulo a: el coche mira hacia (sin a, 0, cos a).
return ${lua(data)}
`;
const path = new URL('../roblox/src/ReplicatedStorage/ParkingShared/GameData.lua', import.meta.url);
writeFileSync(path, out);
console.log(`GameData.lua: ${CAR_ORDER.length} coches, ${LEVELS.length} niveles, ciudad con ${city.obstacles.length} obstáculos, ${(out.length / 1024).toFixed(0)} KB`);
