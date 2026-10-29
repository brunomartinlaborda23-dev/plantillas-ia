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

// Avanza el coche dt segundos. inp = { throttle, brake, steer (-1..1, + = izquierda), handbrake }.
export function stepCar(c, inp, s, dt) {
  let target = clamp(inp.steer, -1, 1) * s.maxSteer;
  // A velocidad, los neumáticos no dan más agarre lateral que `grip` (m/s²): el coche subvira.
  const v2 = c.v * c.v;
  if (v2 > 1) {
    const lim = Math.atan(((s.grip || 9) * s.wb) / v2);
    target = clamp(target, -lim, lim);
  }
  const rate = (s.steerRate || 2.2) * dt;
  c.steer += clamp(target - c.steer, -rate, rate);

  let v = c.v;
  if (inp.throttle > 0) v += c.gear * s.accel * inp.throttle * dt;
  let dec = 0.7 + 0.004 * v * v;
  if (inp.brake > 0) dec += s.brake * inp.brake;
  if (inp.handbrake) dec += s.brake * 1.3;
  const dv = dec * dt;
  v = Math.abs(v) <= dv ? 0 : v - Math.sign(v) * dv;
  c.v = clamp(v, -s.maxReverse, s.maxSpeed);
  c.braking = inp.brake > 0 || !!inp.handbrake;

  // Gira alrededor del eje trasero, como un coche real.
  const half = s.wb / 2;
  let fx = Math.sin(c.a), fz = Math.cos(c.a);
  const rx = c.x - fx * half + fx * c.v * dt;
  const rz = c.z - fz * half + fz * c.v * dt;
  c.a += (c.v / s.wb) * Math.tan(c.steer) * dt;
  fx = Math.sin(c.a); fz = Math.cos(c.a);
  c.x = rx + fx * half;
  c.z = rz + fz * half;
}

// ¿Está el coche bien aparcado dentro de la plaza?
export function parkedIn(c, spec, spot) {
  const corners = obbCorners(carObb(c, spec));
  if (!corners.every(p => pointInObb(p[0], p[1], spot))) return false;
  let d = (c.a - spot.a) % Math.PI;
  if (d < 0) d += Math.PI;
  return Math.min(d, Math.PI - d) < 0.22;
}
