// Modelos 3D de coches generados por código (sin archivos externos).
// Cada carrocería es un perfil lateral curvo con pasos de rueda, extruido a lo ancho y
// afinado en morro, cola y techo. Luego se fusionan las piezas para dibujarlas rápido.
import * as THREE from '../vendor/three.module.min.js';
import { mergeGeometries, toCreasedNormals } from '../vendor/BufferGeometryUtils.js';
import { TessellateModifier } from '../vendor/TessellateModifier.js';
import { CARS } from './specs.js';
import { DEFAULT_TUNING, tuningOption } from './tuning.js';

const V2 = (p) => new THREE.Vector2(p[0], p[1]);
const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

const MAT = {
  tire: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.55 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.4, roughness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1a2430, metalness: 0.9, roughness: 0.06 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.15 }),
  disc: new THREE.MeshStandardMaterial({ color: 0x6b6e73, metalness: 0.8, roughness: 0.45 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf3f6ff, emissiveIntensity: 1.6, roughness: 0.2 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0x803d00, roughness: 0.3 }),
};
const rimMats = {};
const rimMat = (c) => rimMats[c] || (rimMats[c] = new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.28 }));
const caliperMats = {};
const caliperMat = (c) => caliperMats[c] || (caliperMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));

// ---------- Geometría de carrocería ----------

// Perfil lateral (x = longitudinal, y = altura) con los pasos de rueda recortados abajo.
function bodyShape(s, top, clear) {
  const sh = new THREE.Shape();
  const ar = s.wheelR + 0.08;
  const rear = top[top.length - 1], front = top[0];
  sh.moveTo(rear[0], clear);
  const t0 = Math.asin(Math.max(-1, Math.min(1, (clear - s.wheelR) / ar)));
  for (const cz of [-s.wb / 2, s.wb / 2]) sh.absarc(cz, s.wheelR, ar, Math.PI - t0, t0, true);
  sh.lineTo(front[0], clear);
  sh.splineThru(top.map(V2));
  sh.closePath();
  return sh;
}

// Extruye un perfil a lo ancho (eje X) y lo deforma: estrecha morro/cola y la parte alta.
function extrude(shape, width, { bevel = 0.05, curve = 6, deform }) {
  let g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments: 3, curveSegments: curve,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // perfil.x -> Z (adelante), ancho -> X
  g = tessellateCaps(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * deform(p.getY(i), p.getZ(i)));
  g.deleteAttribute('normal');
  return toCreasedNormals(g, 0.7);
}

// Subdivide solo las tapas laterales (grupo 0 de ExtrudeGeometry): son triángulos grandes que,
// al deformarse, dejarían aristas visibles. El resto ya tiene suficientes vértices.
function tessellateCaps(g) {
  const caps = g.groups.find(gr => gr.materialIndex === 0);
  const slice = (start, count) => {
    const out = new THREE.BufferGeometry();
    for (const k of ['position', 'uv']) {
      const a = g.attributes[k];
      out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
    }
    return out;
  };
  const total = g.attributes.position.count;
  const parts = [];
  for (const gr of g.groups) {
    const part = slice(gr.start, Math.min(gr.count, total - gr.start));
    if (gr === caps || gr.materialIndex === 0) {
      part.computeVertexNormals();
      const t = new TessellateModifier(0.22, 6).modify(part);
      t.deleteAttribute('normal');
      parts.push(t);
    } else parts.push(part);
  }
  g.dispose();
  return mergeGeometries(parts);
}

function bodyDeform(s, d) {
  const L = s.l / 2;
  return (y, z) => {
    const ends = z > 0 ? d.nose * smooth(0.55, 1.02, z / L) : d.tail * smooth(0.6, 1.02, -z / L);
    const h = Math.max(0, (y - d.clear) / (d.belt - d.clear));
    return (1 - ends) * (1 - d.tumble * h * h);
  };
}
function bodyGeo(s, d) {
  return extrude(bodyShape(s, d.top, d.clear), s.w, { deform: bodyDeform(s, d) });
}

