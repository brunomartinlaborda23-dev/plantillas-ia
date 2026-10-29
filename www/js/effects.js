// Efectos de realismo: caja de cambios automática, suspensión y marcas de neumático.
import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './physics.js';

// Calcula marcha y revoluciones a partir de la velocidad (solo afecta al sonido y al HUD).
export class Drivetrain {
  constructor(engine) {
    this.e = engine;
    this.gear = 0;
    this.rpm = 0;
    this.startT = 0; // segundos desde el arranque
  }

  // Devuelve true si acaba de cambiar de marcha.
  update(v, throttle, dt) {
    const e = this.e, sp = Math.abs(v);
    let g = this.gear;
    while (g < e.gears.length - 1 && sp > e.gears[g] * 0.9) g++;
    while (g > 0 && sp < e.gears[g - 1] * 0.55) g--;
    const shifted = g !== this.gear;
    this.gear = g;
    let target = e.idle + (e.red - e.idle) * Math.min(1, sp / e.gears[g]);
    if (sp < 0.5) target = e.idle + throttle * (e.red - e.idle) * 0.3;
    // Arranque: el motor de arranque gira a ~250 rpm y luego el motor "sube" y se asienta al ralentí.
    if (this.startT < 1.6) {
      this.startT += dt;
      const t = this.startT;
      if (t < 0.55) target = 250;
      else target = Math.max(target, e.idle * (1 + 1.1 * Math.exp(-(t - 0.55) * 4)));
    }
    this.rpm += (target - this.rpm) * Math.min(1, dt * (shifted ? 20 : 7));
    return shifted;
  }
}

// Balanceo y cabeceo de la carrocería con un muelle amortiguado.
export class Suspension {
  constructor(softness) {
    this.k = softness;
    this.roll = this.rollV = this.pitch = this.pitchV = 0;
  }

  kick(amount) { this.pitchV += amount; }

  update(latAcc, longAcc, dt) {
    const tr = clamp(latAcc * 0.006 * this.k, -0.07, 0.07);
    const tp = clamp(-longAcc * 0.005 * this.k, -0.05, 0.05);
    const K = 110, C = 13;
    this.rollV += ((tr - this.roll) * K - this.rollV * C) * dt;
    this.pitchV += ((tp - this.pitch) * K - this.pitchV * C) * dt;
    this.roll += this.rollV * dt;
    this.pitch += this.pitchV * dt;
  }
}

// Marcas de neumático en el suelo (búfer circular con un solo InstancedMesh).
export class SkidMarks {
  constructor(parent, max = 900) {
    const geo = new THREE.PlaneGeometry(0.24, 0.42).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.max = max;
    this.next = 0;
    this.last = {};
    this.dummy = new THREE.Object3D();
    parent.add(this.mesh);
  }

  // Deja una marca bajo la rueda `id` si se ha movido lo suficiente desde la anterior.
  mark(id, x, z, a) {
    const l = this.last[id];
    if (l && Math.hypot(l[0] - x, l[1] - z) < 0.35) return;
    this.last[id] = [x, z];
    this.dummy.position.set(x, 0.018, z);
    this.dummy.rotation.set(0, a, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.next, this.dummy.matrix);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Sin derrapar, la siguiente marca empieza un trazo nuevo.
  lift(id) { delete this.last[id]; }
}
