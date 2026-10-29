// Comprueba el comportamiento de la conducción con la física a paso fijo.
import { CARS } from '../www/js/specs.js';
import { stepCar, PHYS_DT } from '../www/js/physics.js';

let fail = 0;
const check = (ok, msg, extra = '') => { console.log(ok ? 'OK  ' : 'FAIL', msg, extra); if (!ok) fail++; };
const run = (c, inp, s, secs) => { for (let t = 0; t < secs; t += PHYS_DT) stepCar(c, inp, s, PHYS_DT); };
const car = (o = {}) => ({ x: 0, z: 0, a: 0, v: 0, vl: 0, steer: 0, gear: 1, ...o });
const s = CARS.sedan;

// 1. A volante girado y poca velocidad, el coche describe un círculo de radio wb/tan(steer)
//    respecto al eje trasero (igual que el modelo anterior, importante para aparcar).
{
  const c = car({ v: 2 });
  const pts = [];
  for (let i = 0; i < 2400; i++) { stepCar(c, { throttle: 0.12, brake: 0, steer: 1 }, s, PHYS_DT); c.v = 2; pts.push([c.x - Math.sin(c.a) * s.wb / 2, c.z - Math.cos(c.a) * s.wb / 2]); }
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const r = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length;
  const expected = s.wb / Math.tan(s.maxSteer);
  check(Math.abs(r - expected) < 0.15, 'radio de giro del eje trasero', `${r.toFixed(2)} m (esperado ${expected.toFixed(2)} m)`);
}
// 2. Pedal progresivo + motor: 0-100 km/h razonable y velocidad máxima respetada.
{
  const c = car();
  let t = 0;
  while (c.v < 27.8 && t < 30) { stepCar(c, { throttle: 1, brake: 0, steer: 0 }, CARS.hyper, PHYS_DT); t += PHYS_DT; }
  check(t > 2 && t < 6, 'Fulmine HY 0-100 km/h', `${t.toFixed(1)} s`);
  run(c, { throttle: 1, brake: 0, steer: 0 }, CARS.hyper, 30);
  check(c.v <= CARS.hyper.maxSpeed + 1e-9, 'no supera la velocidad máxima', `${(c.v * 3.6).toFixed(0)} km/h`);
}
// 3. Frenada desde 50 km/h: distancia realista (10-20 m).
{
  const c = car({ v: 13.9 });
  run(c, { throttle: 0, brake: 1, steer: 0 }, s, 4);
  check(c.v === 0 && c.z > 8 && c.z < 20, 'frenada desde 50 km/h', `${c.z.toFixed(1)} m`);
}
// 4. Sin freno de mano no hay derrape; con freno de mano a velocidad, sí.
{
  const c = car({ v: 15 });
  run(c, { throttle: 0.3, brake: 0, steer: 1 }, s, 1.5);
  check(c.slip < 0.3, 'curva normal sin derrape', `deslizamiento ${c.slip.toFixed(2)} m/s`);
  const d = car({ v: 15 });
  run(d, { throttle: 0.3, brake: 0, steer: 1, handbrake: true }, s, 0.6);
  check(d.slip > 1, 'freno de mano + volante = derrape', `deslizamiento ${d.slip.toFixed(2)} m/s`);
  const e = car({ v: 15 });
  run(e, { throttle: 0.3, brake: 0, steer: 1, handbrake: true }, s, 1);
  check(Math.abs(e.a) < 2.2, 'el derrape es controlable (sin trompo en 1 s)', `giro ${(e.a * 180 / Math.PI).toFixed(0)}°`);
}
// 5. A alta velocidad el giro está limitado por el agarre (subviraje, sin trompos).
{
  const c = car({ v: 30 });
  run(c, { throttle: 1, brake: 0, steer: 1 }, CARS.sport, 1);
  const lat = (c.v * c.v * Math.tan(c.steer)) / CARS.sport.wb;
  check(lat <= CARS.sport.grip + 0.01, 'aceleración lateral ≤ agarre', `${lat.toFixed(1)} m/s²`);
}
console.log(fail ? `${fail} fallos` : 'OK: conducción verificada');
process.exit(fail ? 1 : 0);