// Habitáculo: perfil del techo desde la base del parabrisas hasta la luneta.
function cabinShape(c) {
  const sh = new THREE.Shape();
  sh.moveTo(c.from, c.base);
  sh.splineThru(c.top.map(V2));
  sh.lineTo(c.top[c.top.length - 1][0], c.base);
  sh.closePath();
  return sh;
}
function cabinDeform(c) {
  const peak = Math.max(...c.top.map(p => p[1]));
  return (y) => 1 - c.tumble * smooth(c.base, peak + 0.02, y);
}
function cabinGeo(c) {
  return extrude(cabinShape(c), c.w, { bevel: 0.05, curve: 16, deform: cabinDeform(c) });
}
// Techo pintado: franja superior del perfil del habitáculo, un poco más ancha que el cristal.
function roofGeo(c) {
  const pts = new THREE.SplineCurve([V2([c.from, c.base]), ...c.top.map(V2)]).getPoints(60);
  const peak = Math.max(...pts.map(p => p.y));
  const cut = c.base + (peak - c.base) * c.roofFrom;
  const up = pts.filter(p => p.y >= cut);
  const sh = new THREE.Shape([...up.map(p => new THREE.Vector2(p.x, p.y + 0.012)), ...up.slice().reverse().map(p => new THREE.Vector2(p.x, p.y - 0.06))]);
  return extrude(sh, c.w + 0.012, { bevel: 0.05, curve: 4, deform: cabinDeform(c) });
}

// ---------- Utilidades de construcción ----------

function part(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
const boxP = (w, h, l, mat, x, y, z, rx, ry, rz) => part(new THREE.BoxGeometry(w, h, l), mat, x, y, z, rx, ry, rz);
const rbox = (w, h, l, r, mat, x, y, z, rx, ry, rz) => {
  // caja con bordes redondeados (extrusión de un rectángulo redondeado)
  const sh = new THREE.Shape();
  const hw = w / 2 - r, hh = h / 2 - r;
  sh.absarc(hw, hh, r, 0, Math.PI / 2);
  sh.absarc(-hw, hh, r, Math.PI / 2, Math.PI);
  sh.absarc(-hw, -hh, r, Math.PI, Math.PI * 1.5);
  sh.absarc(hw, -hh, r, Math.PI * 1.5, Math.PI * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: l, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -l / 2);
  return part(g, mat, x, y, z, rx, ry, rz);
};
const cylP = (r, len, mat, x, y, z, rx = Math.PI / 2, ry = 0, rz = 0, seg = 16) =>
  part(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, rx, ry, rz);

// Fusiona todas las mallas de un grupo en una por material (salvo las marcadas como `keep`).
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byMat = new Map();
  const remove = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (c.userData.keep) continue;
      if (c.isMesh) {
        let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.clearGroups();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
        if (!byMat.has(c.material)) byMat.set(c.material, []);
        byMat.get(c.material).push(g);
        remove.push(c);
      }
      walk(c);
    }
  };
  walk(root);
  for (const c of remove) { c.parent.remove(c); c.geometry.dispose(); }
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    geos.forEach(g => g.dispose());
  }
}

// ---------- Ruedas ----------

function tireGeo(r, w) {
  const pts = [[r * 0.72, -w / 2], [r - 0.035, -w / 2], [r, -w / 2 + 0.04], [r + 0.004, 0], [r, w / 2 - 0.04], [r - 0.035, w / 2], [r * 0.72, w / 2]];
  return new THREE.LatheGeometry(pts.map(V2), 28).rotateZ(Math.PI / 2);
}

// Rueda con la cara exterior hacia +X. Devuelve { pivot (gira con la dirección), spin (rueda) }.
function wheel(s, w, style) {
  const r = s.wheelR;
  const pivot = new THREE.Group();
  const fixed = new THREE.Group();
  const spin = new THREE.Group();
  spin.userData.keep = true;
  pivot.add(fixed, spin);

  spin.add(part(tireGeo(r, w), MAT.tire));
  const rim = rimMat(style.rim);
  const face = w / 2 - 0.02;
  spin.add(cylP(r * 0.71, w * 0.9, MAT.black, 0, 0, 0, 0, 0, Math.PI / 2, 20));
  spin.add(part(new THREE.TorusGeometry(r * 0.7, 0.018, 6, 28), rim, face, 0, 0, 0, Math.PI / 2, 0));
  spin.add(cylP(r * 0.16, 0.06, rim, face - 0.01, 0, 0, 0, 0, Math.PI / 2, 12));
  const n = style.spokes;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const off of style.split ? [-0.07, 0.07] : [0]) {
      const sp = boxP(0.03, r * 0.56, style.split ? 0.035 : 0.06, rim, face - 0.015, 0, 0, a + off, 0, 0);
      sp.position.set(face - 0.015, Math.cos(a + off) * r * 0.42, Math.sin(a + off) * r * 0.42);
      spin.add(sp);
    }
  }
  // Disco y pinza de freno: no giran con la rueda.
  fixed.add(cylP(r * 0.58, 0.03, MAT.disc, face - 0.09, 0, 0, 0, 0, Math.PI / 2, 24));
  fixed.add(rbox(0.06, 0.13, 0.24, 0.025, caliperMat(style.caliper), face - 0.07, r * 0.33, -r * 0.3, -0.7, 0, 0));
  return { pivot, spin, fixed };
}

