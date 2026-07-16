import * as THREE from 'three';
import { buildTrack, mulberry32 } from './track.js?v=1784245547';
import { verde } from './tracks/verde.js?v=1784245547';
import { azul } from './tracks/azul.js?v=1784245547';
import { negra } from './tracks/negra.js?v=1784245547';
import { createPlayerState, stepPlayer, recoverPlayer, PARAMS } from './player.js?v=1784245547';
import {
  createRace, updateRace, pauseRace, resumeRace, formatTime,
  loadBest, saveBest, loadBestSpeed, saveBestSpeed,
} from './race.js?v=1784245547';
import { createControls } from './controls.js?v=1784245547';
import { createHud } from './hud.js?v=1784245547';
import { createSnowSound } from './audio.js?v=1784245547';

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

const TRACKS = { verde, azul, negra };
const snowTexture = makeSnowTexture();

let track = null;
let START_S = 15;
let FINISH_S = 0;
let worldGroup = null;

// Construye (o reemplaza) el mundo 3D de la pista seleccionada.
function loadTrack(data) {
  if (worldGroup) scene.remove(worldGroup);
  track = buildTrack(data);
  START_S = 15;
  FINISH_S = track.length - 15;
  worldGroup = new THREE.Group();
  worldGroup.add(makeRibbon(track, -track.width / 2, track.width / 2, 0xf4f9ff, 0, snowTexture));
  worldGroup.add(makeRibbon(track, track.width / 2, track.width / 2 + 25, 0xdde7ee, 0.15, snowTexture));
  worldGroup.add(makeRibbon(track, -track.width / 2 - 25, -track.width / 2, 0xdde7ee, 0.15, snowTexture));
  worldGroup.add(makeTrees(track));
  worldGroup.add(makeRocks(track));
  worldGroup.add(makeRamps(track));
  worldGroup.add(makeGate(track, START_S, 0xd04040));
  worldGroup.add(makeGate(track, FINISH_S, 0x3050c0));
  worldGroup.add(makeCrowd(track, FINISH_S));
  const center = track.toWorld(track.length / 2, 0, 0);
  worldGroup.add(makeSky(center), makeMountains(center), makeClouds(center));
  scene.add(worldGroup);
  document.getElementById('track-name').textContent = `Pista ${data.name}`;
  window.__game.trackLength = track.length;
  restart();
}

let player = createPlayerState();
let race = createRace(START_S, FINISH_S);
let started = false;
let finishShown = false;
let paused = false;
let steerSmooth = 0; // input suavizado: entrada/salida de giro progresiva, estilo slalom
let runMaxSpeed = 0; // velocidad máxima de la bajada actual (m/s)
let crashSpeed = 0;  // velocidad en el momento de la caída (se muestra congelada)
let crowd = [];      // público animado junto a la meta (lo puebla makeCrowd)

const hud = createHud();
const controls = createControls();
const snow = createSnowSound();

document.getElementById('btn-touch').addEventListener('click', () => startGame('touch'));
document.getElementById('btn-gyro').addEventListener('click', () => startGame('gyro'));
document.getElementById('btn-restart').addEventListener('click', restart);
document.getElementById('btn-pause').addEventListener('click', pauseGame);
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart-pause').addEventListener('click', restart);
document.getElementById('btn-continue').addEventListener('click', standUp);
document.getElementById('btn-restart-fall').addEventListener('click', restart);
function goToMenu() {
  restart(); // resetea carrera y oculta overlays de meta/caída/pausa
  started = false;
  document.getElementById('start-screen').classList.add('visible');
}
document.getElementById('btn-menu').addEventListener('click', goToMenu);
document.getElementById('btn-menu-fall').addEventListener('click', goToMenu);
document.getElementById('btn-menu-pause').addEventListener('click', goToMenu);

// Selector de pista en el menú de inicio (o ?track=azul para e2e)
let selectedTrack = TRACKS[query.get('track')] ? query.get('track') : 'verde';
for (const btn of document.querySelectorAll('.track-btn')) {
  btn.classList.toggle('selected', btn.dataset.track === selectedTrack);
  btn.addEventListener('click', () => {
    selectedTrack = btn.dataset.track;
    for (const b of document.querySelectorAll('.track-btn')) {
      b.classList.toggle('selected', b.dataset.track === selectedTrack);
    }
    loadTrack(TRACKS[selectedTrack]);
  });
}

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
  crashSpeed = 0;
  hud.hideFinish();
  document.getElementById('pause-screen').classList.remove('visible');
  document.getElementById('fall-screen').classList.remove('visible');
}

function standUp() {
  if (!player.fallen) return;
  player = recoverPlayer(player);
  race = resumeRace(race, performance.now()); // el crono vuelve a correr
  crashSpeed = 0;
  document.getElementById('fall-screen').classList.remove('visible');
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
  // Si se pausó estando caído, el crono debe seguir detenido hasta Continuar.
  if (player.fallen) race = pauseRace(race, performance.now());
  document.getElementById('pause-screen').classList.remove('visible');
}

