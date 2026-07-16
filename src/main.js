import * as THREE from 'three';
import { buildTrack, mulberry32 } from './track.js';
import { verde } from './tracks/verde.js';
import { createPlayerState, stepPlayer, PARAMS } from './player.js';
import {
  createRace, updateRace, pauseRace, resumeRace, formatTime,
  loadBest, saveBest, loadBestSpeed, saveBestSpeed,
} from './race.js';
import { createControls } from './controls.js';
import { createHud } from './hud.js';
import { createSnowSound } from './audio.js';

const query = new URLSearchParams(location.search);
const AUTOPILOT = query.get('autopilot') === '1';
const TIMESCALE = parseFloat(query.get('timescale') || '1');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('error-screen').classList.add('visible');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe8fb);
scene.fog = new THREE.Fog(0xcfe8fb, 60, 260);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(80, 120, -40);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3000);
const skis = makeSkis();
camera.add(skis);
scene.add(camera); // necesario para que se rendericen los hijos de la cámara

const track = buildTrack(verde);
const START_S = 15;
const FINISH_S = track.length - 15;

const snowTexture = makeSnowTexture();
scene.add(makeRibbon(track, -track.width / 2, track.width / 2, 0xf4f9ff, 0, snowTexture));
scene.add(makeRibbon(track, track.width / 2, track.width / 2 + 25, 0xdde7ee, 0.15, snowTexture));
scene.add(makeRibbon(track, -track.width / 2 - 25, -track.width / 2, 0xdde7ee, 0.15, snowTexture));
scene.add(makeTrees(track));
scene.add(makeRocks(track));
scene.add(makeRamps(track));
scene.add(makeGate(track, START_S, 0xd04040));
scene.add(makeGate(track, FINISH_S, 0x3050c0));

const sceneryCenter = track.toWorld(track.length / 2, 0, 0);
scene.add(makeSky(sceneryCenter));
scene.add(makeMountains(sceneryCenter));
scene.add(makeClouds(sceneryCenter));

let player = createPlayerState();
let race = createRace(START_S, FINISH_S);
let started = false;
let finishShown = false;
let paused = false;
let steerSmooth = 0; // input suavizado: entrada/salida de giro progresiva, estilo slalom
let runMaxSpeed = 0; // velocidad máxima de la bajada actual (m/s)

const hud = createHud();
const controls = createControls();
const snow = createSnowSound();

document.getElementById('btn-touch').addEventListener('click', () => startGame('touch'));
document.getElementById('btn-gyro').addEventListener('click', () => startGame('gyro'));
document.getElementById('btn-restart').addEventListener('click', restart);
document.getElementById('btn-pause').addEventListener('click', pauseGame);
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart-pause').addEventListener('click', restart);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
    if (paused) resumeGame();
    else pauseGame();
  }
});

// Auto-pausa al perder el foco (cambio de app/pestaña): el crono no debe correr solo.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

function startGame(mode) {
  snow.start(); // dentro del gesto del usuario, requisito de iOS
  controls.setMode(mode).then((ok) => {
    if (!ok) hud.flash('Giroscopio no disponible, usando táctil');
    hud.hideStart();
    started = true;
  });
}

function restart() {
  player = createPlayerState();
  race = createRace(START_S, FINISH_S);
  finishShown = false;
  paused = false;
  steerSmooth = 0;
  runMaxSpeed = 0;
  hud.hideFinish();
  document.getElementById('pause-screen').classList.remove('visible');
}

function pauseGame() {
  if (!started || paused || race.status === 'finished') return;
  paused = true;
  race = pauseRace(race, performance.now());
  document.getElementById('pause-screen').classList.add('visible');
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  race = resumeRace(race, performance.now());
  document.getElementById('pause-screen').classList.remove('visible');
}

// Autopilot para verificación e2e: feedforward de curvatura + corrección PD del lateral.
function autopilotSteer() {
  const ahead = track.frameAt(player.s + 8);
  const steerFF = (ahead.curvature * player.speed) / PARAMS.turnRate;
  const headingTarget = Math.max(-0.4, Math.min(0.4, -0.05 * player.lat));
  return Math.max(-1, Math.min(1, steerFF + (headingTarget - player.heading) * 3));
}

function finish() {
  finishShown = true;
  const time = race.elapsed;
  const maxKmh = Math.round(runMaxSpeed * 3.6);
  const recordEligible = TIMESCALE === 1 && !AUTOPILOT;
  const isRecord = recordEligible ? saveBest(localStorage, track.data.name, time) : false;
  if (recordEligible) saveBestSpeed(localStorage, track.data.name, maxKmh);
  const best = loadBest(localStorage, track.data.name);
  const bestSpeed = loadBestSpeed(localStorage, track.data.name);
  hud.showFinish(
    `Tiempo: ${formatTime(time)}`,
    `Mejor: ${best == null ? '—' : formatTime(best)}`,
    `Vel. máx: ${maxKmh} km/h (récord: ${bestSpeed == null ? '—' : `${bestSpeed} km/h`})`,
    isRecord,
  );
}