// ---------- Diseños ----------
// top: línea superior de la carrocería, del morro (z+) a la cola (z-). cabin: habitáculo.
const DESIGNS = {
  sedan: {
    clear: 0.16, belt: 0.92, nose: 0.12, tail: 0.1, tumble: 0.1,
    top: [[2.3, 0.22], [2.33, 0.45], [2.26, 0.65], [1.9, 0.77], [1.3, 0.83], [0.95, 0.86], [0, 0.9], [-1.2, 0.93], [-1.55, 0.97], [-2.15, 0.98], [-2.32, 0.92], [-2.34, 0.6], [-2.3, 0.22]],
    cabin: { w: 1.56, base: 0.82, from: 1.0, tumble: 0.16, roofFrom: 0.88, top: [[0.6, 1.05], [0.2, 1.3], [-0.3, 1.42], [-0.8, 1.42], [-1.2, 1.3], [-1.5, 1.06], [-1.65, 0.97]] },
    wheel: { rim: '#c4c8ce', spokes: 5, caliper: '#3a3d42', w: 0.22 },
    details: (b) => {
      b.lights(0.62, 0.66, 2.24, 0.36, 0.09, -0.62, 0.84, -2.3, 0.34, 0.1);
      b.grille(0, 0.5, 2.31, 0.75, 0.16);
      b.plates(0.38, 2.33, 0.62, -2.33);
      b.exhaust([[-0.55, 0.24, -2.28]]);
      b.mirrors(0.95, 0.98, 0.78);
    },
  },
  hatch: {
    clear: 0.16, belt: 0.95, nose: 0.12, tail: 0.08, tumble: 0.1,
    top: [[2.025, 0.22], [2.05, 0.48], [1.96, 0.68], [1.6, 0.79], [1.1, 0.86], [0.8, 0.89], [0, 0.93], [-1, 0.96], [-1.8, 0.98], [-2.0, 0.95], [-2.05, 0.6], [-2.02, 0.22]],
    cabin: { w: 1.52, base: 0.84, from: 0.85, tumble: 0.16, roofFrom: 0.88, top: [[0.45, 1.1], [0.1, 1.35], [-0.3, 1.46], [-1.2, 1.46], [-1.75, 1.36], [-1.93, 1.0]] },
    wheel: { rim: '#aeb3ba', spokes: 6, caliper: '#3a3d42', w: 0.21 },
    details: (b) => {
      b.lights(0.6, 0.7, 1.98, 0.34, 0.1, -0.66, 1.02, -1.97, 0.2, 0.22);
      b.grille(0, 0.5, 2.05, 0.7, 0.14);
      b.plates(0.36, 2.06, 0.6, -2.06);
      b.mirrors(0.93, 1.0, 0.65);
    },
  },
  suv: {
    clear: 0.24, belt: 1.1, nose: 0.1, tail: 0.06, tumble: 0.08,
    top: [[2.35, 0.32], [2.38, 0.62], [2.3, 0.88], [1.9, 0.98], [1.3, 1.03], [0.95, 1.05], [0, 1.08], [-1.6, 1.1], [-2.3, 1.08], [-2.37, 0.8], [-2.35, 0.32]],
    cabin: { w: 1.66, base: 1.02, from: 0.95, tumble: 0.12, roofFrom: 0.9, top: [[0.6, 1.3], [0.2, 1.62], [-0.3, 1.72], [-1.6, 1.72], [-2.15, 1.62], [-2.25, 1.12]] },
    wheel: { rim: '#9ea3aa', spokes: 5, caliper: '#3a3d42', w: 0.26 },
    details: (b) => {
      b.lights(0.66, 0.9, 2.31, 0.4, 0.1, -0.7, 1.0, -2.34, 0.3, 0.14);
      b.grille(0, 0.66, 2.37, 1.0, 0.3, MAT.chrome);
      b.plates(0.5, 2.38, 0.72, -2.37);
      b.mirrors(1.0, 1.15, 0.8);
      b.add(boxP(0.06, 0.04, 2.6, MAT.black, 0.62, 1.75, -0.7));
      b.add(boxP(0.06, 0.04, 2.6, MAT.black, -0.62, 1.75, -0.7));
      b.add(boxP(1.6, 0.12, 0.18, MAT.black, 0, 0.36, 2.34));
    },
  },
  pickup: {
    clear: 0.26, belt: 1.14, nose: 0.08, tail: 0.04, tumble: 0.06,
    top: [[2.55, 0.34], [2.58, 0.7], [2.5, 0.96], [2.0, 1.06], [1.2, 1.1], [0.9, 1.12], [0, 1.14], [-2.5, 1.14], [-2.57, 0.9], [-2.55, 0.34]],
    cabin: { w: 1.72, base: 1.08, from: 0.95, tumble: 0.1, roofFrom: 0.9, top: [[0.55, 1.42], [0.2, 1.75], [-0.2, 1.84], [-0.85, 1.84], [-0.97, 1.6], [-0.99, 1.15]] },
    wheel: { rim: '#2b2d31', spokes: 6, caliper: '#3a3d42', w: 0.28 },
    details: (b) => {
      b.lights(0.7, 0.92, 2.5, 0.38, 0.14, -0.86, 0.95, -2.55, 0.14, 0.32);
      b.grille(0, 0.74, 2.56, 1.2, 0.36, MAT.chrome);
      b.plates(0.5, 2.6, 0.6, -2.58);
      b.mirrors(1.04, 1.24, 0.82);
      for (const sx of [-1, 1]) b.add(boxP(0.08, 0.12, 2.9, MAT.black, sx * 0.9, 1.2, -1.05));
      b.add(boxP(1.85, 0.12, 0.08, MAT.black, 0, 1.2, -2.5));
      b.add(boxP(1.7, 0.02, 2.85, MAT.black, 0, 1.15, -1.05));
      b.add(boxP(1.9, 0.14, 0.16, MAT.chrome, 0, 0.42, 2.58));
      b.add(boxP(1.9, 0.14, 0.16, MAT.chrome, 0, 0.42, -2.58));
    },
  },
  sport: {
    clear: 0.13, belt: 0.86, nose: 0.16, tail: 0.1, tumble: 0.12,
    top: [[2.225, 0.18], [2.26, 0.36], [2.15, 0.5], [1.7, 0.64], [1.3, 0.79], [0.9, 0.81], [0, 0.83], [-1, 0.88], [-1.8, 0.9], [-2.2, 0.86], [-2.26, 0.55], [-2.22, 0.18]],
    cabin: { w: 1.42, base: 0.76, from: 0.9, tumble: 0.2, roofFrom: 0.86, top: [[0.55, 0.98], [0.1, 1.2], [-0.4, 1.24], [-0.9, 1.15], [-1.5, 0.95], [-1.9, 0.88]] },
    wheel: { rim: '#8d939b', spokes: 5, split: true, caliper: '#c1121f', w: 0.26 },
    details: (b) => {
      b.lights(0.62, 0.56, 2.12, 0.38, 0.07, -0.65, 0.78, -2.24, 0.4, 0.07);
      b.grille(0, 0.3, 2.24, 1.2, 0.14);
      b.plates(0.36, 2.26, 0.5, -2.26);
      b.exhaust([[-0.5, 0.24, -2.22], [0.5, 0.24, -2.22]]);
      b.mirrors(0.92, 0.88, 0.7);
      if (b.stockWing) {
        b.add(boxP(1.5, 0.04, 0.28, MAT.carbon, 0, 1.0, -2.0, 0.08, 0, 0));
        for (const sx of [-1, 1]) b.add(boxP(0.05, 0.14, 0.1, MAT.carbon, sx * 0.5, 0.93, -2.0));
      }
    },
  },
  // Inspirado en un coupé deportivo alemán de altas prestaciones: capó largo, doble parrilla vertical, techo de carbono.
  cs: {
    clear: 0.14, belt: 0.95, nose: 0.12, tail: 0.09, tumble: 0.12,
    top: [[2.4, 0.2], [2.43, 0.42], [2.38, 0.62], [2.15, 0.74], [1.7, 0.8], [1.2, 0.86], [0.9, 0.89], [0, 0.93], [-1.0, 0.96], [-1.6, 1.0], [-2.15, 1.01], [-2.38, 0.98], [-2.42, 0.7], [-2.4, 0.35], [-2.38, 0.2]],
    cabin: { w: 1.52, base: 0.86, from: 0.95, tumble: 0.17, roofFrom: 0.86, roof: 'carbon', top: [[0.6, 1.05], [0.2, 1.3], [-0.2, 1.38], [-0.7, 1.38], [-1.1, 1.3], [-1.5, 1.1], [-1.75, 0.99]] },
    wheel: { rim: '#8a6d3b', spokes: 10, caliper: '#c1121f', w: 0.27 },
    details: (b) => {
      // Doble parrilla vertical con marco cromado
      for (const sx of [-1, 1]) {
        b.add(rbox(0.32, 0.44, 0.06, 0.06, MAT.chrome, sx * 0.19, 0.5, 2.405));
        b.add(rbox(0.27, 0.39, 0.06, 0.05, MAT.black, sx * 0.19, 0.5, 2.43));
        for (let i = 0; i < 5; i++) b.add(boxP(0.02, 0.36, 0.03, MAT.chrome, sx * 0.19 + (i - 2) * 0.05, 0.5, 2.455));
      }
      // Faros angulosos y pilotos en L
      for (const sx of [-1, 1]) {
        b.add(boxP(0.46, 0.09, 0.1, MAT.head, sx * 0.62, 0.66, 2.28, 0.2, sx * 0.2, 0));
        b.add(boxP(0.3, 0.02, 0.1, MAT.amber, sx * 0.6, 0.6, 2.3, 0.2, sx * 0.2, 0));
        b.add(boxP(0.44, 0.11, 0.06, b.brake, sx * 0.6, 0.87, -2.39, 0, -sx * 0.12, 0));
        b.add(boxP(0.1, 0.18, 0.06, b.brake, sx * 0.4, 0.82, -2.4));
        b.add(boxP(0.38, 0.2, 0.04, MAT.black, sx * 0.62, 0.32, 2.43));
      }
      b.add(boxP(0.62, 0.14, 0.04, MAT.black, 0, 0.27, 2.43));
      b.add(boxP(1.9, 0.03, 0.2, MAT.carbon, 0, 0.16, 2.34));
      b.add(boxP(0.18, 0.08, 0.04, b.reverse, 0, 0.66, -2.42));
      b.add(boxP(1.3, 0.035, 0.14, MAT.carbon, 0, 1.03, -2.3, -0.12, 0, 0));
      b.add(boxP(1.5, 0.14, 0.1, MAT.carbon, 0, 0.22, -2.4));
      b.exhaust([[-0.62, 0.27, -2.42], [-0.45, 0.27, -2.42], [0.45, 0.27, -2.42], [0.62, 0.27, -2.42]], 0.048);
      b.plates(0.36, 2.44, 0.55, -2.43);
      b.mirrors(0.93, 1.0, 0.8);
      for (const sx of [-1, 1]) b.add(boxP(0.03, 0.08, 0.32, MAT.carbon, sx * b.side(0.62, 1.75), 0.62, 1.75));
    },
  },
  // Inspirado en un 911 de circuito: faros redondos, cola fastback, gran alerón con cuello de cisne.
  rs: {
    clear: 0.14, belt: 0.9, nose: 0.14, tail: 0.08, tumble: 0.16,
    top: [[2.285, 0.2], [2.3, 0.36], [2.22, 0.5], [1.95, 0.62], [1.55, 0.76], [1.2, 0.83], [0.7, 0.85], [0, 0.85], [-0.8, 0.89], [-1.4, 0.93], [-1.9, 0.93], [-2.2, 0.87], [-2.3, 0.66], [-2.3, 0.3], [-2.285, 0.18]],
    cabin: { w: 1.4, base: 0.8, from: 0.88, tumble: 0.2, roofFrom: 0.86, top: [[0.55, 0.98], [0.2, 1.2], [-0.15, 1.3], [-0.6, 1.29], [-1.1, 1.17], [-1.6, 1.01], [-2.0, 0.91]] },
    wheel: { rim: '#c9ccd1', spokes: 10, caliper: '#e5b80b', w: 0.28 },
    details: (b) => {
      // Faros redondos sobre las aletas delanteras
      for (const sx of [-1, 1]) {
        b.add(part(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 24).scale(1, 1, 1.25), MAT.head, sx * 0.6, 0.66, 1.98, Math.PI / 2 - 0.6, 0, 0));
        b.add(part(new THREE.TorusGeometry(0.12, 0.012, 6, 24).scale(1, 1.25, 1), MAT.black, sx * 0.6, 0.665, 2.01, -0.6, 0, 0));
        b.add(boxP(0.34, 0.09, 0.04, MAT.black, sx * 0.62, 0.3, 2.28));
      }
      b.add(boxP(0.9, 0.16, 0.04, MAT.black, 0, 0.3, 2.3));
      b.add(boxP(1.85, 0.03, 0.22, MAT.carbon, 0, 0.16, 2.2));
      for (const sx of [-1, 1]) b.add(boxP(0.32, 0.015, 0.3, MAT.black, sx * 0.27, 0.69, 1.6, -0.3, 0, 0));
      // Barra de luz trasera de lado a lado
      b.add(boxP(1.62, 0.045, 0.04, b.brake, 0, 0.8, -2.255, 0.4, 0, 0));
      for (const sx of [-1, 1]) b.add(boxP(0.24, 0.07, 0.05, b.brake, sx * 0.7, 0.78, -2.24));
      b.add(boxP(0.16, 0.05, 0.04, b.reverse, 0, 0.5, -2.31));
      // Alerón con cuello de cisne
      if (b.stockWing) {
        b.add(boxP(1.78, 0.04, 0.44, MAT.carbon, 0, 1.36, -1.98, 0.1, 0, 0));
        b.add(boxP(1.78, 0.025, 0.14, MAT.carbon, 0, 1.43, -1.82, -0.35, 0, 0));
        for (const sx of [-1, 1]) {
          b.add(boxP(0.03, 0.22, 0.56, MAT.carbon, sx * 0.89, 1.37, -1.97));
          b.add(boxP(0.035, 0.46, 0.12, MAT.carbon, sx * 0.33, 1.15, -1.85, 0.35, 0, 0));
        }
      }
      b.add(boxP(1.5, 0.16, 0.1, MAT.carbon, 0, 0.22, -2.28));
      b.exhaust([[-0.09, 0.32, -2.32], [0.09, 0.32, -2.32]], 0.055);
      b.mirrors(0.92, 0.92, 0.66);
      b.plates(0.42, 2.31, 0.56, -2.3);
      for (const sx of [-1, 1]) b.add(rbox(0.03, 0.14, 0.4, 0.05, MAT.black, sx * b.side(0.66, -0.75), 0.66, -0.75));
    },
  },
  // Inspirado en un hiperdeportivo híbrido italiano: muy bajo, cabina adelantada, morro afilado.
  hyper: {
    clear: 0.11, belt: 0.85, nose: 0.2, tail: 0.1, tumble: 0.14,
    top: [[2.33, 0.16], [2.4, 0.3], [2.3, 0.42], [2.0, 0.53], [1.65, 0.7], [1.32, 0.82], [0.95, 0.8], [0.5, 0.74], [0, 0.76], [-0.6, 0.84], [-1.3, 0.87], [-1.9, 0.87], [-2.25, 0.81], [-2.36, 0.64], [-2.36, 0.3], [-2.33, 0.16]],
    cabin: { w: 1.36, base: 0.7, from: 1.05, tumble: 0.24, roofFrom: 0.8, roof: 'black', top: [[0.7, 0.9], [0.3, 1.06], [-0.1, 1.12], [-0.6, 1.1], [-1.1, 0.98], [-1.6, 0.9], [-2.0, 0.86]] },
    wheel: { rim: '#1e1f22', spokes: 5, split: true, caliper: '#e5b80b', w: 0.28 },
    details: (b) => {
      b.add(boxP(1.85, 0.03, 0.34, MAT.carbon, 0, 0.12, 2.25));
      b.add(boxP(0.7, 0.1, 0.04, MAT.black, 0, 0.3, 2.36, 0.3, 0, 0));
      for (const sx of [-1, 1]) {
        // faros estrechos y rasgados
        b.add(boxP(0.42, 0.05, 0.16, MAT.head, sx * 0.64, 0.6, 1.9, 0.55, sx * 0.45, 0));
        // grandes tomas de aire laterales
        b.add(rbox(0.04, 0.26, 0.7, 0.1, MAT.black, sx * (b.side(0.48, -0.55) - 0.005), 0.48, -0.55, 0, 0, -sx * 0.12));
        b.add(boxP(0.04, 0.06, 1.6, MAT.carbon, sx * b.side(0.2, 0), 0.2, 0));
        // pilotos dobles redondos
        for (const ox of [0.52, 0.76]) {
          b.add(cylP(0.075, 0.05, b.brake, sx * ox, 0.7, -2.34, Math.PI / 2, 0, 0, 20));
          b.add(part(new THREE.TorusGeometry(0.075, 0.012, 6, 20), MAT.black, sx * ox, 0.7, -2.36));
        }
      }
      b.add(boxP(1.4, 0.03, 0.22, MAT.carbon, 0, 0.92, -2.12, -0.15, 0, 0));
      b.add(boxP(1.7, 0.22, 0.16, MAT.carbon, 0, 0.22, -2.3));
      for (let i = -3; i <= 3; i++) b.add(boxP(0.02, 0.2, 0.3, MAT.carbon, i * 0.22, 0.2, -2.2));
      b.add(boxP(0.16, 0.05, 0.04, b.reverse, 0, 0.6, -2.37));
      b.exhaust([[-0.12, 0.44, -2.36], [0.12, 0.44, -2.36], [0, 0.5, -2.36]], 0.05);
      b.mirrors(0.86, 0.86, 0.72);
    },
  },
};

