import * as THREE from '../vendor/three.module.min.js';
import { CARS, CAR_ORDER, COLORS } from './specs.js';
import { LEVELS, getFreeMap } from './levels.js';
import { stepCar, carObb, collides, obstacleDist, parkedIn, PHYS_DT } from './physics.js';
import { buildCar } from './cars.js';
import { buildWorld, buildShowroom } from './world.js';
import { Drivetrain, Suspension, SkidMarks } from './effects.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { TUNING, TUNING_ORDER, DEFAULT_TUNING } from './tuning.js';
import { VOICES } from './engine-sound.js';
import { Controls } from './controls.js';
import { Sound } from './audio.js';
import { save, persist } from './storage.js';

const $ = id => document.getElementById(id);

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
// Mapa de entorno: da reflejos realistas a la pintura, el cristal y el cromo.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4a40, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);
let world = new THREE.Group();
scene.add(world);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const ENV = {
  day:      { bg: 0x9fd3ff, fog: [70, 280], hemi: 0.7, sun: 2.4, env: 0.55 },
  city:     { bg: 0xa9d8ff, fog: [90, 330], hemi: 0.7, sun: 2.4, env: 0.55 },
  indoor:   { bg: 0x1d2026, fog: [14, 60], hemi: 0.8, sun: 0.9, env: 0.35 },
  showroom: { bg: 0x161a23, fog: [25, 70], hemi: 0.8, sun: 2.6, env: 0.9 },
};
function setEnv(name) {
  const e = ENV[name];
  scene.background = new THREE.Color(e.bg);
  scene.fog = new THREE.Fog(e.bg, e.fog[0], e.fog[1]);
  hemi.intensity = e.hemi;
  scene.environmentIntensity = e.env;
  sun.intensity = e.sun;
}

function clearWorld() {
  scene.remove(world);
  world.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  world = new THREE.Group();
  scene.add(world);
}

// ---------- Estado ----------
const sound = new Sound();
sound.setMuted(save.muted);
const controls = new Controls();
const G = {
  state: 'menu', // menu | levels | garage | play
  mode: null,    // level | free
  paused: false,
  levelIndex: 0,
  data: null,
  refs: null,
  car: null,
  spec: null,
  carMesh: null,
  time: 0,
  inSpot: 0,
  over: false,
  camMode: 0,
  camYaw: 0,
  beepT: 0,
  sensorDist: 99,
  showroomCar: null,
  garageIndex: 0,
  clock: 0,
};

// ---------- UI ----------
const screens = ['menu', 'levels', 'garage', 'tuning', 'hud'];
function show(name) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  refreshCoins();
}
function refreshCoins() {
  document.querySelectorAll('.coinCount').forEach(e => { e.textContent = save.coins; });
}
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}
function modal(title, text, buttons, stars = -1) {
  $('mTitle').textContent = title;
  $('mText').textContent = text;
  $('mStars').innerHTML = stars < 0 ? '' : [1, 2, 3].map(i => `<span class="${i <= stars ? '' : 'off'}">★</span>`).join('');
  const box = $('mButtons');
  box.innerHTML = '';
  for (const [label, fn, primary] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : '');
    b.textContent = label;
    b.onclick = () => { sound.click(); hideModal(); fn(); };
    box.appendChild(b);
  }
  $('modal').classList.remove('hidden');
}
function hideModal() { $('modal').classList.add('hidden'); }

document.addEventListener('pointerdown', () => sound.init(), { capture: true });

$('btnPlay').onclick = () => { sound.click(); openLevels(); };
$('btnFree').onclick = () => { sound.click(); startFree(); };
$('btnGarage').onclick = () => { sound.click(); openGarage(); };
$('btnSound').onclick = () => {
  save.muted = !save.muted;
  sound.setMuted(save.muted);
  persist();
  updateSoundBtn();
};
function updateSoundBtn() { $('btnSound').textContent = save.muted ? '🔇 Sonido: no' : '🔊 Sonido: sí'; }
updateSoundBtn();
document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => { sound.click(); openMenu(); }; });

function openMenu() {
  G.state = 'menu';
  showShowroom(save.car, save.color);
  show('menu');
}

