// Modelos 3D de coches construidos con primitivas (sin archivos externos).
import * as THREE from '../vendor/three.module.min.js';
import { CARS } from './specs.js';

const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.8, roughness: 0.3 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.7 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x2b4058, metalness: 0.1, roughness: 0.08 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 1.2 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });

// [longitud relativa, desplazamiento, inclinación del parabrisas, inclinación trasera]
const CABIN = {
  sedan: [0.52, -0.06, 1.1, 0.9], hatch: [0.6, -0.1, 1.0, 0.35], suv: [0.66, -0.08, 0.8, 0.3],
  sport: [0.46, -0.06, 1.6, 1.4], pickup: [0.32, 0.12, 0.8, 0.2],
};

// Habitáculo con perfil trapezoidal (parabrisas y luneta inclinados).
function cabinGeo(width, height, len, front, rear) {
  const sh = new THREE.Shape();
  sh.moveTo(-len / 2, 0);
  sh.lineTo(len / 2, 0);
  sh.lineTo(len / 2 - front, height);
  sh.lineTo(-len / 2 + rear, height);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function box(w, h, l, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildCar(key, color) {
  const s = CARS[key] || CARS.sedan;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.35 });
  const revMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffffff, emissiveIntensity: 0 });
  const { w, l, h: H, wheelR: r } = s;

  const base = r * 0.55;
  const hb = H * (s.style === 'sport' ? 0.36 : 0.4);
  const top = base + hb;
  g.add(box(w, hb, l, paint, 0, base + hb / 2, 0));
  g.add(box(w * 1.01, 0.16, 0.14, darkMat, 0, base + 0.1, l / 2 - 0.02));
  g.add(box(w * 1.01, 0.16, 0.14, darkMat, 0, base + 0.1, -l / 2 + 0.02));

  // Habitáculo
  const [cf, co, fs, rs] = CABIN[s.style];
  const cl = l * cf, cz = l * co, ch = H - top;
  const front = ch * fs, rear = ch * rs;
  const cabin = new THREE.Mesh(cabinGeo(w * 0.84, ch, cl, front, rear), glassMat);
  cabin.position.set(0, top, cz);
  cabin.castShadow = true;
  g.add(cabin);
  const roofL = cl - front - rear;
  g.add(box(w * 0.86, 0.07, roofL + 0.1, paint, 0, top + ch, cz + (rear - front) / 2));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.1, roofL, paint, sx * w * 0.42, top + ch - 0.05, cz + (rear - front) / 2));
  for (const sx of [-1, 1]) g.add(box(0.08, 0.1, 0.16, paint, sx * (w / 2 + 0.05), top + 0.12, cz + cl / 2 - 0.05));

  if (s.style === 'pickup') {
    for (const sx of [-1, 1]) g.add(box(0.08, 0.35, l * 0.44, paint, sx * (w / 2 - 0.04), top + 0.175, -l * 0.27));
    g.add(box(w, 0.35, 0.08, paint, 0, top + 0.175, -l / 2 + 0.04));
  }
  if (s.style === 'sport') {
    g.add(box(w * 0.9, 0.05, 0.3, darkMat, 0, top + 0.25, -l / 2 + 0.22));
    for (const sx of [-1, 1]) g.add(box(0.06, 0.22, 0.1, darkMat, sx * w * 0.3, top + 0.12, -l / 2 + 0.22));
  }

  // Luces y matrícula
  for (const sx of [-1, 1]) {
    g.add(box(w * 0.22, 0.12, 0.04, headMat, sx * w * 0.3, top - 0.13, l / 2 + 0.005));
    g.add(box(w * 0.24, 0.12, 0.04, brakeMat, sx * w * 0.3, top - 0.13, -l / 2 - 0.005));
  }
  g.add(box(0.18, 0.08, 0.04, revMat, 0, top - 0.13, -l / 2 - 0.005));
  g.add(box(0.5, 0.12, 0.02, plateMat, 0, base + 0.3, -l / 2 - 0.03));
  g.add(box(0.5, 0.12, 0.02, plateMat, 0, base + 0.3, l / 2 + 0.03));

  // Ruedas: las delanteras giran sobre un pivote
  const tireGeo = new THREE.CylinderGeometry(r, r, 0.24, 20).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.25, 12).rotateZ(Math.PI / 2);
  const wheels = [], fronts = [];
  for (const sz of [1, -1]) for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (w / 2 - 0.14), r, sz * s.wb / 2);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire, new THREE.Mesh(rimGeo, rimMat));
    pivot.add(spin);
    g.add(pivot);
    wheels.push(spin);
    if (sz === 1) fronts.push(pivot);
  }

  g.userData = { spec: s, wheels, fronts, brakeMat, revMat };
  return g;
}