// ---------- Piezas del taller ----------

// Altura máxima de una polilínea [z, y] en la posición z (null si no la cruza).
function heightAt(pts, z) {
  let y = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    if (z0 === z1 || z < Math.min(z0, z1) || z > Math.max(z0, z1)) continue;
    const h = y0 + ((z - z0) / (z1 - z0)) * (y1 - y0);
    y = y === null ? h : Math.max(y, h);
  }
  return y;
}

let glowTex = null;
function neonTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

function addTuning(b, s, d, t, paint) {
  const front = d.top[0][0], rear = d.top[d.top.length - 1][0];
  const c = d.cabin;
  const cabinTop = [[c.from, c.base], ...c.top];

  // Alerón: sobre el maletero o, si el habitáculo llega hasta atrás, en el borde del techo.
  if (t.spoiler !== 'stock') {
    const zs = rear + 0.38;
    const ys = Math.max(heightAt(d.top, zs) ?? 0, heightAt(cabinTop, zs) ?? 0) + 0.01;
    const span = Math.min(s.w * 0.95, 1.8);
    if (t.spoiler === 'lip') b.add(boxP(s.w * 0.72, 0.025, 0.12, MAT.carbon, 0, ys + 0.025, zs - 0.16, 0.3, 0, 0));
    if (t.spoiler === 'ducktail') b.add(boxP(s.w * 0.78, 0.06, 0.36, paint, 0, ys + 0.05, zs - 0.06, 0.22, 0, 0));
    if (t.spoiler === 'gt') {
      b.add(boxP(span, 0.04, 0.38, MAT.carbon, 0, ys + 0.42, zs - 0.05, 0.12, 0, 0));
      for (const sx of [-1, 1]) {
        b.add(boxP(0.03, 0.2, 0.46, MAT.carbon, sx * span / 2, ys + 0.42, zs - 0.05));
        b.add(boxP(0.04, 0.42, 0.12, MAT.carbon, sx * span * 0.28, ys + 0.21, zs));
      }
    }
  }

  // Body kit: labio delantero, faldones, difusor; la carrocería ancha añade aletas en los pasos de rueda.
  if (t.kit !== 'stock') {
    b.add(boxP(s.w * 0.94, 0.025, 0.3, MAT.carbon, 0, d.clear, front - 0.1));
    for (const sx of [-1, 1]) {
      b.add(boxP(0.18, 0.02, 0.1, MAT.carbon, sx * s.w * 0.4, (heightAt(d.top, front - 0.1) ?? 0.4) * 0.6, front - 0.02, 0, sx * 0.4, 0));
      b.add(boxP(0.05, 0.09, s.wb * 0.78, MAT.carbon, sx * (b.side(d.clear + 0.06, 0) + 0.015), d.clear + 0.045, 0));
    }
    b.add(boxP(s.w * 0.7, 0.1, 0.32, MAT.carbon, 0, d.clear + 0.03, rear + 0.14));
    for (let i = -2; i <= 2; i++) b.add(boxP(0.015, 0.16, 0.34, MAT.carbon, i * s.w * 0.15, d.clear + 0.06, rear + 0.14));
    if (t.kit === 'wide') {
      const ar = s.wheelR + 0.08;
      const flare = new THREE.TorusGeometry(ar, 0.075, 6, 20, Math.PI).scale(1, 1, 1.8).rotateY(Math.PI / 2);
      for (const zw of [s.wb / 2, -s.wb / 2]) for (const sx of [-1, 1]) {
        b.add(part(flare, paint, sx * (b.side(s.wheelR + 0.15, zw) + 0.02), s.wheelR, zw));
      }
    }
  }
}