function updateCamera() {
  const f = track.frameAt(player.s);
  const eye = player.fallen ? 0.6 : 1.7;
  const pos = track.toWorld(player.s, player.lat, player.height + eye);
  camera.position.copy(pos);
  const dir = f.tan.clone().multiplyScalar(Math.cos(player.heading))
    .addScaledVector(f.side, Math.sin(player.heading));
  camera.lookAt(pos.clone().add(dir));
  camera.rotateZ(player.fallen ? 0.5 : steerSmooth * 0.16);
  const fov = Math.min(95, 70 + player.speed * 0.9);
  if (Math.abs(fov - camera.fov) > 0.1) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  skis.visible = !player.fallen;
  skis.rotation.z = steerSmooth * 0.35;   // canteo al girar
  skis.rotation.y = steerSmooth * 0.12;   // las puntas apuntan hacia el giro
  skis.rotation.x = player.airborne ? 0.15 : 0;
}

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, 0.05) * TIMESCALE;
  last = now;

  if (started && !paused && race.status !== 'finished') {
    const rawSteer = AUTOPILOT ? autopilotSteer() : controls.steer();
    steerSmooth += (rawSteer - steerSmooth) * Math.min(1, dt * 3);
    const prev = player;
    player = stepPlayer(player, steerSmooth, dt, track);
    race = updateRace(race, player.s, now);
    if (race.status === 'running') runMaxSpeed = Math.max(runMaxSpeed, player.speed);
    if (player.fallen && !prev.fallen) hud.flash('¡Te has caído!');
    if (player.airborne && !prev.airborne) hud.flash('¡Salto!', 800);
    if (race.status === 'finished' && !finishShown) finish();
  }

  updateCamera();
  const gliding = started && !paused && race.status !== 'finished'
    && !player.airborne && !player.fallen;
  snow.update(gliding ? player.speed : 0, steerSmooth, gliding);
  hud.setTimer(race.status === 'ready' ? '00:00.00' : formatTime(race.elapsed));
  hud.setSpeed(player.speed * 3.6);
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__game = { state: () => ({ player, race, paused }), trackLength: track.length };

// ---------- construcción de la escena ----------

// Cúpula de cielo con degradé: pálido en el horizonte, azul intenso en el cenit.
function makeSky(center) {
  const radius = 1800;
  const geo = new THREE.SphereGeometry(radius, 16, 12);
  const posAttr = geo.getAttribute('position');
  const horizon = new THREE.Color(0xcfe8fb);
  const zenith = new THREE.Color(0x3f86d8);
  const colors = [];
  for (let i = 0; i < posAttr.count; i++) {
    const t = Math.max(0, posAttr.getY(i) / radius);
    const c = horizon.clone().lerp(zenith, Math.pow(t, 0.7));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
  );
  mesh.position.copy(center);
  return mesh;
}

// Cordillera nevada low-poly en anillo alrededor de la pista.
function makeMountains(center) {
  const rng = mulberry32(2024);
  const peaks = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const dist = 700 + rng() * 350;
    const height = 180 + rng() * 220;
    const radius = height * (0.7 + rng() * 0.4);
    const peak = new THREE.ConeGeometry(radius, height, 5 + Math.floor(rng() * 3));
    peak.rotateY(rng() * Math.PI);
    peak.translate(
      center.x + Math.cos(angle) * dist,
      center.y - 60 + height / 2,
      center.z + Math.sin(angle) * dist,
    );
    peaks.push(peak);
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(peaks),
    // Emisivo azulado: levanta las caras en sombra como nieve iluminada por el cielo.
    new THREE.MeshLambertMaterial({
      color: 0xf2f7fd,
      emissive: 0x8ba4c2,
      emissiveIntensity: 0.45,
      flatShading: true,
      fog: false,
    }),
  );
  return mesh;
}

// Nubes: racimos de esferas aplastadas, blancas y mate.
function makeClouds(center) {
  const rng = mulberry32(31);
  const puffs = [];
  for (let i = 0; i < 10; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 150 + rng() * 650;
    const cx = center.x + Math.cos(angle) * dist;
    const cy = center.y + 170 + rng() * 160;
    const cz = center.z + Math.sin(angle) * dist;
    const clusterScale = 18 + rng() * 16;
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.SphereGeometry(1, 8, 6);
      puff.scale(
        clusterScale * (1.1 + rng() * 0.5),
        clusterScale * (0.5 + rng() * 0.3),
        clusterScale * (0.9 + rng() * 0.4),
      );
      puff.translate(
        cx + (rng() - 0.5) * clusterScale * 1.8,
        cy + (rng() - 0.5) * clusterScale * 0.5,
        cz + (rng() - 0.5) * clusterScale * 1.4,
      );
      puffs.push(puff);
    }
  }
  // Blanco plano sin sombreado: lectura limpia de nube de dibujo animado.
  return new THREE.Mesh(
    mergeGeometries(puffs),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
  );
}