function openLevels() {
  G.state = 'levels';
  const grid = $('levelGrid');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const unlocked = i === 0 || (save.stars[i - 1] || 0) > 0;
    const st = save.stars[i] || 0;
    const b = document.createElement('button');
    b.className = 'lvl' + (unlocked ? '' : ' locked');
    b.innerHTML = `<b>${unlocked ? i + 1 : '🔒'}</b><small>${lv.name}</small><span class="stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
    b.onclick = () => {
      if (!unlocked) { toast('Completa el nivel anterior'); return; }
      sound.click();
      startLevel(i);
    };
    grid.appendChild(b);
  });
  show('levels');
}

// ---------- Garaje ----------
function openGarage() {
  G.state = 'garage';
  G.garageIndex = CAR_ORDER.indexOf(save.car);
  const row = $('colorRow');
  row.innerHTML = '';
  for (const c of COLORS) {
    const s = document.createElement('button');
    s.className = 'swatch';
    s.style.background = c;
    s.onclick = () => {
      sound.click();
      save.color = c;
      persist();
      renderGarage();
    };
    row.appendChild(s);
  }
  renderGarage();
  show('garage');
}

const carList = Object.values(CARS);
const MAX = {
  speed: Math.max(...carList.map(c => c.maxSpeed)),
  accel: Math.max(...carList.map(c => c.accel)),
  grip: Math.max(...carList.map(c => c.grip)),
  turn: Math.max(...carList.map(c => c.maxSteer / c.wb)),
};
function renderGarage() {
  const key = CAR_ORDER[G.garageIndex];
  const s = CARS[key];
  const owned = save.owned.includes(key);
  $('carName').textContent = s.name;
  const stat = (label, v) => `<span>${label}</span><div class="stat-bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
  $('carSub').textContent = `${s.hp} CV · 0-100 en ${String(s.zero100).replace('.', ',')} s · ${VOICES[s.engine.voice].label}`;
  $('btnTune').disabled = !owned;
  $('carStats').innerHTML =
    stat('Velocidad', s.maxSpeed / MAX.speed) + stat('Aceleración', s.accel / MAX.accel) + stat('Agarre', s.grip / MAX.grip) + stat('Giro', (s.maxSteer / s.wb) / MAX.turn);
  document.querySelectorAll('.swatch').forEach((el, i) => el.classList.toggle('sel', COLORS[i] === save.color));
  const btn = $('carAction');
  if (save.car === key) { btn.textContent = '✓ En uso'; btn.disabled = true; }
  else if (owned) { btn.textContent = 'Usar este coche'; btn.disabled = false; }
  else { btn.textContent = `Comprar · ${s.price} monedas`; btn.disabled = save.coins < s.price; }
  showShowroom(key, save.color);
  refreshCoins();
}

$('carPrev').onclick = () => { sound.click(); G.rev = null; G.garageIndex = (G.garageIndex + CAR_ORDER.length - 1) % CAR_ORDER.length; renderGarage(); };
$('carNext').onclick = () => { sound.click(); G.rev = null; G.garageIndex = (G.garageIndex + 1) % CAR_ORDER.length; renderGarage(); };
$('carAction').onclick = () => {
  const key = CAR_ORDER[G.garageIndex];
  if (!save.owned.includes(key)) {
    const price = CARS[key].price;
    if (save.coins < price) return;
    save.coins -= price;
    save.owned.push(key);
    sound.coin();
    toast(`¡${CARS[key].name} comprado!`);
  } else sound.click();
  save.car = key;
  persist();
  renderGarage();
};

const getTuning = (key) => ({ ...DEFAULT_TUNING, ...save.tuning[key] });

function showShowroom(key, color) {
  const id = `${key}${color}${JSON.stringify(getTuning(key))}`;
  if (!G.showroomCar || G.state === 'play' || G.showroomKey !== id || !world.userData.showroom) {
    clearWorld();
    setEnv('showroom');
    world.userData.showroom = true;
    world.add(buildShowroom());
    G.showroomCar = buildCar(key, color, { tuning: getTuning(key) });
    G.showroomCar.position.y = 0.2;
    world.add(G.showroomCar);
    G.showroomKey = id;
    sun.position.set(6, 14, 8);
    sun.target.position.set(0, 0, 0);
  }
}

