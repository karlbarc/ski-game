import * as THREE from 'three';
import { buildTrack, mulberry32 } from './track.js';
import { verde } from './tracks/verde.js';
import { createPlayerState, stepPlayer, PARAMS } from './player.js';
import { createRace, updateRace, pauseRace, resumeRace, formatTime, loadBest, saveBest } from './race.js';
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
scene.background = new THREE.Color(0xbfdcf5);
scene.fog = new THREE.Fog(0xbfdcf5, 60, 260);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(80, 120, -40);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
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

let player = createPlayerState();
let race = createRace(START_S, FINISH_S);
let started = false;
let finishShown = false;
let paused = false;
let steerSmooth = 0; // input suavizado: entrada/salida de giro progresiva, estilo slalom

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
  const recordEligible = TIMESCALE === 1 && !AUTOPILOT;
  const isRecord = recordEligible ? saveBest(localStorage, track.data.name, time) : false;
  const best = loadBest(localStorage, track.data.name);
  hud.showFinish(`Tiempo: ${formatTime(time)}`, `Mejor: ${formatTime(best)}`, isRecord);
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

// Dos especies: abeto clásico (ancho) y abeto alto y delgado de verde más oscuro.
// Función (no const) para que esté disponible al construir la escena al cargar el módulo.
function treeSpecies() {
  return {
    standard: {
      foliage: { radius: 1.6, height: 4.5, color: 0x1d5c33, y: 2.8 },
      trunk: { rTop: 0.25, rBottom: 0.3, height: 1.6, color: 0x5a3d24, y: 0.8 },
    },
    tall: {
      foliage: { radius: 0.85, height: 7.5, color: 0x0e3a1f, y: 5.4 },
      trunk: { rTop: 0.16, rBottom: 0.2, height: 2.2, color: 0x4a3220, y: 1.1 },
    },
  };
}

function buildTreeInstances(track, positions, species) {
  const foliage = new THREE.InstancedMesh(
    new THREE.ConeGeometry(species.foliage.radius, species.foliage.height, 8),
    new THREE.MeshLambertMaterial({ color: species.foliage.color }),
    positions.length,
  );
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(species.trunk.rTop, species.trunk.rBottom, species.trunk.height, 6),
    new THREE.MeshLambertMaterial({ color: species.trunk.color }),
    positions.length,
  );
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => {
    const w = track.toWorld(p.s, p.lat, 0);
    m.makeScale(p.scale, p.scale, p.scale).setPosition(w.x, w.y + species.foliage.y * p.scale, w.z);
    foliage.setMatrixAt(i, m);
    m.makeScale(p.scale, p.scale, p.scale).setPosition(w.x, w.y + species.trunk.y * p.scale, w.z);
    trunk.setMatrixAt(i, m);
  });
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