// Autopilot para verificación e2e: feedforward de curvatura + corrección PD del
// lateral, esquivando el obstáculo sólido más cercano por delante.
function autopilotSteer() {
  const ahead = track.frameAt(player.s + 8);
  const steerFF = (ahead.curvature * player.speed) / PARAMS.turnRate;
  let latTarget = 0;
  const room = track.width / 2 - 1.3; // margen para no rozar el borde al esquivar
  for (const o of track.obstacles) {
    if (o.type === 'jump') continue;
    const ds = o.s - player.s;
    if (ds > 0 && ds < 30 && Math.abs(player.lat - o.lat) < 3) {
      const side = player.lat >= o.lat ? 1 : -1;
      let target = o.lat + side * 2.8;
      if (Math.abs(target) > room) target = o.lat - side * 2.8; // sin hueco: por el otro lado
      latTarget = Math.max(-room, Math.min(room, target));
      break;
    }
  }
  const headingTarget = Math.max(-0.5, Math.min(0.5, 0.06 * (latTarget - player.lat)));
  return Math.max(-1, Math.min(1, steerFF + (headingTarget - player.heading) * 3));
}

function finish() {
  finishShown = true;
  snow.cheer();
  const time = race.elapsed;
  const maxKmh = Math.round(runMaxSpeed * 3.6);
  const recordEligible = TIMESCALE === 1 && !AUTOPILOT;
  const isRecord = recordEligible ? saveBest(localStorage, track.data.name, time) : false;
  if (recordEligible) saveBestSpeed(localStorage, track.data.name, maxKmh);
  const best = loadBest(localStorage, track.data.name);
  const bestSpeed = loadBestSpeed(localStorage, track.data.name);
  document.getElementById('finish-track').textContent = `Pista ${track.data.name}`;
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
    if (!player.fallen) race = updateRace(race, player.s, now); // caído: crono congelado
    if (race.status === 'running') runMaxSpeed = Math.max(runMaxSpeed, player.speed);
    if (player.fallen && !prev.fallen) {
      snow.ouch();
      if (AUTOPILOT) {
        player = recoverPlayer(player); // los runs de verificación se levantan solos
      } else {
        crashSpeed = prev.speed; // el marcador congela la velocidad del impacto
        race = pauseRace(race, now); // el crono se detiene mientras estás caído
        document.getElementById('fall-screen').classList.add('visible');
      }
    }
    if (player.airborne && !prev.airborne) hud.flash('¡Salto!', 800);
    if (race.status === 'finished' && !finishShown) finish();
  }

  // Animación del público (saltitos y brazos al aire)
  const tSec = now / 1000;
  for (const c of crowd) {
    const wave = Math.sin(tSec * 6 + c.phase);
    c.arms[0].rotation.z = -2.4 + Math.abs(wave) * 0.7;
    c.arms[1].rotation.z = 2.4 - Math.abs(wave) * 0.7;
    c.fig.position.y = c.baseY + Math.max(0, wave) * 0.18;
  }

  updateCamera();
  const gliding = started && !paused && race.status !== 'finished'
    && !player.airborne && !player.fallen;
  snow.update(gliding ? player.speed : 0, steerSmooth, gliding);
  hud.setTimer(race.status === 'ready' ? '00:00.00' : formatTime(race.elapsed));
  hud.setSpeed((player.fallen ? crashSpeed : player.speed) * 3.6);
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__game = { state: () => ({ player, race, paused }), trackLength: 0 };
loadTrack(TRACKS[selectedTrack]);

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

