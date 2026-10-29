// Física 2D (plano XZ): modelo de bicicleta para el coche y colisiones OBB/círculo.
// Convención: ángulo a = 0 mira hacia +Z; adelante = (sin a, cos a), derecha = (cos a, -sin a).

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function axes(a) {
  const s = Math.sin(a), c = Math.cos(a);
  return { fx: s, fz: c, rx: c, rz: -s };
}

export function obbCorners(o) {
  const { fx, fz, rx, rz } = axes(o.a);
  const out = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    out.push([o.x + rx * o.hw * sx + fx * o.hl * sz, o.z + rz * o.hw * sx + fz * o.hl * sz]);
  }
  return out;
}

export function toLocal(o, px, pz) {
  const { fx, fz, rx, rz } = axes(o.a);
  const dx = px - o.x, dz = pz - o.z;
  return [dx * rx + dz * rz, dx * fx + dz * fz];
}

export function pointInObb(px, pz, o) {
  const [lx, lz] = toLocal(o, px, pz);
  return Math.abs(lx) <= o.hw && Math.abs(lz) <= o.hl;
}

export function pointObbDist(px, pz, o) {
  const [lx, lz] = toLocal(o, px, pz);
  const dx = Math.max(Math.abs(lx) - o.hw, 0), dz = Math.max(Math.abs(lz) - o.hl, 0);
  return Math.hypot(dx, dz);
}

export function obbOverlap(A, B) {
  const ca = obbCorners(A), cb = obbCorners(B);
  const list = [];
  for (const o of [A, B]) {
    const x = axes(o.a);
    list.push([x.fx, x.fz], [x.rx, x.rz]);
  }
  for (const [ax, az] of list) {
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ca) { const d = p[0] * ax + p[1] * az; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const p of cb) { const d = p[0] * ax + p[1] * az; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}

export function collides(carObb, ob) {
  if (ob.r) return pointObbDist(ob.x, ob.z, carObb) < ob.r;
  return obbOverlap(carObb, ob);
}

// Distancia aproximada entre el coche y un obstáculo (para los sensores de aparcamiento).
export function obstacleDist(carObb, ob) {
  if (ob.r) return Math.max(0, pointObbDist(ob.x, ob.z, carObb) - ob.r);
  let d = Infinity;
  const cc = obbCorners(carObb);
  const pts = cc.concat(cc.map((p, i) => {
    const q = cc[(i + 1) % 4];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  }));
  for (const p of pts) d = Math.min(d, pointObbDist(p[0], p[1], ob));
  for (const p of obbCorners(ob)) d = Math.min(d, pointObbDist(p[0], p[1], carObb));
  return d;
}

export function carObb(c, spec) {
  return { x: c.x, z: c.z, a: c.a, hw: spec.w / 2, hl: spec.l / 2 };
}

// Paso fijo de la física: el coche se comporta igual a 30 que a 120 fps.
export const PHYS_DT = 1 / 120;

// Avanza el coche dt segundos. inp = { throttle, brake, steer (-1..1, + = izquierda), handbrake }.
// Estado: v = velocidad hacia delante, vl = velocidad lateral (derrape), steer = ángulo de ruedas.
export function stepCar(c, inp, s, dt) {
  const sp = Math.abs(c.v);
  const drifting = !!inp.handbrake && sp > 4;
  let target = clamp(inp.steer, -1, 1) * s.maxSteer;
  // A velocidad, los neumáticos no dan más agarre lateral que `grip` (m/s²): el coche subvira.
  // Con el freno de mano echado se permite girar algo más para provocar el derrape.
  if (sp > 1) {
    const lim = Math.atan(((s.grip || 9) * (drifting ? 2.2 : 1) * s.wb) / (sp * sp));
    target = clamp(target, -lim, lim);
  }
  // La dirección gira más despacio cuanto más rápido vas: menos volantazos en recta.
  const rate = ((s.steerRate || 2.2) / (1 + sp / 14)) * dt;
  c.steer += clamp(target - c.steer, -rate, rate);

  // Motor: empuja con fuerza al salir y pierde empuje cerca de la velocidad máxima.
  let v = c.v;
  if (inp.throttle > 0) {
    const top = c.gear > 0 ? s.maxSpeed : s.maxReverse;
    const moving = Math.sign(v) === c.gear ? Math.min(1, sp / top) : 0;
    v += c.gear * s.accel * inp.throttle * (1 - 0.75 * moving * moving) * dt;
  }
  let dec = 0.6 + 0.0035 * v * v;
  if (inp.brake > 0) dec += s.brake * inp.brake;
  if (inp.handbrake) dec += s.brake * 0.55;
  const dv = dec * dt;
  v = Math.abs(v) <= dv ? 0 : v - Math.sign(v) * dv;
  c.v = clamp(v, -s.maxReverse, s.maxSpeed);
  c.braking = inp.brake > 0 || !!inp.handbrake;

  // Giro alrededor del eje trasero: el centro del coche se mueve de lado a half·yaw.
  // La velocidad se conserva en el mundo mientras el coche rota; los neumáticos la enderezan
  // hacia la dirección del coche. Con agarre normal es casi instantáneo; con el freno de mano
  // a velocidad las ruedas traseras se sueltan y el coche cruza la cola (derrape).
  const half = s.wb / 2;
  let yaw = (c.v / s.wb) * Math.tan(c.steer);
  if (drifting) yaw *= 1.4;
  let fx = Math.sin(c.a), fz = Math.cos(c.a), rx = Math.cos(c.a), rz = -Math.sin(c.a);
  const wx = fx * c.v + rx * (c.vl || 0), wz = fz * c.v + rz * (c.vl || 0);
  c.a += yaw * dt;
  fx = Math.sin(c.a); fz = Math.cos(c.a); rx = Math.cos(c.a); rz = -Math.sin(c.a);
  c.v = wx * fx + wz * fz;
  c.vl = wx * rx + wz * rz;
  const vlTarget = half * yaw;
  const grip = drifting ? 1.6 : sp > 1 ? 30 : 60;
  c.vl += (vlTarget - c.vl) * (1 - Math.exp(-grip * dt));
  c.slip = Math.abs(c.vl - vlTarget);

  c.x += (fx * c.v + rx * c.vl) * dt;
  c.z += (fz * c.v + rz * c.vl) * dt;
}

// ¿Está el coche bien aparcado dentro de la plaza?
export function parkedIn(c, spec, spot) {
  const corners = obbCorners(carObb(c, spec));
  if (!corners.every(p => pointInObb(p[0], p[1], spot))) return false;
  let d = (c.a - spot.a) % Math.PI;
  if (d < 0) d += Math.PI;
  return Math.min(d, Math.PI - d) < 0.22;
}