// Textura de nieve procedural: gránulos y manchas suaves sobre blanco.
function makeSnowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const rng = mulberry32(99);
  // Dibuja en las 9 posiciones envueltas para que la textura repita sin costuras.
  const wrapped = (draw) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(ox, oy);
  };
  for (let i = 0; i < 60; i++) { // manchas anchas y tenues (ondulaciones)
    const x = rng() * size;
    const y = rng() * size;
    const r = 20 + rng() * 40;
    wrapped((ox, oy) => {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(185, 200, 222, 0.07)');
      grad.addColorStop(1, 'rgba(185, 200, 222, 0)');
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  for (let i = 0; i < 1600; i++) { // gránulos finos
    const a = 0.05 + rng() * 0.09;
    const x = rng() * size;
    const y = rng() * size;
    const s = 0.6 + rng() * 1.5;
    g.fillStyle = `rgba(140, 165, 200, ${a})`;
    wrapped((ox, oy) => g.fillRect(x + ox, y + oy, s, s));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRibbon(track, latA, latB, color, drop, map) {
  const rows = 400;
  const TEX_METERS = 4; // la textura se repite cada 4 m en ambos ejes
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= rows; i++) {
    const s = (i / rows) * track.length;
    const a = track.toWorld(s, latA, -drop);
    const b = track.toWorld(s, latB, -drop);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uv.push(latA / TEX_METERS, s / TEX_METERS, latB / TEX_METERS, s / TEX_METERS);
  }
  for (let i = 0; i < rows; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, map, side: THREE.DoubleSide }));
}

// Une varias geometrías (pequeñas) en una sola, para copas por pisos.
function mergeGeometries(geometries) {
  const parts = geometries.map((g) => g.toNonIndexed());
  let floats = 0;
  for (const g of parts) floats += g.getAttribute('position').array.length;
  const pos = new Float32Array(floats);
  const norm = new Float32Array(floats);
  let offset = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array, offset);
    norm.set(g.getAttribute('normal').array, offset);
    offset += g.getAttribute('position').array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return out;
}

// Dos especies: abeto clásico (ancho) y abeto alto de verde oscuro con copa en pisos.
// Función (no const) para que esté disponible al construir la escena al cargar el módulo.
function treeSpecies() {
  const tallFoliage = mergeGeometries([
    new THREE.ConeGeometry(1.35, 3.2, 8).translate(0, 1.2, 0),
    new THREE.ConeGeometry(1.05, 2.8, 8).translate(0, 3.0, 0),
    new THREE.ConeGeometry(0.7, 2.4, 8).translate(0, 4.8, 0),
  ]);
  return {
    standard: {
      foliageGeo: new THREE.ConeGeometry(1.6, 4.5, 8),
      foliageColor: 0x1d5c33,
      foliageY: 2.8,
      trunkGeo: new THREE.CylinderGeometry(0.25, 0.3, 1.6, 6),
      trunkColor: 0x5a3d24,
      trunkY: 0.8,
    },
    tall: {
      foliageGeo: tallFoliage,
      foliageColor: 0x0e3a1f,
      foliageY: 1.4, // la copa por pisos arranca sobre el tronco (offsets ya en la geometría)
      trunkGeo: new THREE.CylinderGeometry(0.16, 0.22, 2.4, 6),
      trunkColor: 0x4a3220,
      trunkY: 1.2,
    },
  };
}

function buildTreeInstances(track, positions, species) {
  const foliage = new THREE.InstancedMesh(
    species.foliageGeo,
    new THREE.MeshLambertMaterial({ color: species.foliageColor, flatShading: true }),
    positions.length,
  );
  const trunk = new THREE.InstancedMesh(
    species.trunkGeo,
    new THREE.MeshLambertMaterial({ color: species.trunkColor }),
    positions.length,
  );
  const m = new THREE.Matrix4();
  const rng = mulberry32(1234);
  positions.forEach((p, i) => {
    const w = track.toWorld(p.s, p.lat, 0);
    m.makeScale(p.scale, p.scale, p.scale).setPosition(w.x, w.y + species.foliageY * p.scale, w.z);
    foliage.setMatrixAt(i, m);
    m.makeScale(p.scale, p.scale, p.scale).setPosition(w.x, w.y + species.trunkY * p.scale, w.z);
    trunk.setMatrixAt(i, m);
    const v = 0.85 + rng() * 0.3; // variación sutil de tono por árbol
    foliage.setColorAt(i, new THREE.Color(v, v, v));
  });
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  return [foliage, trunk];
}

