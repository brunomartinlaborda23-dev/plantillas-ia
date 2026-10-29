// Construye la escena 3D de un nivel a partir de sus datos.
import * as THREE from '../vendor/three.module.min.js';
import { buildCar } from './cars.js';

function canvasTex(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noise(g, s, base, amount) {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

const tex = {};
const getTex = (name, fn) => tex[name] || (tex[name] = canvasTex(256, fn));
const asphalt = () => getTex('asphalt', (g, s) => noise(g, s, '#55585c', 22));
const concrete = () => getTex('concrete', (g, s) => {
  noise(g, s, '#b9b6ae', 14);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i <= s; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
});
const grass = () => getTex('grass', (g, s) => noise(g, s, '#4f8a3a', 30));
const windows = () => getTex('windows', (g, s) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, s, s);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = Math.random() < 0.25 ? '#ffe8a3' : '#3b4a5c';
    g.fillRect(x * 64 + 14, y * 64 + 14, 36, 40);
  }
});

const M = {
  line: new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }),
  yellowLine: new THREE.MeshBasicMaterial({ color: 0xf5c518 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.9 }),
  wallTop: new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 }),
  cone: new THREE.MeshStandardMaterial({ color: 0xff5a00, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
  pillar: new THREE.MeshStandardMaterial({ color: 0xc9c5bb, roughness: 0.9 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0x222222 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6b4423 }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.8 }),
  coin: new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.8, roughness: 0.25, emissive: 0x6b4a00 }),
};

const unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function plane(w, l, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

function texMat(t, w, l, rep, extra = {}) {
  const c = t.clone();
  c.repeat.set(w / rep, l / rep);
  c.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: c, roughness: 0.95, ...extra });
}

// Muchas líneas pintadas con un solo InstancedMesh por color.
function addLines(group, lines) {
  const byColor = {};
  for (const l of lines) (byColor[l.color || 'white'] ||= []).push(l);
  const dummy = new THREE.Object3D();
  for (const [color, list] of Object.entries(byColor)) {
    const im = new THREE.InstancedMesh(unitPlane, color === 'yellow' ? M.yellowLine : M.line, list.length);
    list.forEach((l, i) => {
      dummy.position.set(l.x, 0.015, l.z);
      dummy.rotation.set(0, l.a, 0);
      dummy.scale.set(l.w, 1, l.l);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    group.add(im);
  }
}

function buildObstacle(o) {
  switch (o.type) {
    case 'wall': {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, o.h, o.hl * 2), M.wall);
      body.position.y = o.h / 2;
      body.castShadow = body.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.02, 0.12, o.hl * 2 + 0.02), M.wallTop);
      cap.position.y = o.h;
      g.add(body, cap);
      return g;
    }
    case 'car': return buildCar(o.model, o.color, { parked: true });
    case 'cone': {
      const g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.72, 14), M.cone);
      c.position.y = 0.4;
      c.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.15, 0.12, 14), M.white);
      band.position.y = 0.45;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), M.cone);
      base.position.y = 0.025;
      g.add(c, band, base);
      return g;
    }
    case 'pillar': {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 3.4, 18), M.pillar);
      p.position.y = 1.7;
      p.castShadow = true;
      g.add(p);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(o.r + 0.01, o.r + 0.01, 0.15, 18), i % 2 ? M.wallTop : M.stripe);
        s.position.y = 0.1 + i * 0.15;
        g.add(s);
      }
      return g;
    }
    case 'building': {
      const mat = texMat(windows(), o.hw * 2, o.h, 6, { color: o.color, roughness: 0.8 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, o.h, o.hl * 2), mat);
      b.position.y = o.h / 2;
      b.castShadow = b.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.4, 0.5, o.hl * 2 + 0.4), M.wall);
      roof.position.y = o.h + 0.25;
      const g = new THREE.Group();
      g.add(b, roof);
      return g;
    }
  }
  return new THREE.Group();
}