// ---------- Partida ----------
function startLevel(i) {
  G.mode = 'level';
  G.levelIndex = i;
  const lv = LEVELS[i];
  setupPlay(lv, lv.indoor ? 'indoor' : 'day');
  $('hudLevel').textContent = `Nivel ${i + 1} · ${lv.name}`;
}

function startFree() {
  G.mode = 'free';
  setupPlay(getFreeMap(), 'city');
  $('hudLevel').textContent = 'Ciudad libre';
}

function setupPlay(data, env) {
  clearWorld();
  setEnv(env);
  G.data = data;
  G.refs = buildWorld(data, env);
  world.add(G.refs.group);
  G.spec = CARS[save.car];
  G.carMesh = buildCar(save.car, save.color, { tuning: getTuning(save.car) });
  world.add(G.carMesh);
  G.drive = new Drivetrain(G.spec.engine);
  sound.setEngine(G.spec.engine.voice);
  sound.starter();
  // Los todoterreno se inclinan más; los deportivos, menos.
  G.susp = new Suspension(G.spec.h > 1.6 ? 1.5 : G.spec.hp > 300 ? 0.6 : 1);
  G.skids = new SkidMarks(world);
  G.car = { x: data.start.x, z: data.start.z, a: data.start.a, v: 0, vl: 0, steer: 0, gear: 1 };
  G.physAcc = 0;
  G.camHeading = data.start.a;
  G.time = 0;
  G.inSpot = 0;
  G.over = false;
  G.paused = false;
  G.camYaw = 0;
  G.collected = 0;
  G.state = 'play';
  controls.reset();
  $('hint').textContent = (save.god && G.mode === 'level' ? 'Sin choques · ' : '') + data.hint;
  $('sensor').classList.toggle('hidden', G.mode !== 'level');
  $('hudTimer').textContent = G.mode === 'free' ? '0 🪙' : '0.0 s';
  hideModal();
  show('hud');
  syncCarMesh();
  updateCamera(0, true);
}

function retry() {
  if (G.mode === 'level') startLevel(G.levelIndex);
  else startFree();
}

function pause() {
  if (G.state !== 'play' || G.over) return;
  G.paused = true;
  sound.engine(false, 0, 0);
  sound.squeal(0);
  modal('Pausa', G.mode === 'level' ? LEVELS[G.levelIndex].hint : 'Recoge las monedas por la ciudad.', [
    ['Continuar', () => { G.paused = false; }, true],
    ['Reiniciar', retry],
    ['Menú', openMenu],
  ]);
}

function fail(reason) {
  G.over = true;
  sound.crash();
  setTimeout(() => sound.fail(), 250);
  if (navigator.vibrate) navigator.vibrate(200);
  modal('¡Has chocado!', reason, [
    ['Reintentar', retry, true],
    ['Niveles', openLevels],
  ]);
}

function complete() {
  G.over = true;
  const i = G.levelIndex;
  const par = LEVELS[i].par;
  const stars = G.time <= par ? 3 : G.time <= par * 1.6 ? 2 : 1;
  const first = !save.stars[i];
  const reward = (first ? 100 + i * 25 : 20) + stars * 20;
  save.stars[i] = Math.max(save.stars[i] || 0, stars);
  save.coins += reward;
  persist();
  sound.success();
  const buttons = [];
  if (i + 1 < LEVELS.length) buttons.push(['Siguiente ▶', () => startLevel(i + 1), true]);
  buttons.push(['Repetir', retry], ['Niveles', openLevels]);
  const extra = i + 1 < LEVELS.length ? '' : '\n¡Has completado todos los niveles!';
  modal('¡Aparcado!', `Tiempo: ${G.time.toFixed(1)} s  ·  +${reward} monedas${extra}`, buttons, stars);
}

controls.onPause = () => { if (G.paused) { hideModal(); G.paused = false; } else pause(); };
controls.onCamera = () => cycleCamera();
controls.onGear = g => {
  const b = $('btnGear');
  b.textContent = g === 1 ? 'D' : 'R';
  b.classList.toggle('rev', g === -1);
};
controls.bind({ wheel: $('wheel'), gas: $('pedGas'), brake: $('pedBrake'), hand: $('btnHand'), gear: $('btnGear'), left: $('btnLeft'), right: $('btnRight') });