// ---------- Ensamblado ----------

// Los coches aparcados del mismo modelo comparten geometría: se construye una plantilla
// por modelo y cada copia solo cambia el material de la pintura.
const parkedTemplates = {};
export function buildCar(key, color, { parked = false, tuning = null } = {}) {
  if (parked) {
    const tpl = parkedTemplates[key] || (parkedTemplates[key] = buildCarMesh(key, '#ffffff', true));
    // clone() copia userData con JSON: lo vaciamos un momento porque contiene mallas.
    const ud = tpl.userData;
    tpl.userData = {};
    const car = tpl.clone();
    tpl.userData = ud;
    const paint = ud.paint.clone();
    paint.color.set(color);
    car.traverse(o => { if (o.isMesh && o.material === ud.paint) o.material = paint; });
    car.userData = { spec: ud.spec, paint };
    return car;
  }
  return buildCarMesh(key, color, false, tuning);
}

function buildCarMesh(key, color, parked, tuning) {
  const t = { ...DEFAULT_TUNING, ...tuning };
  const s = CARS[key] || CARS.sedan;
  const d = DESIGNS[key] || DESIGNS.sedan;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = parked
    ? new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 })
    : new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
  const brake = new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1010, emissiveIntensity: 0.5, roughness: 0.3 });
  const reverse = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 });

  body.add(part(bodyGeo(s, d), paint));
  const c = d.cabin;
  body.add(part(cabinGeo(c), MAT.glass));
  body.add(part(roofGeo(c), c.roof === 'carbon' ? MAT.carbon : c.roof === 'black' ? MAT.black : paint));
  // Bajos negros entre ruedas
  body.add(boxP(s.w * 0.92, 0.08, s.wb * 0.7, MAT.black, 0, d.clear + 0.03, 0));

  const deform = bodyDeform(s, d);
  const b = {
    brake, reverse,
    stockWing: t.spoiler === 'stock',
    // Distancia al centro de la superficie lateral de la carrocería a esa altura y posición.
    side: (y, z) => s.w / 2 * deform(y, z),
    add: (m) => body.add(m),
    lights(hx, hy, hz, hw, hh, tx, ty, tz, tw, th) {
      for (const sx of [-1, 1]) {
        body.add(rbox(hw, hh, 0.08, Math.min(hh, hw) * 0.45, MAT.head, sx * hx, hy, hz, 0, sx * 0.15, 0));
        body.add(rbox(tw, th, 0.06, Math.min(tw, th) * 0.4, brake, sx * Math.abs(tx), ty, tz, 0, -sx * 0.12, 0));
      }
      body.add(boxP(0.16, 0.06, 0.04, reverse, 0, ty - 0.12, tz - 0.01));
    },
    grille(x, y, z, w, h, mat = MAT.black) { body.add(rbox(w, h, 0.06, h * 0.3, mat, x, y, z)); if (mat !== MAT.black) body.add(rbox(w * 0.92, h * 0.8, 0.06, h * 0.25, MAT.black, x, y, z + 0.02)); },
    plates(fy, fz, ry, rz) { body.add(boxP(0.52, 0.12, 0.02, MAT.plate, 0, fy, fz)); body.add(boxP(0.52, 0.12, 0.02, MAT.plate, 0, ry, rz)); },
    exhaust(list, r = 0.045) { for (const [x, y, z] of list) body.add(cylP(r, 0.14, MAT.chrome, x, y, z)); },
    mirrors(x, y, z) {
      for (const sx of [-1, 1]) {
        body.add(rbox(0.2, 0.11, 0.1, 0.04, paint, sx * x, y, z, 0, sx * 0.15, 0));
        body.add(boxP(0.06, 0.03, 0.06, MAT.black, sx * (x - 0.1), y - 0.04, z));
      }
    },
  };
  d.details(b);
  addTuning(b, s, d, t, paint);
  body.position.y = tuningOption('height', t.height).value;

  // Ruedas
  const ws = t.rims === 'stock' ? d.wheel : { ...d.wheel, rim: tuningOption('rims', t.rims).value };
  const track = t.kit === 'wide' ? 0.05 : 0;
  const wheels = [], fronts = [];
  for (const sz of [1, -1]) for (const sx of [-1, 1]) {
    const wd = sz === -1 && (key === 'rs' || key === 'hyper') ? ws.w + 0.04 : ws.w;
    const wh = wheel(s, wd, ws);
    wh.pivot.position.set(sx * (s.w / 2 - wd / 2 - 0.03 + track), s.wheelR, sz * s.wb / 2);
    // La cara exterior mira hacia +X: en el lado izquierdo se gira media vuelta.
    if (sx < 0) { wh.spin.rotation.y = Math.PI; wh.fixed.rotation.y = Math.PI; }
    wh.spin.userData.side = sx < 0 ? -1 : 1;
    root.add(wh.pivot);
    wheels.push(wh.spin);
    if (sz === 1) fronts.push(wh.pivot);
  }

  if (parked) {
    for (const w of wheels) w.userData.keep = false;
    bake(root);
  } else {
    bake(body);
    // Cada rueda gira por separado; el disco y la pinza (grupo fijo) se fusionan aparte.
    for (const w of wheels) { w.userData.keep = false; bake(w); w.userData.keep = true; }
    for (const p of root.children) if (p !== body) p.children.forEach(ch => { if (!ch.userData.keep) bake(ch); });
  }

  // Neón bajo el coche: un halo de color en el suelo.
  if (t.neon !== 'stock') {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(s.w * 1.7, s.l * 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: tuningOption('neon', t.neon).value, map: neonTexture(), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.position.y = 0.03;
    glow.renderOrder = 1;
    root.add(glow);
  }

  root.userData = { spec: s, wheels, fronts, body, paint, brakeMat: brake, revMat: reverse };
  return root;
}