function makeTrees(track) {
  const group = new THREE.Group();
  const rng = mulberry32(42);
  const standard = [];
  const tall = [];
  for (let s = 5; s < track.length - 5; s += 5) {
    for (const sideSign of [-1, 1]) {
      if (rng() < 0.75) {
        const p = {
          s,
          lat: sideSign * (track.width / 2 + 2 + rng() * 12),
          scale: 0.8 + rng() * 0.7,
        };
        (rng() < 0.3 ? tall : standard).push(p);
      }
    }
  }
  for (const o of track.obstacles) {
    if (o.type !== 'tree') continue;
    (o.variant === 'tall' ? tall : standard).push({ s: o.s, lat: o.lat, scale: 1 });
  }
  const species = treeSpecies();
  group.add(...buildTreeInstances(track, standard, species.standard));
  group.add(...buildTreeInstances(track, tall, species.tall));
  return group;
}

// Puntas de skis en primera persona, colgadas de la cámara; se cantean al girar.
function makeSkis() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd23c3c });
  // Punta redondeada: cápsula tumbada a lo largo de z y aplastada al grosor del ski.
  const tipGeo = new THREE.CapsuleGeometry(0.055, 0.2, 4, 10);
  tipGeo.rotateX(Math.PI / 2);
  tipGeo.scale(1, 0.28, 1);
  for (const x of [-0.16, 0.16]) {
    const ski = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 1.3), mat);
    body.position.z = -0.45;
    const tip = new THREE.Mesh(tipGeo, mat);
    tip.position.set(0, 0.06, -1.18);
    tip.rotation.x = 0.5; // punta levantada
    ski.add(body, tip);
    ski.position.x = x;
    group.add(ski);
  }
  group.position.set(0, -1.05, -0.35);
  return group;
}

function makeRocks(track) {
  const group = new THREE.Group();
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshLambertMaterial({ color: 0x8a9099, flatShading: true });
  const rng = mulberry32(7);
  for (const o of track.obstacles) {
    if (o.type !== 'rock') continue;
    const rock = new THREE.Mesh(geometry, material);
    const w = track.toWorld(o.s, o.lat, 0);
    const s = 0.7 + rng() * 0.4;
    rock.scale.set(s * 1.3, s * 0.8, s * 1.1); // achatada, medio hundida en la nieve
    rock.position.set(w.x, w.y + s * 0.35, w.z);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    group.add(rock);
  }
  return group;
}

// Cuña de salto con degradé celeste (clara en la base, saturada en el labio).
function makeRampGeometry(width, height, length) {
  const hw = width / 2;
  const hl = length / 2;
  // Sube hacia -z (sentido de bajada); cara vertical (labio) en -z.
  const v = [
    [-hw, 0, hl], [hw, 0, hl],      // base trasera
    [hw, height, -hl], [-hw, height, -hl], // labio superior
    [-hw, 0, -hl], [hw, 0, -hl],    // base delantera
  ];
  const baseColor = new THREE.Color(0xeaf6ff);
  const topColor = new THREE.Color(0x5fb4ef);
  const positions = [];
  const colors = [];
  const push = (...idx) => {
    for (const i of idx) {
      positions.push(...v[i]);
      const c = baseColor.clone().lerp(topColor, v[i][1] / height);
      colors.push(c.r, c.g, c.b);
    }
  };
  push(0, 1, 2, 0, 2, 3); // plano inclinado
  push(4, 5, 2, 4, 2, 3); // cara frontal (labio)
  push(0, 3, 4);          // lateral izquierdo
  push(1, 2, 5);          // lateral derecho
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function makeRamps(track) {
  const group = new THREE.Group();
  // Mismas dimensiones que la física (PARAMS): el labio queda en o.s.
  const geometry = makeRampGeometry(PARAMS.rampHalfWidth * 2, PARAMS.rampHeight, PARAMS.rampLength);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const o of track.obstacles) {
    if (o.type !== 'jump') continue;
    const centerS = o.s - PARAMS.rampLength / 2;
    const f = track.frameAt(centerS);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(track.toWorld(centerS, o.lat, 0.05));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), f.tan);
    group.add(mesh);
  }
  return group;
}

function makeGate(track, s, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  for (const sideSign of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 8), mat);
    pole.position.copy(track.toWorld(s, sideSign * (track.width / 2), 2));
    g.add(pole);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(track.width, 0.5, 0.3), mat);
  bar.position.copy(track.toWorld(s, 0, 4));
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), track.frameAt(s).side);
  g.add(bar);
  return g;
}