// Tipo de dirección táctil: volante o botones ◀ ▶.
function applyControlMode() {
  const buttons = save.controls === 'buttons';
  $('wheel').classList.toggle('hidden', buttons);
  $('steerBtns').classList.toggle('hidden', !buttons);
  $('btnControls').textContent = buttons ? '🎮 Dirección: botones' : '🎮 Dirección: volante';
}
$('btnControls').onclick = () => {
  sound.click();
  save.controls = save.controls === 'buttons' ? 'wheel' : 'buttons';
  persist();
  applyControlMode();
};
applyControlMode();
$('btnPause').onclick = () => { sound.click(); pause(); };
$('btnCam').onclick = () => { sound.click(); cycleCamera(); };

const CAM_NAMES = ['Cámara: detrás', 'Cámara: alta', 'Cámara: cenital', 'Cámara: capó'];
function cycleCamera() {
  G.camMode = (G.camMode + 1) % 4;
  G.camYaw = 0;
  toast(CAM_NAMES[G.camMode]);
  updateCamera(0, true);
}

// Arrastrar sobre la escena gira la cámara alrededor del coche.
let drag = null;
$('c').addEventListener('pointerdown', e => { drag = { x: e.clientX, id: e.pointerId }; });
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id || G.state !== 'play') return;
  G.camYaw -= (e.clientX - drag.x) * 0.008;
  drag.x = e.clientX;
});
addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) drag = null; });
$('c').addEventListener('dblclick', () => { G.camYaw = 0; });