// Ski como plancha continua: cuerpo recto, y en la punta una pala que sube con
// curva suave, se ensancha un poco y remata redondeada (como un ski real).
function makeSkiGeometry() {
  const zFront = 0.35;   // extremo trasero (bajo la cámara)
  const length = 1.55;
  const tipLen = 0.4;    // largo de la pala
  const curveK = 2.2;    // subida de la punta (y = k/2 · d²)
  const halfW = 0.055;
  const thick = 0.03;
  const N = 48;
  const zTipStart = zFront - length + tipLen;

  // Perfil por secciones: posición z, altura del eje y semiancho
  const rows = [];
  for (let i = 0; i <= N; i++) {
    const z = zFront - (i / N) * length;
    let y = 0;
    let w = halfW;
    if (z < zTipStart) {
      const d = zTipStart - z;
      const t = d / tipLen; // 0..1 dentro de la pala
      y = (curveK / 2) * d * d;
      let m = 1 + 0.3 * Math.sin(Math.PI * Math.min(1, t)); // la pala se ensancha
      if (t > 0.75) m *= Math.sqrt(Math.max(0, 1 - ((t - 0.75) / 0.25) ** 2)); // remate redondeado
      w = halfW * m;
    }
    rows.push({ z, y, w });
  }

  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const corners = (r) => ({
    tl: [-r.w, r.y + thick / 2, r.z], tr: [r.w, r.y + thick / 2, r.z],
    bl: [-r.w, r.y - thick / 2, r.z], br: [r.w, r.y - thick / 2, r.z],
  });
  for (let i = 0; i < N; i++) {
    const a = corners(rows[i]);
    const b = corners(rows[i + 1]);
    quad(a.tl, a.tr, b.tr, b.tl); // cara superior
    quad(a.bl, b.bl, b.br, a.br); // cara inferior
    quad(a.tl, b.tl, b.bl, a.bl); // canto izquierdo
    quad(a.tr, a.br, b.br, b.tr); // canto derecho
  }
  const back = corners(rows[0]);
  quad(back.tl, back.bl, back.br, back.tr); // tapa trasera

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Skis en primera persona, colgados de la cámara; se cantean al girar.
function makeSkis() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd23c3c, side: THREE.DoubleSide });
  const geo = makeSkiGeometry();
  for (const x of [-0.16, 0.16]) {
    const ski = new THREE.Mesh(geo, mat);
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

// Público junto a la meta: figuras low-poly que saltan y agitan los brazos.
function makeCrowd(track, finishS) {
  crowd = [];
  const group = new THREE.Group();
  const rng = mulberry32(77);
  const jackets = [0xe04848, 0x2f80d0, 0xf2b134, 0x7a4fd0, 0x2fae62, 0xe07a2f];
  const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.7, 4, 8);
  const headGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6);
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a06a });
  for (let i = 0; i < 12; i++) {
    // Apiñados justo después de la meta, pegados al borde de la pista.
    const side = i % 2 === 0 ? 1 : -1;
    const s = finishS + 3 + rng() * 11;
    const lat = side * (track.width / 2 + 0.6 + rng() * 1.2);
    const jacket = new THREE.MeshLambertMaterial({ color: jackets[i % jackets.length] });
    const fig = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, jacket);
    body.position.y = 0.75;
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.45;
    fig.add(body, head);
    const arms = [];
    for (const armSide of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(armSide * 0.33, 1.15, 0);
      const arm = new THREE.Mesh(armGeo, jacket);
      arm.position.y = 0.24; // pivota desde el hombro
      shoulder.add(arm);
      shoulder.rotation.z = armSide * 2.4; // brazos en alto
      fig.add(shoulder);
      arms.push(shoulder);
    }
    const w = track.toWorld(s, lat, 0);
    fig.position.copy(w);
    const facing = track.toWorld(s, 0, 0);
    fig.lookAt(facing.x, w.y, facing.z); // mirando a la pista
    group.add(fig);
    crowd.push({ fig, arms, baseY: w.y, phase: rng() * Math.PI * 2 });
  }
  return group;
}

// Textura de veta de madera: base marrón con estrías verticales.
function makeWoodTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#8a5a2b';
  g.fillRect(0, 0, size, size);
  const rng = mulberry32(55);
  for (let i = 0; i < 70; i++) {
    const x = rng() * size;
    const w = 1 + rng() * 3;
    const dark = rng() < 0.6;
    g.fillStyle = dark
      ? `rgba(70, 42, 16, ${0.12 + rng() * 0.18})`
      : `rgba(200, 150, 90, ${0.08 + rng() * 0.12})`;
    g.fillRect(x, 0, w, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Arco de madera: pilares, travesaño apoyado con solape, tirantes y banderines.
function makeGate(track, s, accentColor) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xa87840, map: makeWoodTexture() });
  const hw = track.width / 2;
  const postH = 4.6;
  const barY = 4.35; // apoyado sobre los pilares (solapa 0.25 con sus extremos)

  for (const sideSign of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, postH, 10), wood);
    post.position.set(sideSign * hw, postH / 2, 0);
    g.add(post);
    // Tirante diagonal pilar-travesaño
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 8), wood);
    brace.position.set(sideSign * (hw - 0.65), barY - 0.75, 0);
    brace.rotation.z = sideSign * 0.75;
    g.add(brace);
  }

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, track.width + 1.4, 10), wood);
  bar.rotation.z = Math.PI / 2; // tumbado a lo ancho de la pista
  bar.position.set(0, barY, 0);
  g.add(bar);

  // Banderines colgando del travesaño, alternando color y blanco
  const flagMats = [
    new THREE.MeshLambertMaterial({ color: accentColor, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ color: 0xf5f5f5, side: THREE.DoubleSide }),
  ];
  for (let i = 0; i < 9; i++) {
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.65), flagMats[i % 2]);
    flag.position.set(-track.width / 2 + 1.6 + i * ((track.width - 3.2) / 8), barY - 0.55, 0);
    g.add(flag);
  }

  // Orienta el arco local (x = ancho de pista) y lo planta en el terreno.
  g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), track.frameAt(s).side);
  g.position.copy(track.toWorld(s, 0, 0));
  return g;
}