function buildTarget(t) {
  const g = new THREE.Group();
  g.position.set(t.x, 0.02, t.z);
  g.rotation.y = t.a;
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.35, depthWrite: false });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffd400 });
  const fill = new THREE.Mesh(unitPlane, fillMat);
  fill.scale.set(t.hw * 2, 1, t.hl * 2);
  g.add(fill);
  const e = 0.14;
  for (const [x, z, w, l] of [[t.hw, 0, e, t.hl * 2], [-t.hw, 0, e, t.hl * 2], [0, t.hl, t.hw * 2, e], [0, -t.hl, t.hw * 2, e]]) {
    const m = new THREE.Mesh(unitPlane, edgeMat);
    m.position.set(x, 0.005, z);
    m.scale.set(w, 1, l);
    g.add(m);
  }
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4).rotateX(Math.PI), edgeMat);
  arrow.position.y = 3;
  g.add(arrow);
  return {
    group: g,
    update(time, state) {
      const c = state === 'ok' ? 0x22e06b : 0xffd400;
      fillMat.color.setHex(c);
      edgeMat.color.setHex(c);
      fillMat.opacity = 0.28 + Math.sin(time * 4) * 0.1;
      arrow.position.y = 3 + Math.sin(time * 3) * 0.35;
      arrow.rotation.y = time;
    },
  };
}

function addTrees(group, b, count) {
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.28, 2, 8);
  const leafGeo = new THREE.ConeGeometry(1.6, 4, 8);
  for (let i = 0; i < count; i++) {
    const side = i % 4;
    const t = Math.random();
    const d = 4 + Math.random() * 14;
    const x = side === 0 ? b.minX - d : side === 1 ? b.maxX + d : b.minX + t * (b.maxX - b.minX);
    const z = side === 2 ? b.minZ - d : side === 3 ? b.maxZ + d : b.minZ + t * (b.maxZ - b.minZ);
    const tr = new THREE.Mesh(trunkGeo, M.trunk);
    tr.position.set(x, 1, z);
    const lf = new THREE.Mesh(leafGeo, M.leaves);
    lf.position.set(x, 3.8, z);
    lf.castShadow = true;
    group.add(tr, lf);
  }
}

export function buildWorld(data, env) {
  const group = new THREE.Group();
  const b = data.bounds;
  const W = b.maxX - b.minX, L = b.maxZ - b.minZ;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;

  if (env !== 'indoor') group.add(plane(800, 800, texMat(grass(), 800, 800, 10), cx, -0.03, cz));
  const floorTex = env === 'city' ? concrete() : asphalt();
  const floorExtra = env === 'indoor' ? { color: 0x8a8a8a } : {};
  group.add(plane(W + 2, L + 2, texMat(floorTex, W + 2, L + 2, env === 'city' ? 4 : 8, floorExtra), cx, 0, cz));

  if (env === 'indoor') {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55585c }));
    ceil.position.set(cx, 3.4, cz);
    group.add(ceil);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    for (let x = b.minX + 4; x < b.maxX; x += 6) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.25), lampMat);
      lamp.position.set(x, 3.36, 0);
      group.add(lamp);
    }
  }

  if (data.roads) {
    for (const r of data.roads) group.add(plane(r.w, r.l, texMat(asphalt(), r.w, r.l, 8), r.x, 0.008, r.z));
  }

  addLines(group, data.lines);

  for (const o of data.obstacles) {
    const m = buildObstacle(o);
    m.position.set(o.x, 0, o.z);
    m.rotation.y = o.a || 0;
    group.add(m);
  }

  if (env === 'day') addTrees(group, b, 40);
  if (env === 'city') addTrees(group, b, 120);

  const target = data.target ? buildTarget(data.target) : null;
  if (target) group.add(target.group);

  const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24).rotateX(Math.PI / 2);
  const coins = (data.coins || []).map(c => {
    const m = new THREE.Mesh(coinGeo, M.coin);
    m.position.set(c.x, 1, c.z);
    m.castShadow = true;
    group.add(m);
    return { x: c.x, z: c.z, mesh: m, taken: false };
  });

  return { group, target, coins };
}

export function buildShowroom() {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1e27, roughness: 0.4, metalness: 0.3 }));
  floor.receiveShadow = true;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 0.2, 64), new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.6, roughness: 0.3 }));
  disc.position.y = 0.1;
  disc.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.05, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb400 }));
  ring.position.y = 0.2;
  g.add(floor, disc, ring);
  return g;
}