// ---------- Bucle ----------
function syncCarMesh() {
  const { car, carMesh } = G;
  carMesh.position.set(car.x, 0, car.z);
  carMesh.rotation.y = car.a;
  const ud = carMesh.userData;
  for (const p of ud.fronts) p.rotation.y = car.steer;
  ud.brakeMat.emissiveIntensity = car.braking ? 2.5 : 0.35;
  ud.revMat.emissiveIntensity = car.gear === -1 ? 2 : 0;
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
function updateCamera(dt, snap) {
  const { car } = G;
  // El rumbo de la cámara persigue al del coche con algo de retraso: en las curvas se ve
  // el lateral del coche sin que la cámara se vaya hacia fuera.
  let dA = car.a - G.camHeading;
  dA = Math.atan2(Math.sin(dA), Math.cos(dA));
  G.camHeading = snap ? car.a : G.camHeading + dA * Math.min(1, dt * 3.5);
  const yaw = G.camHeading + G.camYaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const cfx = Math.sin(car.a), cfz = Math.cos(car.a);
  switch (G.camMode) {
    case 0: camPos.set(car.x - fx * 7.5, 3.2, car.z - fz * 7.5); camLook.set(car.x + cfx * 1.5, 0.9, car.z + cfz * 1.5); break;
    case 1: camPos.set(car.x - fx * 5, 13, car.z - fz * 5); camLook.set(car.x + cfx * 1.5, 0, car.z + cfz * 1.5); break;
    case 2: camPos.set(car.x - fx * 0.01, 24, car.z - fz * 0.01); camLook.set(car.x, 0, car.z); break;
    case 3: camPos.set(car.x + cfx * 0.2, 1.2, car.z + cfz * 0.2); camLook.set(car.x + Math.sin(yaw) * 10, 0.8, car.z + Math.cos(yaw) * 10); break;
  }
  if (G.data.indoor && G.camMode !== 2) {
    // Bajo techo la cámara no puede atravesar techo ni muros.
    const b = G.data.bounds;
    camPos.y = Math.min(camPos.y, 3.1);
    camPos.x = Math.min(Math.max(camPos.x, b.minX + 0.6), b.maxX - 0.6);
    camPos.z = Math.min(Math.max(camPos.z, b.minZ + 0.6), b.maxZ - 0.6);
  }
  const k = snap || G.camMode === 3 ? 1 : 1 - Math.exp(-dt * 10);
  camera.position.lerp(camPos, k);
  camera.lookAt(camLook);
  // Algo más de campo de visión a mucha velocidad: sensación de velocidad.
  const fov = 60 + Math.min(12, Math.abs(car.v) * 0.35);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  sun.position.set(car.x + 25, 45, car.z + 15);
  sun.target.position.set(car.x, 0, car.z);
}

function firstHit(car, spec, obstacles) {
  const obb = carObb(car, spec);
  for (const o of obstacles) if (collides(obb, o)) return o;
  return null;
}

// Prueba a conservar solo el movimiento en X o solo en Z (con el nuevo rumbo o con el anterior).
function slideAlong(car, prev, spec, obstacles) {
  const next = { x: car.x, z: car.z, a: car.a };
  for (const t of [
    { x: next.x, z: prev.z, a: next.a }, { x: prev.x, z: next.z, a: next.a },
    { x: next.x, z: prev.z, a: prev.a }, { x: prev.x, z: next.z, a: prev.a },
  ]) {
    Object.assign(car, t);
    if (!firstHit(car, spec, obstacles)) return true;
  }
  Object.assign(car, next);
  return false;
}

function updatePlay(dt) {
  const { car, spec, data } = G;
  const inp = controls.update(dt, car.v);
  car.gear = controls.gear;
  if (G.over) { inp.throttle = 0; inp.handbrake = true; }

  const v0 = car.v;
  // Física a paso fijo (varios pasos pequeños por fotograma): mismo comportamiento con
  // cualquier fps y sin atravesar muros finos a mucha velocidad.
  G.physAcc = Math.min((G.physAcc || 0) + dt, 0.1);
  let hit = null, impact = 0;
  while (G.physAcc >= PHYS_DT && !hit) {
    G.physAcc -= PHYS_DT;
    const prev = { x: car.x, z: car.z, a: car.a, vl: car.vl };
    stepCar(car, inp, spec, PHYS_DT);
    hit = firstHit(car, spec, data.obstacles);
    if (!hit) continue;
    impact = Math.abs(car.v);
    // En la ciudad, el coche resbala a lo largo de la pared en lugar de quedarse clavado.
    if (G.mode === 'free' && slideAlong(car, prev, spec, data.obstacles)) {
      car.v *= 0.995;
      car.vl *= 0.5;
      if (impact > 6 && !G.scrapeT) { sound.crash(); G.scrapeT = 0.6; }
      hit = null;
      continue;
    }
    Object.assign(car, prev);
    car.v = -car.v * 0.25;
    car.vl = 0;
  }
  G.scrapeT = Math.max(0, (G.scrapeT || 0) - dt);
  const obb = carObb(car, spec);
  if (hit) {
    G.susp.kick(impact * 0.08 * Math.sign(v0));
    if (G.mode === 'level' && !G.over && !save.god) {
      const what = { car: 'Has golpeado un coche aparcado.', cone: 'Has derribado un cono.', pillar: 'Has golpeado una columna.' }[hit.type] || 'Has golpeado un muro.';
      fail(what);
    } else if (impact > (save.god ? 1 : 2.5)) {
      sound.crash();
    }
  }

  if (!G.over) G.time += dt;
  const ud = G.carMesh.userData;
  for (const w of ud.wheels) w.rotation.x += (car.v * dt) / spec.wheelR;
  syncCarMesh();
  updateDynamics(dt, inp, (car.v - v0) / dt);

  // Monedas (modo libre)
  for (const c of G.refs.coins) {
    if (c.taken) continue;
    c.mesh.rotation.y += dt * 3;
    if (Math.hypot(c.x - car.x, c.z - car.z) < 2) {
      c.taken = true;
      c.mesh.visible = false;
      save.coins += 10;
      G.collected++;
      persist();
      sound.coin();
      if (G.refs.coins.every(k => k.taken)) {
        save.coins += 200;
        persist();
        toast('¡Todas las monedas! +200');
      }
    }
  }

  // Aparcamiento (modo niveles)
  if (G.mode === 'level') {
    const ok = !G.over && parkedIn(car, spec, data.target);
    G.inSpot = ok ? G.inSpot + (Math.abs(car.v) < 0.15 ? dt : 0) : 0;
    G.refs.target.update(G.clock, ok ? 'ok' : 'idle');
    $('parkBar').classList.toggle('show', ok);
    $('parkBar').firstElementChild.style.width = `${Math.min(1, G.inSpot / 1.2) * 100}%`;
    if (ok && G.inSpot >= 1.2) complete();

    // Sensores de aparcamiento
    let d = Infinity;
    for (const o of data.obstacles) d = Math.min(d, obstacleDist(obb, o));
    G.sensorDist = d;
    const level = d < 0.3 ? 5 : d < 0.6 ? 4 : d < 1 ? 3 : d < 1.5 ? 2 : d < 2.2 ? 1 : 0;
    document.querySelectorAll('#sensor span').forEach((s, i) => s.classList.toggle('on', i < level));
    if (level >= 2 && !G.over && !G.paused) {
      G.beepT -= dt;
      if (G.beepT <= 0) { sound.beep(); G.beepT = [0, 0, 0.6, 0.35, 0.18, 0.09][level]; }
    } else G.beepT = 0;
  }

  $('hudTimer').textContent = G.mode === 'free' ? `${G.collected} / ${G.refs.coins.length} 🪙` : `${G.time.toFixed(1)} s`;
  $('spd').textContent = Math.round(Math.abs(car.v) * 3.6);
  const e = spec.engine;
  $('gearTxt').textContent = car.gear === -1 ? 'R' : `D${G.drive.gear + 1}`;
  $('rpmBar').firstElementChild.style.width = `${Math.min(100, (G.drive.rpm / e.red) * 100)}%`;
  sound.engine(!G.over, G.drive.rpm, inp.throttle, e.red);
  updateCamera(dt, false);
}

// Suspensión, motor, derrapes y marcas de frenada.
function updateDynamics(dt, inp, longAcc) {
  const { car, spec } = G;
  const latAcc = (car.v * car.v * Math.tan(car.steer)) / spec.wb * Math.sign(car.v);
  G.susp.update(latAcc, longAcc, dt);
  const body = G.carMesh.userData.body;
  body.rotation.z = G.susp.roll;
  body.rotation.x = G.susp.pitch;
  if (G.drive.update(car.v, inp.throttle, dt) && inp.throttle > 0) sound.shift();

  // Derrape: curva al límite de agarre, frenazo fuerte o freno de mano a velocidad.
  const sp = Math.abs(car.v);
  const corner = Math.max(0, (Math.abs(latAcc) - spec.grip * 0.8) / (spec.grip * 0.2));
  const braking = inp.brake > 0.8 && sp > 6 ? 0.5 : 0;
  const hand = inp.handbrake && sp > 3 ? 1 : 0;
  const drift = Math.min(1, (car.slip || 0) / 2.5);
  const slip = G.over ? 0 : Math.min(1, Math.max(corner, braking, hand, drift));
  sound.squeal(slip);
  const fx = Math.sin(car.a), fz = Math.cos(car.a), rx = Math.cos(car.a), rz = -Math.sin(car.a);
  const half = spec.w / 2 - 0.15;
  for (const [id, along, side] of [['rl', -1, -1], ['rr', -1, 1], ['fl', 1, -1], ['fr', 1, 1]]) {
    const front = along > 0;
    const active = slip > 0.3 && (!front || !hand);
    if (!active) { G.skids.lift(id); continue; }
    const ax = (spec.wb / 2) * along;
    G.skids.mark(id, car.x + fx * ax + rx * half * side, car.z + fz * ax + rz * half * side, car.a);
  }
}

function updateShowroom(dt) {
  const t = G.clock * 0.25;
  const inGarage = G.state === 'garage' || G.state === 'tuning';
  const r = inGarage ? 7.5 : 8;
  camera.position.set(Math.sin(t) * r, 2.4, Math.cos(t) * r);
  // En el garaje horizontal el panel ocupa la derecha: desplazamos el coche a la izquierda.
  const side = inGarage && innerWidth > innerHeight ? 2.2 : 0;
  const lift = inGarage && innerWidth <= innerHeight ? -1.2 : 0.9;
  camera.lookAt(Math.cos(t) * side, lift, -Math.sin(t) * side);
  updateRev(dt, inGarage);
  sound.squeal(0);
}

// ---------- Escuchar motor (garaje) ----------
// Secuencia: arranque, ralentí, acelerón corto, subida hasta el corte y soltar (soplido/petardeos).
function revScript(t, e) {
  if (t < 0.55) return [250, 0];
  if (t < 1.6) return [e.idle * (1 + 1.1 * Math.exp(-(t - 0.55) * 4)), 0];
  if (t < 1.95) return [e.red * 0.62, 1];
  if (t < 2.6) return [e.idle, 0];
  if (t < 3.8) return [e.red * 0.97, 1];
  if (t < 6.2) return [e.idle, 0];
  return null;
}
function startRev(key) {
  const e = CARS[key].engine;
  sound.init();
  sound.setEngine(e.voice);
  sound.starter();
  G.rev = { t: 0, e, rpm: 0 };
}
function updateRev(dt, inGarage) {
  const step = G.rev && inGarage ? revScript(G.rev.t, G.rev.e) : null;
  if (!step) {
    G.rev = null;
    sound.engine(false, 0, 0);
    return;
  }
  G.rev.t += dt;
  const [target, thr] = step;
  G.rev.rpm += (target - G.rev.rpm) * Math.min(1, dt * (target > G.rev.rpm ? 5 : 2.5));
  sound.engine(true, G.rev.rpm, thr, G.rev.e.red);
  // La carrocería tiembla un poco con los acelerones.
  if (G.showroomCar) G.showroomCar.userData.body.rotation.z = thr * Math.sin(G.clock * 60) * 0.004;
}
$('btnRev').onclick = () => startRev(CAR_ORDER[G.garageIndex]);

// ---------- Taller ----------
G.tuneCat = 'spoiler';
function openTuning() {
  const key = CAR_ORDER[G.garageIndex];
  if (!save.owned.includes(key)) { toast('Compra el coche para tunearlo'); return; }
  sound.click();
  G.state = 'tuning';
  renderTuning();
  show('tuning');
}
function renderTuning() {
  const key = CAR_ORDER[G.garageIndex];
  const cur = getTuning(key);
  $('tuneCar').textContent = CARS[key].name;
  const tabs = $('tuneTabs');
  tabs.innerHTML = '';
  for (const cat of TUNING_ORDER) {
    const b = document.createElement('button');
    b.className = 'tab' + (cat === G.tuneCat ? ' sel' : '');
    b.textContent = TUNING[cat].label;
    b.onclick = () => { sound.click(); G.tuneCat = cat; renderTuning(); };
    tabs.appendChild(b);
  }
  const box = $('tuneOptions');
  box.innerHTML = '';
  for (const o of TUNING[G.tuneCat].options) {
    const owned = o.price === 0 || save.parts.includes(`${key}:${G.tuneCat}:${o.id}`);
    const sel = cur[G.tuneCat] === o.id;
    const b = document.createElement('button');
    b.className = 'opt' + (owned ? ' owned' : '') + (sel ? ' sel' : '');
    const dot = o.value && typeof o.value === 'string' ? `<span class="dot" style="background:${o.value}"></span>` : '';
    b.innerHTML = `<b>${dot}${o.name}</b><small>${sel ? 'Montado' : owned ? 'Comprado' : `${o.price} monedas`}</small>`;
    b.onclick = () => chooseTuning(key, G.tuneCat, o, owned);
    box.appendChild(b);
  }
  $('tuneInfo').textContent = 'Las piezas se compran una vez por coche y luego puedes cambiarlas gratis.';
  showShowroom(key, save.color);
  refreshCoins();
}
function chooseTuning(key, cat, o, owned) {
  if (!owned) {
    if (save.coins < o.price) { sound.fail(); toast(`Te faltan ${o.price - save.coins} monedas`); return; }
    save.coins -= o.price;
    save.parts.push(`${key}:${cat}:${o.id}`);
    sound.coin();
    toast(`Comprado: ${o.name}`);
  } else sound.click();
  save.tuning[key] = { ...getTuning(key), [cat]: o.id };
  persist();
  renderTuning();
}
$('btnTune').onclick = openTuning;
$('tuneBack').onclick = () => {
  sound.click();
  G.state = 'garage';
  renderGarage();
  show('garage');
};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.clock += dt;
  if (G.state === 'play') { if (!G.paused) updatePlay(dt); }
  else updateShowroom(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- Modo admin ----------
// Se abre tocando 5 veces el título del menú (o con #admin al final del enlace) e introduciendo el PIN.
// El PIN por defecto es 1234 y se puede cambiar desde el propio panel.
const adminEl = $('admin');
let titleTaps = [];
document.querySelector('.title').addEventListener('pointerdown', () => {
  const now = performance.now();
  titleTaps = titleTaps.filter(t => now - t < 2500).concat(now);
  if (titleTaps.length >= 5) { titleTaps = []; openAdmin(); }
});

function openAdmin() {
  if (G.state === 'play') return;
  $('adminLock').classList.remove('hidden');
  $('adminBody').classList.add('hidden');
  $('adminErr').textContent = '';
  $('adminPin').value = '';
  adminEl.classList.remove('hidden');
  setTimeout(() => $('adminPin').focus(), 50);
}
function closeAdmin() {
  adminEl.classList.add('hidden');
  refreshCoins();
  if (G.state === 'garage') renderGarage();
  if (G.state === 'levels') openLevels();
}
function tryPin() {
  if ($('adminPin').value === String(save.adminPin)) {
    sound.success();
    $('adminLock').classList.add('hidden');
    $('adminBody').classList.remove('hidden');
    renderAdmin();
  } else {
    sound.fail();
    $('adminErr').textContent = 'PIN incorrecto';
    $('adminPin').value = '';
  }
}
function renderAdmin() {
  $('adminStatus').textContent = `${save.coins.toLocaleString('es-ES')} monedas · ${save.owned.length}/${CAR_ORDER.length} coches · ${Object.keys(save.stars).length}/${LEVELS.length} niveles`;
  const god = $('adminGod');
  god.textContent = `Sin choques: ${save.god ? 'SÍ' : 'NO'}`;
  god.classList.toggle('on-state', !!save.god);
  refreshCoins();
}
const ADMIN_ACTIONS = {
  add10k: () => { save.coins += 10000; return '+10.000 monedas'; },
  add100k: () => { save.coins += 100000; return '+100.000 monedas'; },
  million: () => { save.coins = 1000000; return 'Monedas: 1.000.000'; },
  cars: () => { save.owned = [...CAR_ORDER]; return 'Todos los coches desbloqueados'; },
  parts: () => {
    save.parts = CAR_ORDER.flatMap(k => TUNING_ORDER.flatMap(cat => TUNING[cat].options.map(o => `${k}:${cat}:${o.id}`)));
    return 'Todas las piezas del taller desbloqueadas';
  },
  levels: () => { LEVELS.forEach((_, i) => { save.stars[i] = 3; }); return 'Todos los niveles con 3 estrellas'; },
  god: () => { save.god = !save.god; return save.god ? 'Sin choques activado' : 'Sin choques desactivado'; },
};
document.querySelectorAll('[data-admin]').forEach(b => {
  b.onclick = () => {
    const msg = ADMIN_ACTIONS[b.dataset.admin]();
    persist();
    sound.coin();
    renderAdmin();
    toast(msg);
  };
});
$('adminEnter').onclick = tryPin;
$('adminPin').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });
$('adminCancel').onclick = closeAdmin;
$('adminClose').onclick = closeAdmin;
$('adminSavePin').onclick = () => {
  const pin = $('adminNewPin').value.trim();
  if (!/^\d{4,8}$/.test(pin)) { toast('El PIN debe tener de 4 a 8 números'); return; }
  save.adminPin = pin;
  persist();
  $('adminNewPin').value = '';
  toast('PIN cambiado');
};
// El reinicio pide un segundo toque para confirmar.
let resetArmed = null;
$('adminReset').onclick = () => {
  const b = $('adminReset');
  if (!resetArmed) {
    b.textContent = '¿Seguro? Toca otra vez';
    resetArmed = setTimeout(() => { resetArmed = null; b.textContent = 'Reiniciar partida'; }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  b.textContent = 'Reiniciar partida';
  Object.assign(save, { coins: 0, owned: ['sedan'], car: 'sedan', stars: {}, god: false, tuning: {}, parts: [] });
  persist();
  renderAdmin();
  showShowroom(save.car, save.color);
  toast('Partida reiniciada');
};
const checkAdminHash = () => { if (location.hash === '#admin') openAdmin(); };
addEventListener('hashchange', checkAdminHash);

window.__game = G; // útil para depurar desde la consola
openMenu();
checkAdminHash();
requestAnimationFrame(frame);
