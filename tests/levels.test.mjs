// Comprueba que cada nivel es jugable: salida sin colisión, plaza libre y suficientemente grande.
import { LEVELS, getFreeMap } from '../www/js/levels.js';
import { CARS } from '../www/js/specs.js';
import { collides, carObb, parkedIn, stepCar } from '../www/js/physics.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
for (const lv of [...LEVELS, getFreeMap()]) {
  for (const [key, s] of Object.entries(CARS)) {
    const start = carObb({ ...lv.start }, s);
    lv.obstacles.forEach((o, i) => check(!collides(start, o), `${lv.name}/${key}: salida choca con ${o.type}#${i}`));
    if (lv.target) {
      const t = lv.target;
      const inSpot = { x: t.x, z: t.z, a: t.a, v: 0 };
      check(parkedIn(inSpot, s, t), `${lv.name}/${key}: el coche no cabe en la plaza`);
      lv.obstacles.forEach((o, i) => check(!collides(carObb(inSpot, s), o), `${lv.name}/${key}: plaza ocupada por ${o.type}#${i}`));
    }
  }
}
// La física: acelerar en línea recta avanza en +Z, girar a la izquierda va hacia +X.
const c = { x: 0, z: 0, a: 0, v: 0, steer: 0, gear: 1 };
for (let i = 0; i < 60; i++) stepCar(c, { throttle: 1, brake: 0, steer: 0 }, CARS.sedan, 1 / 60);
check(c.z > 0.5 && Math.abs(c.x) < 1e-9, 'avance recto');
for (let i = 0; i < 60; i++) stepCar(c, { throttle: 0.5, brake: 0, steer: 1 }, CARS.sedan, 1 / 60);
check(c.x > 0 && c.a > 0, 'giro a la izquierda');
console.log(fail ? `${fail} fallos` : `OK: ${LEVELS.length} niveles + ciudad verificados`);
process.exit(fail ? 1 : 0);
