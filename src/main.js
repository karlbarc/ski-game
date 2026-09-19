import * as THREE from 'three';
import { buildTrack, mulberry32 } from './track.js?v=1784480748';
import { verde } from './tracks/verde.js?v=1784480748';
import { azul } from './tracks/azul.js?v=1784480748';
import { negra } from './tracks/negra.js?v=1784480748';
import { alpina } from './tracks/alpina.js?v=1784480748';
import { createPlayerState, stepPlayer, recoverPlayer, PARAMS } from './player.js?v=1784480748';
import {
  createRace, updateRace, pauseRace, resumeRace, formatTime,
  loadBest, saveBest, loadBestSpeed, saveBestSpeed,
} from './race.js?v=1784480748';
import { createControls } from './controls.js?v=1784480748';
import { createHud } from './hud.js?v=1784480748';
import { playerId, playerName, savePlayerName, submitScore, fetchTop, fetchMyRank } from './ranking.js?v=1784480748';
import { skiSurfaceHeight, findSkiSupportRamp, skiLengthScale, smoothSkiPose } from './ski-surface.js';
import { createStartSequence, presentStartSequence, stepPresentedStartSequence } from './start.js';
import { landingStrength, landingMotion } from './landing.js';
import { createSnowSound } from './audio.js?v=1789743651';

const GAME_VERSION = new URL(import.meta.url).searchParams.get('v') || 'dev';
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
function visibleViewportSize() {
  // En Android la barra del navegador puede cambiar sin disparar un resize de
  // `window`. El visual viewport describe el espacio que el jugador ve de
  // verdad y evita una franja del color por defecto bajo el canvas.
  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width || innerWidth),
    height: Math.round(viewport?.height || innerHeight),
  };
}
let { width: viewportWidth, height: viewportHeight } = visibleViewportSize();
// En móvil el presupuesto de GPU es mucho menor: bajamos resolución de sombra
// y pixel ratio antes que arriesgar el framerate. `?quality=alta|baja` fuerza
// el modo para poder comparar.
const qualityParam = query.get('quality');
const LOW_END = qualityParam
  ? qualityParam === 'baja'
  : (navigator.hardwareConcurrency || 4) <= 4 || /Android|iPhone|iPad/.test(navigator.userAgent);

renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_END ? 1.5 : 2));
renderer.setSize(viewportWidth, viewportHeight);
// Pipeline de color fotográfico: ACES comprime los altos (la nieve deja de
// quemarse a blanco plano) y sRGB corrige el gamma de salida.
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
// Sombras suaves: es lo que ancla árboles y rocas a la nieve.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW_END ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe8fb);
// Niebla exponencial: la densidad crece con la distancia como la bruma real,
// y funde el fondo lejano sin el corte duro de la niebla lineal.
scene.fog = new THREE.FogExp2(0xd6e6f5, 0.0042);
// Luz de cielo: la nieve en sombra se ilumina de azul (rebote del cielo) y
// el rebote del suelo devuelve blanco cálido. Es la firma de la luz alpina.
scene.add(new THREE.HemisphereLight(0x8fb4e4, 0xeee2d0, 1.3)); // relleno frío: tiñe de azul lo que queda en sombra
// Dirección común para la luz, el disco solar y la iluminación horneada de
// las montañas. Más altura acorta las sombras sin volver la escena cenital.
const SUN_OFFSET = new THREE.Vector3(100, 84, -30);
const sun = new THREE.DirectionalLight(0xffe6b8, 3.1);
sun.position.copy(SUN_OFFSET);
sun.castShadow = true;
// El sol sigue al jugador (ver updateCamera): el volumen de sombra es una caja
// pequeña alrededor de la cámara, así se gana resolución donde de verdad se ve.
sun.shadow.mapSize.set(LOW_END ? 1024 : 2048, LOW_END ? 1024 : 2048);
// Caja de 160 m de lado: cubre lo que se ve con niebla y a 2048 px deja ~8 cm
// por texel, suficiente para sombras de árbol nítidas sin artefactos.
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.updateProjectionMatrix(); // sin esto los límites de arriba no se aplican
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.35;
scene.add(sun);
scene.add(sun.target);

const camera = new THREE.PerspectiveCamera(70, viewportWidth / viewportHeight, 0.1, 3000);
const skis = makeSkis();
let skiVisualPose = null;
let landingAge = 1;
let landingImpact = 0;
scene.add(skis);
const skiContactShadows = makeSkiContactShadows();
scene.add(skiContactShadows);
scene.add(camera);

const TRACKS = { verde, azul, negra, alpina };
const PISTE_EDGE_COLOR = 0x50bced;
const JUMP_FLAG_COLOR = 0xe6534d;
const pisteSnow = makeSnowSurface(true);
const powderSnow = makeSnowSurface(false);

let track = null;
let START_S = 15;
let FINISH_S = 0;
let worldGroup = null;
let startGate = null;
let startSequence = createStartSequence();
let lastStartCue = null;

// Construye (o reemplaza) el mundo 3D de la pista seleccionada.
function loadTrack(data) {
  if (worldGroup) scene.remove(worldGroup);
  track = buildTrack(data);
  START_S = 15;
  FINISH_S = track.length - 15;
  worldGroup = new THREE.Group();
  worldGroup.add(makeSurroundingTerrain(track));
  worldGroup.add(makeRibbon(track, -track.width / 2, track.width / 2, pisteSnow));
  worldGroup.add(makeRibbon(track, track.width / 2, track.width / 2 + 25, powderSnow));
  worldGroup.add(makeRibbon(track, -track.width / 2 - 25, -track.width / 2, powderSnow));
  worldGroup.add(makeTrees(track));
  worldGroup.add(makeRocks(track));
  worldGroup.add(makeRamps(track));
  startGate = makeStartGate(track, START_S);
  worldGroup.add(startGate);
  worldGroup.add(makeGate(track, FINISH_S, 0x3050c0));
  worldGroup.add(makeCrowd(track, FINISH_S));
  const center = track.toWorld(track.length / 2, 0, 0);
  worldGroup.add(makeSky(center), makeSun(center), makeMountains(center), makeClouds(center));
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
let runFrames = 0;   // frames de la bajada en curso (para FPS promedio)

function bumpCounter(key) {
  const k = `ski-${key}-${track.data.name}`;
  const v = (parseInt(localStorage.getItem(k), 10) || 0) + 1;
  localStorage.setItem(k, String(v));
  return v;
}
function readCounter(key) {
  return parseInt(localStorage.getItem(`ski-${key}-${track.data.name}`), 10) || 0;
}

// Contexto del dispositivo y de la partida que acompaña cada marca del ranking.
function buildMeta() {
  const elapsed = race.elapsed || 1;
  return {
    control: controls.mode(),
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: Math.round(devicePixelRatio * 100) / 100,
    orientation: innerWidth > innerHeight ? 'landscape' : 'portrait',
    ua: navigator.userAgent.slice(0, 180),
    platform: navigator.userAgentData?.platform || navigator.platform || '',
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    version: GAME_VERSION,
    fps: Math.round(runFrames / elapsed),
    attempts: readCounter('attempts'),
    falls: readCounter('falls'),
  };
}
let crowd = [];      // público animado junto a la meta (lo puebla makeCrowd)
const jumpPowderGeometry = new THREE.SphereGeometry(0.16, 6, 4);
const jumpPowderBursts = [];

const hud = createHud();
const controls = createControls();
const snow = createSnowSound();

const nameInput = document.getElementById('player-name');
nameInput.value = playerName();
let sessionName = '';
const mobileControls = /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.getElementById('btn-back-controls').textContent = mobileControls ? '‹ Nombre y controles' : '‹ Cambiar nombre';
function showNameForm() {
  document.getElementById('player-form').hidden = false;
  document.getElementById('control-panel').hidden = true;
  nameInput.focus();
}
document.getElementById('player-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim().slice(0, 12);
  if (!name) {
    document.getElementById('name-error').textContent = 'Escribe tu nombre para continuar.';
    nameInput.setAttribute('aria-invalid', 'true');
    nameInput.focus();
    return;
  }
  sessionName = name;
  savePlayerName(name);
  nameInput.value = name;
  nameInput.removeAttribute('aria-invalid');
  document.getElementById('name-error').textContent = '';
  nameInput.blur();
  if (!mobileControls) {
    chooseControl('touch');
    return;
  }
  document.getElementById('player-form').hidden = true;
  document.getElementById('control-panel').hidden = false;
  document.getElementById('btn-touch').focus();
});
document.getElementById('btn-edit-name').addEventListener('click', showNameForm);

document.getElementById('btn-touch').addEventListener('click', () => chooseControl('touch'));
document.getElementById('btn-gyro').addEventListener('click', () => chooseControl('gyro'));
document.getElementById('btn-back-controls').addEventListener('click', () => {
  document.getElementById('track-screen').classList.remove('visible');
  document.getElementById('start-screen').classList.add('visible');
  showNameForm();
});
document.getElementById('btn-restart').addEventListener('click', restart);
document.getElementById('btn-pause').addEventListener('click', pauseGame);
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart-pause').addEventListener('click', restart);
document.getElementById('btn-restart-fall').addEventListener('click', restart);
function goToMenu() {
  started = false;
  restart(); // resetea carrera y oculta overlays de meta/caída/pausa
  started = false;
  buildTrackMenu(); // refresca los mejores tiempos en las tarjetas
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('track-screen').classList.add('visible');
  snow.playMenu();
}
document.getElementById('btn-menu').addEventListener('click', goToMenu);

// Mute global (música + efectos), persistente entre sesiones.
let soundMuted = localStorage.getItem('ski-muted') === '1';
snow.setMuted(soundMuted);
function updateMuteIcons() {
  const icon = soundMuted ? '🔇' : '🔊';
  document.getElementById('btn-mute').textContent = icon;
  document.getElementById('btn-mute-menu').textContent = icon;
}
function toggleMute() {
  soundMuted = !soundMuted;
  localStorage.setItem('ski-muted', soundMuted ? '1' : '0');
  snow.setMuted(soundMuted);
  if (!soundMuted) snow.start(); // desbloqueo explícito dentro del toque
  updateMuteIcons();
}
document.getElementById('btn-mute').addEventListener('click', toggleMute);
document.getElementById('btn-mute-menu').addEventListener('click', toggleMute);
updateMuteIcons();

// La música solo puede arrancar tras un gesto: el primer toque en el menú la enciende.
document.addEventListener('pointerdown', () => {
  if (!started) {
    snow.start();
    snow.playMenu();
  }
}, { once: true });
document.getElementById('btn-menu-fall').addEventListener('click', goToMenu);

// Ranking global: primero se elige entre las pistas donde el jugador ya tiene marca.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let rankDetailOpen = false;
let rankViewToken = 0;

function rankRowsHtml(rows, mine, me) {
  let body = rows.length === 0
    ? '<p class="rank-empty">Aún no hay tiempos. ¡Sé el primero!</p>'
    : rows.map((r, i) =>
        `<div class="rank-row${r.player_id === me ? ' me' : ''}"><span>${i + 1}. ${escapeHtml(r.name)}</span><span>${formatTime(r.time_cs / 100)}</span></div>`)
      .join('');
  // si tienes marca pero no estás entre los mostrados, tu posición al final
  if (mine && mine.rank > rows.length) {
    body += '<div class="rank-row"><span>⋯</span><span></span></div>'
      + `<div class="rank-row me"><span>${mine.rank}. ${escapeHtml(mine.name)}</span><span>${formatTime(mine.time_cs / 100)}</span></div>`;
  }
  return body;
}

async function showRanking() {
  rankDetailOpen = false;
  rankViewToken += 1;
  document.getElementById('track-screen').classList.remove('visible');
  const list = document.getElementById('rank-list');
  const title = document.getElementById('rank-title');
  const subtitle = document.getElementById('rank-subtitle');
  const back = document.getElementById('btn-back-tracks');
  document.getElementById('rank-screen').classList.add('visible');
  title.textContent = 'Elige una pista';
  subtitle.textContent = 'Consulta el ranking de las pistas donde ya tienes una marca.';
  back.textContent = '‹ Volver a las pistas';
  list.className = 'rank-selector';

  const rankedTracks = Object.entries(TRACKS)
    .map(([key, data]) => ({ key, data, best: loadBest(localStorage, data.name) }))
    .filter(({ best }) => best != null);

  if (rankedTracks.length === 0) {
    list.className = '';
    list.innerHTML = '<div class="rank-empty-state"><span class="rank-empty-icon">🏁</span>'
      + '<h2>Aún no tienes marcas</h2><p>Completa una pista para desbloquear su ranking.</p></div>';
    return;
  }

  list.innerHTML = rankedTracks.map(({ key, data, best }) => `
    <button class="rank-choice" data-track="${key}" style="--accent:${data.accent}">
      <span class="rank-choice-top"><span class="rank-choice-emoji">${data.emoji}</span><span class="rank-saved">Marca guardada</span></span>
      <span class="rank-choice-name">${data.name}</span>
      <span class="rank-times">
        <span class="rank-time-block"><span class="rank-choice-label">Tu mejor tiempo</span><span class="rank-choice-time">${formatTime(best)}</span></span>
        <span class="rank-time-block"><span class="rank-choice-label">Mejor global</span><span class="rank-global-time" data-track="${key}">Consultando…</span></span>
      </span>
      <span class="rank-gap" data-track="${key}">Calculando diferencia…</span>
      <span class="rank-choice-footer"><span class="rank-position" data-track="${key}">Consultando posición…</span><span class="rank-choice-open">Ver ranking ›</span></span>
    </button>`).join('');

  for (const el of list.querySelectorAll('.rank-choice')) {
    el.addEventListener('click', () => showTrackRanking(el.dataset.track));
  }
  for (const { key, data, best } of rankedTracks) {
    Promise.all([fetchTop(data.name, 1), fetchMyRank(data.name)])
      .then(([rows, mine]) => {
        const position = list.querySelector(`.rank-position[data-track="${key}"]`);
        const globalTime = list.querySelector(`.rank-global-time[data-track="${key}"]`);
        const gap = list.querySelector(`.rank-gap[data-track="${key}"]`);
        if (position) position.textContent = mine ? `Puesto #${mine.rank} global` : 'Marca aún no publicada';
        if (!globalTime || !gap) return;
        if (rows.length === 0) {
          globalTime.textContent = '—';
          gap.textContent = 'Sé el primero en el ranking';
          return;
        }
        globalTime.textContent = formatTime(rows[0].time_cs / 100);
        const deltaCs = Math.max(0, Math.round(best * 100) - rows[0].time_cs);
        gap.textContent = deltaCs === 0 ? '¡Tienes el mejor tiempo!' : `+${(deltaCs / 100).toFixed(2).replace('.', ',')} s del mejor`;
        gap.classList.toggle('is-leading', deltaCs === 0);
      })
      .catch(() => {
        const position = list.querySelector(`.rank-position[data-track="${key}"]`);
        const globalTime = list.querySelector(`.rank-global-time[data-track="${key}"]`);
        const gap = list.querySelector(`.rank-gap[data-track="${key}"]`);
        if (position) position.textContent = 'Ranking no disponible';
        if (globalTime) globalTime.textContent = '—';
        if (gap) gap.textContent = 'Sin conexión';
      });
  }
}

async function showTrackRanking(key) {
  rankDetailOpen = true;
  const viewToken = ++rankViewToken;
  const data = TRACKS[key];
  const list = document.getElementById('rank-list');
  const best = loadBest(localStorage, data.name);
  document.getElementById('rank-title').textContent = `${data.emoji} ${data.name}`;
  document.getElementById('rank-subtitle').textContent = `Tu mejor tiempo: ${best == null ? '—' : formatTime(best)}`;
  document.getElementById('btn-back-tracks').textContent = '‹ Elegir otra pista';
  list.className = 'rank-detail';
  list.innerHTML = '<p class="rank-empty">Cargando…</p>';
  try {
    const me = playerId();
    const [rows, mine] = await Promise.all([fetchTop(data.name, 50), fetchMyRank(data.name)]);
    if (viewToken !== rankViewToken) return;
    list.innerHTML = '<div class="rank-track"><h2>Clasificación global<small>Mejores tiempos</small></h2>'
      + rankRowsHtml(rows, mine, me) + '</div>';
  } catch {
    if (viewToken !== rankViewToken) return;
    list.innerHTML = '<p class="rank-empty">Sin conexión</p>';
  }
}

document.getElementById('btn-ranking').addEventListener('click', showRanking);
document.getElementById('btn-back-tracks').addEventListener('click', () => {
  if (rankDetailOpen) {
    showRanking(); // del detalle al resumen
    return;
  }
  document.getElementById('rank-screen').classList.remove('visible');
  document.getElementById('track-screen').classList.add('visible');
});
document.getElementById('btn-menu-pause').addEventListener('click', goToMenu);

let selectedTrack = TRACKS[query.get('track')] ? query.get('track') : 'verde';

// Metadatos por pista para las tarjetas del menú (calculados una vez).
const TRACK_INFO = {};
function trackMeta(key) {
  if (!TRACK_INFO[key]) {
    const data = TRACKS[key];
    const built = buildTrack(data);
    const drop = data.controlPoints[0][1] - data.controlPoints.at(-1)[1];
    TRACK_INFO[key] = {
      length: Math.round(built.length),
      slope: Math.round((drop / built.length) * 100),
      obstacles: data.obstacles.filter((o) => o.type !== 'jump').length,
      jumps: data.obstacles.filter((o) => o.type === 'jump').length,
    };
  }
  return TRACK_INFO[key];
}

function buildTrackMenu() {
  const list = document.getElementById('track-list');
  list.innerHTML = '';
  document.getElementById('player-greeting').textContent = `${sessionName}, elige una pista para empezar.${mobileControls ? '' : ' Gira con las flechas ← → · Pausa con Esc.'}`;
  for (const [key, data] of Object.entries(TRACKS)) {
    const m = trackMeta(key);
    const best = loadBest(localStorage, data.name);
    const card = document.createElement('button');
    card.className = 'track-card';
    card.dataset.track = key;
    card.style.setProperty('--accent', data.accent);
    card.innerHTML = `
      <span class="track-top"><span class="track-emoji">${data.emoji}</span><span class="track-level">${data.difficulty}</span></span>
      <svg class="track-preview" viewBox="0 0 240 72" aria-hidden="true"><path d="M0 72 52 14 85 48 136 0 204 72Z" fill="#ffffff09"/><path d="m92 72 75-49 73 49Z" fill="#ffffff08"/><path d="M125 6 C80 18 155 26 113 39 S65 57 120 67" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="125" cy="6" r="4" fill="#fff"/><circle cx="120" cy="67" r="4" fill="#fff"/></svg>
      <span class="track-title">${data.name}</span>
      <span class="track-description${data.description ? '' : ' track-description-spacer'}">${data.description || ''}</span>
      <span class="track-stats">${m.length} m · ${m.slope}% pendiente<br>${m.obstacles} obstáculos · ${m.jumps} saltos</span>
      <span class="track-best"><small>Tu mejor tiempo</small><strong>${best == null ? 'Sin marca todavía' : formatTime(best)}</strong></span>
      <span class="track-play"><span>Bajar esta pista</span><span class="track-play-arrow" aria-hidden="true">→</span></span>`;
    card.addEventListener('click', () => startRun(key));
    list.appendChild(card);
  }
}

// Paso 1: elegir control (aquí se pide el permiso del giroscopio, dentro del gesto).
function chooseControl(mode) {
  if (!sessionName) return;
  snow.start();
  snow.playMenu();
  controls.setMode(mode).then((ok) => {
    if (!ok) hud.flash('Giroscopio no disponible, usando táctil');
  });
  hud.hideStart();
  buildTrackMenu();
  document.getElementById('track-screen').classList.add('visible');
  document.querySelector('.track-card')?.focus({ preventScroll: true });
}

// Paso 2: elegir pista y bajar.
function startRun(key) {
  selectedTrack = key;
  document.getElementById('track-screen').classList.remove('visible');
  document.getElementById('hud').classList.remove('hidden');
  snow.start();
  snow.stopMenu();
  loadTrack(TRACKS[key]);
  started = true;
}

window.addEventListener('keydown', (e) => {
  if (e.target?.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
    if (paused) resumeGame();
    else pauseGame();
  }
});

// Auto-pausa al perder el foco (cambio de app/pestaña): el crono no debe correr solo.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

function restart() {
  landingAge = 1;
  landingImpact = 0;
  skiVisualPose = null;
  player = createPlayerState();
  player.s = START_S - 2.8;
  startSequence = createStartSequence();
  lastStartCue = null;
  hud.setCountdown(null);
  if (started) snow.start();
  if (startGate) startGate.userData.arm.rotation.y = 0;
  race = createRace(START_S, FINISH_S);
  finishShown = false;
  paused = false;
  steerSmooth = 0;
  runMaxSpeed = 0;
  crashSpeed = 0;
  runFrames = 0;
  clearJumpPowder();
  hud.hideFinish();
  document.getElementById('pause-screen').classList.remove('visible');
  document.getElementById('fall-screen').classList.remove('visible');
}

function pauseGame() {
  // Estando caído no hay nada que pausar (crono detenido y overlay propio).
  if (!started || paused || player.fallen || race.status === 'finished') return;
  paused = true;
  race = pauseRace(race, performance.now());
  document.getElementById('pause-screen').classList.add('visible');
}

function resumeGame() {
  if (!paused) return;
  snow.start();
  last = performance.now(); // no consumir en la salida el tiempo en segundo plano
  if (startSequence.clockMs != null) startSequence = { ...startSequence, clockMs: last };
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

function sendScore(name) {
  const status = document.getElementById('submit-status');
  const best = loadBest(localStorage, track.data.name);
  const bestSpeed = loadBestSpeed(localStorage, track.data.name);
  if (best == null) return;
  status.textContent = 'Subiendo al ranking…';
  submitScore({ track: track.data.name, name, timeSec: best, speedKmh: bestSpeed, meta: buildMeta() })
    .then(() => { status.textContent = `🏆 En el ranking como ${name}`; })
    .catch(() => { status.textContent = 'No se pudo subir (sin conexión)'; });
}

function finish() {
  finishShown = true;
  snow.cheer();
  const time = race.elapsed;
  const maxKmh = Math.round(runMaxSpeed * 3.6);
  const recordEligible = TIMESCALE === 1 && !AUTOPILOT;
  const isRecord = recordEligible ? saveBest(localStorage, track.data.name, time) : false;
  if (recordEligible) saveBestSpeed(localStorage, track.data.name, maxKmh);
  document.getElementById('submit-status').textContent = '';
  if (recordEligible && sessionName) sendScore(sessionName);
  const best = loadBest(localStorage, track.data.name);
  const bestSpeed = loadBestSpeed(localStorage, track.data.name);
  document.getElementById('finish-track').textContent = `Pista ${track.data.name}`;
  hud.showFinish(
    formatTime(time),
    best == null ? '—' : formatTime(best),
    `${maxKmh} km/h · Récord ${bestSpeed == null ? '—' : `${bestSpeed} km/h`}`,
    isRecord,
  );
}

function updateCamera(visualDt) {
  landingAge += visualDt;
  const landing = landingMotion(landingAge, player.fallen || player.airborne ? 0 : landingImpact);
  const f = track.frameAt(player.s);
  const eye = player.fallen ? 0.6 : 1.7;
  const surfaceHeight = snowRelief(player.s, player.lat, track.width);
  const pos = track.toWorld(player.s, player.lat, surfaceHeight + player.height + eye - landing.dip);
  camera.position.copy(pos);
  const dir = f.tan.clone().multiplyScalar(Math.cos(player.heading))
    .addScaledVector(f.side, Math.sin(player.heading));
  camera.lookAt(pos.clone().add(dir));
  if (!player.fallen) camera.rotateX((player.airborne ? -0.045 : -0.12) - landing.pitch);
  camera.rotateZ(player.fallen ? 0.5 : steerSmooth * 0.16);
  const fov = Math.min(98, 70 + player.speed * 0.9 + (player.airborne ? 4 : 0));
  if (Math.abs(fov - camera.fov) > 0.1) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  // El volumen de sombra viaja con el jugador, centrado un poco por delante
  // (es donde mira la cámara), manteniendo el mismo ángulo de sol.
  const focus = track.toWorld(player.s + 45, player.lat, 0);
  sun.target.position.copy(focus);
  // La luz sigue al jugador conservando un ángulo alpino más elevado.
  sun.position.copy(focus).add(SUN_OFFSET);

  skis.visible = !player.fallen;
  const lengthScale = skiLengthScale(camera.fov);
  skis.scale.z = lengthScale;
  const supportRamp = findSkiSupportRamp(track, player);
  const cos = Math.cos(player.heading), sin = Math.sin(player.heading);
  const surfacePoint = (distance, lateral = 0, extendRamp = true) => {
    const s = player.s + distance * cos + lateral * sin;
    const lat = player.lat + distance * sin - lateral * cos;
    return track.toWorld(s, lat,
      skiSurfaceHeight(track, s, lat, snowRelief, extendRamp ? supportRamp : null));
  };
  // Ajustar el plano desde la cola hasta la punta permite subir a una rampa
  // antes de que los pies lleguen a ella. En el labio conserva su inclinación.
  const rearDistance = 0.5 - 0.45 * lengthScale;
  const frontDistance = 0.5 + 1.60 * lengthScale;
  const rear = surfacePoint(rearDistance);
  const front = surfacePoint(frontDistance);
  const forward = front.clone().sub(rear).normalize();
  const edgeAngle = steerSmooth * (0.6 + 0.16);
  const contactHeight = 0.022 + Math.abs(Math.sin(edgeAngle)) * 0.103;
  const origin = rear.clone().lerp(front, (0.5 - rearDistance) / (frontDistance - rearDistance));
  // Mantiene toda la base por encima de las pequeñas irregularidades de nieve.
  let clearance = 0;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const ground = surfacePoint(THREE.MathUtils.lerp(rearDistance, frontDistance, t));
    clearance = Math.max(clearance, ground.y - THREE.MathUtils.lerp(rear.y, front.y, t));
  }
  origin.y += contactHeight + clearance;
  if (player.airborne) {
    origin.copy(track.toWorld(player.s + 0.5 * cos, player.lat + 0.5 * sin,
      player.height + snowRelief(player.s, player.lat, track.width) + contactHeight));
    forward.copy(f.tan).multiplyScalar(cos).addScaledVector(f.side, sin).normalize();
  }
  const baseForward = f.tan.clone().multiplyScalar(cos).addScaledVector(f.side, sin).normalize();
  const baseRight = new THREE.Vector3().crossVectors(baseForward, new THREE.Vector3(0, 1, 0)).normalize();
  const baseNormal = new THREE.Vector3().crossVectors(baseRight, baseForward).normalize();
  const anchor = track.toWorld(player.s + 0.5 * cos, player.lat + 0.5 * sin,
    player.height + snowRelief(player.s, player.lat, track.width) + contactHeight);
  const targetPose = {
    pitch: player.airborne ? 0.12 : Math.atan2(forward.dot(baseNormal), forward.dot(baseForward)),
    lift: origin.y - anchor.y,
  };
  skiVisualPose = smoothSkiPose(skiVisualPose, targetPose, visualDt);
  skis.position.copy(anchor);
  skis.position.y += skiVisualPose.lift;
  skis.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    baseRight, baseNormal, baseForward.clone().negate(),
  ));
  skis.rotateX(skiVisualPose.pitch);
  if (!player.airborne) {
    // El suavizado nunca mete la base en la rampa. Solo corregimos el contacto;
    // esa pequeña elevación también se conserva y se disipa al despegar.
    let contactLift = 0;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const localZ = (0.45 - t * 2.05) * lengthScale;
      const base = new THREE.Vector3(0, 0, localZ).applyQuaternion(skis.quaternion).add(skis.position);
      const ground = surfacePoint(THREE.MathUtils.lerp(rearDistance, frontDistance, t));
      contactLift = Math.max(contactLift, ground.y + contactHeight - base.y);
    }
    skis.position.y += contactLift;
    skiVisualPose.lift += contactLift;
  }
  for (const ski of skis.userData.skis) {
    ski.rotation.z = edgeAngle;
    ski.scale.y = 1 - landing.flex; // compresión breve del rocker al tocar nieve
  }

  // Sombra de contacto ceñida a cada base, proyectada sobre la superficie real.
  // No utiliza el normalBias de los árboles, que desplazaba la sombra del esquí.
  skiContactShadows.visible = !player.fallen && !player.airborne;
  if (skiContactShadows.visible) {
    for (let k = 0; k < skiContactShadows.children.length; k++) {
      const shadow = skiContactShadows.children[k];
      const vertices = shadow.geometry.getAttribute('position');
      const centerX = skis.userData.skis[k].position.x;
      for (let row = 0; row <= 16; row++) {
        const t = row / 16;
        const distance = 0.5 + (-0.45 + t * 2.05) * lengthScale;
        for (let side = 0; side < 2; side++) {
          const point = surfacePoint(distance, centerX + (side ? 0.12 : -0.12), false);
          vertices.setXYZ(row * 2 + side, point.x, point.y + 0.012, point.z);
        }
      }
      vertices.needsUpdate = true;
    }
  }
}

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const realDt = Math.max(0, (now - last) / 1000);
  const dt = Math.min(realDt, 0.05) * TIMESCALE;
  last = now;

  if (started && !paused) {
    startSequence = stepPresentedStartSequence(startSequence, now);
    if (startSequence.clockMs != null && lastStartCue !== startSequence.cue) {
      snow.startSignal(startSequence.cue === 0);
      lastStartCue = startSequence.cue;
    }
    hud.setCountdown(startSequence.visible ? startSequence.cue : null);
    const target = startSequence.released ? -Math.PI / 2 : 0;
    startGate.userData.arm.rotation.y += (target - startGate.userData.arm.rotation.y) * Math.min(1, realDt * 12);
    startGate.userData.light.material.color.set(startSequence.released ? 0x64e8b3 : 0xff674f);
  } else {
    hud.setCountdown(null);
  }

  if (started && !paused && startSequence.released && race.status !== 'finished') {
    const rawSteer = AUTOPILOT ? autopilotSteer() : controls.steer();
    steerSmooth += (rawSteer - steerSmooth) * Math.min(1, dt * 3);
    const prev = player;
    player = stepPlayer(player, steerSmooth, dt, track);
    if (!player.fallen) {
      const prevStatus = race.status;
      race = updateRace(race, player.s, now);
      if (prevStatus === 'ready' && race.status === 'running') bumpCounter('attempts');
      if (race.status === 'running') runFrames += 1;
    }
    if (race.status === 'running') runMaxSpeed = Math.max(runMaxSpeed, player.speed);
    if (player.fallen && !prev.fallen) {
      snow.ouch();
      bumpCounter('falls');
      if (AUTOPILOT) {
        player = recoverPlayer(player); // los runs de verificación se levantan solos
      } else {
        crashSpeed = prev.speed; // el marcador congela la velocidad del impacto
        race = pauseRace(race, now);
        const fallDistance = Math.round(Math.min(player.s, track.length));
        const fallProgress = Math.round((fallDistance / track.length) * 100);
        document.getElementById('fall-meters').textContent =
          `Avanzaste ${fallDistance} m de ${Math.round(track.length)} m`;
        document.getElementById('fall-progress-fill').style.width = `${fallProgress}%`;
        document.querySelector('.fall-progress-track').setAttribute('aria-valuenow', fallProgress);
        document.getElementById('fall-screen').classList.add('visible');
      }
    }
    const impact = landingStrength(prev, player);
    if (impact > 0) {
      landingAge = 0;
      landingImpact = impact;
      snow.land(impact);
      spawnJumpPowder(track.toWorld(player.s, player.lat,
        snowRelief(player.s, player.lat, track.width) + 0.08), 0.8 + impact);
      hud.flash('¡Buen aterrizaje!', 900);
    }
    if (player.airborne && !prev.airborne) {
      snow.jump(player.speed / PARAMS.maxSpeed);
      spawnJumpPowder(track.toWorld(player.s - 0.5, player.lat,
        snowRelief(player.s - 0.5, player.lat, track.width) + PARAMS.rampHeight), 0.8);
      hud.flash('¡En el aire!', 1100);
    }
    if (race.status === 'finished' && !finishShown) finish();
  }

  // Saludos asimétricos y balanceo leve, con los pies apoyados en la nieve.
  const tSec = now / 1000;
  for (const c of crowd) {
    const wave = Math.sin(tSec * 3.2 * c.energy + c.phase);
    for (let i = 0; i < c.arms.length; i++) {
      const arm = c.arms[i];
      const raised = Math.abs(arm.userData.restAngle) > 1;
      arm.rotation.z = arm.userData.restAngle + (raised ? 0.22 : 0.06) * Math.sin(tSec * 3.2 * c.energy + c.phase + i);
      arm.rotation.x = (raised ? 0.12 : 0.035) * wave;
    }
    c.fig.rotation.z = wave * 0.012;
  }

  updateCamera(started && !paused && race.status !== 'finished' ? dt : 0);
  updateJumpPowder(started && !paused ? Math.min(realDt, 0.05) : 0);
  const gliding = started && !paused && race.status !== 'finished'
    && !player.airborne && !player.fallen;
  snow.update(gliding ? player.speed : 0, steerSmooth, gliding);
  hud.setTimer(race.status === 'ready' ? '00:00.00' : formatTime(race.elapsed), now);
  hud.setSpeed((player.fallen ? crashSpeed : player.speed) * 3.6, now);
  hud.setProgress(player.s, track.length, now);
  renderer.render(scene, camera);
  if (started && !paused && startSequence.clockMs == null) {
    // El primer pitido y su segundo completo comienzan con la escena preparada.
    startSequence = presentStartSequence(startSequence, performance.now());
    snow.startSignal(false);
    lastStartCue = startSequence.cue;
  }
}
requestAnimationFrame(tick);

function resizeRenderer() {
  ({ width: viewportWidth, height: viewportHeight } = visibleViewportSize());
  camera.aspect = viewportWidth / viewportHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewportWidth, viewportHeight);
}
window.addEventListener('resize', resizeRenderer);
window.visualViewport?.addEventListener('resize', resizeRenderer);

window.__game = { state: () => ({ player, race, paused, startSequence }), trackLength: 0 };
loadTrack(TRACKS[selectedTrack]);

// Los runs de verificación (autopilot) saltan los menús y arrancan directos.
if (AUTOPILOT) {
  controls.setMode('touch');
  hud.hideStart();
  document.getElementById('hud').classList.remove('hidden');
  started = true;
}

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

// Dos cordilleras continuas: crestas erosionadas, valles y laderas asimétricas.
// La malla y su iluminación se calculan al cargar la pista, sin trabajo por frame.
function makeMountains(center) {
  const group = new THREE.Group();
  const rng = mulberry32(2024);
  const sunDirection = SUN_OFFSET.clone().normalize();
  const snowColor = new THREE.Color(0xf0f4f7);
  const rockColor = new THREE.Color(0x777d86);
  const hazeColor = new THREE.Color(0xc2d5e6);
  const shadeColor = new THREE.Color(0x7895b7);
  const sunColor = new THREE.Color(0xffefd6);
  for (let layer = 0; layer < 2; layer++) {
    const columns = LOW_END ? 256 : 512;
    const rows = LOW_END ? 32 : 64;
    const innerRadius = layer === 0 ? 630 : 1080;
    const depth = layer === 0 ? 530 : 620;
    const peaks = Array.from({ length: layer === 0 ? 13 : 17 }, (_, i) => ({
      angle: (i + rng() * 0.6) / (layer === 0 ? 13 : 17) * Math.PI * 2,
      height: 170 + rng() * 230 + layer * 90,
      width: 0.10 + rng() * 0.12,
    }));
    if (layer === 1) {
      // Cumbre lejana a la derecha de la salida: más baja y con laderas
      // amplias para que no sobresalga como una aguja sobre la cordillera.
      for (const index of [15, 16]) {
        const rightSummit = peaks[index];
        rightSummit.height *= 0.60;
        rightSummit.width *= 1.35;
      }
    }
    const positions = [];
    const indices = [];
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const radius = innerRadius + t * depth;
      for (let col = 0; col <= columns; col++) {
        const angle = (col % columns) / columns * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        let summit = 80;
        for (const peak of peaks) {
          const delta = Math.atan2(Math.sin(angle - peak.angle), Math.cos(angle - peak.angle));
          summit += peak.height * Math.exp(-Math.pow(delta / peak.width, 2));
        }
        // La cresta cambia de posición para evitar una cadena de conos idénticos.
        const crest = 0.40 + 0.14 * Math.sin(angle * 5 + layer);
        const profile = t < crest ? t / crest : (1 - t) / (1 - crest);
        const envelope = Math.pow(Math.max(0, profile), 1.15);
        const warp = valueNoise(x * 0.003 + 51, z * 0.003 + 29) * 70;
        let erosion = 0;
        let amplitude = 70;
        let frequency = 0.008;
        for (let octave = 0; octave < 5; octave++) {
          const ridge = 1 - Math.abs(2 * valueNoise(
            (x + warp) * frequency + layer * 83,
            (z - warp) * frequency + octave * 19,
          ) - 1);
          erosion += (ridge * ridge - 0.45) * amplitude;
          amplitude *= 0.48;
          frequency *= 2.1;
        }
        const height = -145 + envelope * (summit + erosion);
        positions.push(center.x + x, center.y + height, center.z + z);
      }
    }
    const stride = columns + 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const k = row * stride + col;
        indices.push(k, k + 1, k + stride, k + 1, k + stride + 1, k + stride);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute('normal');
    // Ambos extremos del anillo comparten la normal para cerrar sin costuras.
    for (let row = 0; row <= rows; row++) {
      const first = row * stride;
      const last = first + columns;
      const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
        .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
      normals.setXYZ(first, normal.x, normal.y, normal.z);
      normals.setXYZ(last, normal.x, normal.y, normal.z);
    }
    const colors = [];
    const color = new THREE.Color();
    const light = new THREE.Color();
    const normal = new THREE.Vector3();
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3] - center.x;
      const height = positions[i * 3 + 1] - center.y;
      const z = positions[i * 3 + 2] - center.z;
      normal.fromBufferAttribute(normals, i);
      const weather = valueNoise(x * 0.035 + 92, z * 0.035 + 13);
      // La roca aflora en paredes empinadas; la nieve llena canales y terrazas.
      const snowLine = THREE.MathUtils.smoothstep(height + weather * 65, -30, 160);
      const accumulation = THREE.MathUtils.smoothstep(normal.y + weather * 0.16, 0.48, 0.88);
      const snow = snowLine * accumulation;
      color.copy(rockColor).multiplyScalar(0.82 + weather * 0.30).lerp(snowColor, snow);
      const sunlight = Math.max(0, normal.dot(sunDirection));
      light.copy(shadeColor).lerp(sunColor, Math.pow(sunlight, 0.7));
      color.multiply(light).multiplyScalar(0.68 + sunlight * 0.55);
      // Bruma después de iluminar: los macizos lejanos pierden contraste.
      const haze = (layer === 0 ? 0.12 : 0.38)
        + (1 - THREE.MathUtils.smoothstep(height, -145, 260)) * 0.24;
      color.lerp(hazeColor, haze);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      vertexColors: true, fog: false,
    })));
  }
  return group;
}

// Nubes: racimos de esferas aplastadas, blancas y mate.
// Disco solar con halo: un sprite de degradé radial colocado lejos en la
// dirección de la luz. Da un punto de anclaje a la iluminación de la escena.
function makeSun(center) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.00, 'rgba(255, 255, 250, 1)');
  grad.addColorStop(0.12, 'rgba(255, 249, 226, 1)');
  grad.addColorStop(0.26, 'rgba(255, 238, 190, 0.55)');
  grad.addColorStop(0.55, 'rgba(255, 232, 180, 0.16)');
  grad.addColorStop(1.00, 'rgba(255, 230, 175, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  const dir = SUN_OFFSET.clone().normalize();
  sprite.position.copy(center).addScaledVector(dir, 1500);
  sprite.scale.setScalar(340);
  sprite.renderOrder = -1; // detrás de todo lo sólido
  return sprite;
}

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
  // Nubes sombreadas: horneamos la luz en color de vértice — brillante arriba
  // (cara al sol), gris azulado en la panza. Sin esto son manchas blancas
  // planas; con esto tienen volumen. Translúcidas en los bordes.
  const merged = mergeGeometries(puffs);
  const nor = merged.getAttribute('normal');
  const top = new THREE.Color(0xfffdf8);
  const belly = new THREE.Color(0xa8bcd4);
  const colors = new Float32Array(nor.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < nor.count; i++) {
    const up = nor.getY(i) * 0.5 + 0.5; // -1..1 → 0..1
    c.copy(belly).lerp(top, Math.pow(up, 0.8));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(
    merged,
    new THREE.MeshBasicMaterial({
      vertexColors: true, fog: false, transparent: true, opacity: 0.92, depthWrite: false,
    }),
  );
}

// Albedo, normales y rugosidad nacen del mismo relieve: cada grano responde
// a la luz donde se ve, y los surcos solo aparecen en la nieve compactada.
function makeSnowSurface(groomed) {
  const size = LOW_END ? 256 : 512;
  const rng = mulberry32(groomed ? 1771 : 2991);
  const height = new Float32Array(size * size);
  const grain = new Float32Array(size * size);
  // Ruido periódico suave: el valor y su pendiente coinciden al repetir el mapa.
  const noise = (u, v, frequency, offset) => {
    const x = u * frequency;
    const y = v * frequency;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = fx * fx * (3 - 2 * fx);
    const b = fy * fy * (3 - 2 * fy);
    const at = (dx, dy) => valueNoise(
      ((ix + dx) % frequency) + offset, ((iy + dy) % frequency) + offset,
    );
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(at(0, 0), at(1, 0), a),
      THREE.MathUtils.lerp(at(0, 1), at(1, 1), a), b,
    );
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const broad = noise(u, v, 8, 17);
      const fine = noise(u, v, 32, 71);
      grain[i] = rng();
      // Baldosa de 4 m: surcos de 8,3 cm, atenuados en zonas ya pisadas.
      const wear = noise(u, v, 4, 139);
      const grooves = Math.cos(u * Math.PI * 2 * 48 + 0.35 * Math.sin(v * Math.PI * 2));
      height[i] = (broad - 0.5) * (groomed ? 0.026 : 0.038)
        + (fine - 0.5) * 0.006 + (grain[i] - 0.5) * 0.0015
        + (groomed ? grooves * 0.002 * THREE.MathUtils.smoothstep(wear, 0.2, 0.75) : 0);
    }
  }
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  });
  const contexts = canvases.map((c) => c.getContext('2d'));
  const [albedo, normal, roughness] = contexts.map((c) => c.createImageData(size, size));
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = i * 4;
      // Derivadas en metros; la intensidad no cambia con la calidad del mapa.
      const dx = (at(x + 1, y) - at(x - 1, y)) * size / 8;
      const dy = (at(x, y + 1) - at(x, y - 1)) * size / 8;
      const length = Math.hypot(dx, dy, 1);
      normal.data.set([
        (0.5 - dx / length * 0.5) * 255,
        // CanvasTexture invierte Y al subirse a la GPU.
        (0.5 + dy / length * 0.5) * 255,
        (0.5 + 0.5 / length) * 255, 255,
      ], o);
      const shade = Math.min(1, Math.max(0, 0.5 + height[i] * 16));
      const white = 231 + shade * 16 + grain[i] * 4;
      albedo.data.set([white - 4, white - 1, Math.min(255, white + 3), 255], o);
      // Cristales aislados más lisos, sin puntos blancos pintados ni metal.
      const r = grain[i] > 0.985 ? 130 : 211 + grain[i] * 32;
      roughness.data.set([r, r, r, 255], o);
    }
  }
  const textures = canvases.map((canvas, i) => {
    contexts[i].putImageData([albedo, normal, roughness][i], 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(LOW_END ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  });
  textures[0].colorSpace = THREE.SRGBColorSpace;
  return { map: textures[0], normalMap: textures[1], roughnessMap: textures[2] };
}

// Ruido de valor 2D: hash determinista por celda entera + interpolación suave.
// A diferencia de una suma de senos, no es periódico, así que no dibuja una
// rejilla reconocible sobre la nieve.
function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const hash = (a, b) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const fade = (t) => t * t * (3 - 2 * t); // smoothstep: sin aristas entre celdas
  const u = fade(xf);
  const v = fade(yf);
  const n00 = hash(xi, yi);
  const n10 = hash(xi + 1, yi);
  const n01 = hash(xi, yi + 1);
  const n11 = hash(xi + 1, yi + 1);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

// Relieve amplio y suave en la pista, con nieve acumulada fuera de sus bordes.
// El detalle inferior a la resolución de la malla vive en el mapa de normales.
function snowRelief(s, lat, width) {
  const n = (fs, fl, off) => valueNoise(s * fs + off, lat * fl + off) - 0.5;
  const edge = THREE.MathUtils.smoothstep(Math.abs(lat), width / 2, width / 2 + 3);
  return 0.025 * n(0.24, 0.4, 0)
    + edge * (0.13 + 0.12 * n(0.35, 0.7, 37) + 0.055 * n(0.9, 1.1, 91));
}

function makeRibbon(track, latA, latB, surface) {
  const rows = 900; // relieve amplio; el grano fino se resuelve en la textura
  const TEX_METERS = 4; // la textura se repite cada 4 m en ambos ejes
  // Subdivisión lateral: sin ella la pista es una tira plana de 2 vértices por
  // fila y la luz rasante no tiene nada donde quebrarse. Con relieve real, el
  // sol bajo dibuja sombras largas como en la nieve de verdad.
  const cols = Math.max(2, Math.round((latB - latA) / 0.6));
  const pos = [];
  const uv = [];
  const colors = [];
  const idx = [];
  for (let i = 0; i <= rows; i++) {
    const s = (i / rows) * track.length;
    for (let j = 0; j <= cols; j++) {
      const lat = latA + ((latB - latA) * j) / cols;
      // El relieve NO se desvanece por columna (eso creaba un escalón donde se
      // juntan pista y franja lateral). Es continuo en `lat`, así ambas cintas
      // calculan exactamente la misma altura en el borde compartido y encajan.
      // El borde exterior se entierra en la ladera; nunca queda una lámina abierta.
      const skirt = THREE.MathUtils.smoothstep(Math.abs(lat) - track.width / 2, 17, 25) * 4;
      const h = snowRelief(s, lat, track.width) - skirt;
      const w = track.toWorld(s, lat, h);
      // Variación a escala de metros, independiente de la baldosa repetida.
      const shade = 0.91 + valueNoise(s * 0.12 + 48, lat * 0.21) * 0.09;
      colors.push(shade * 0.98, shade * 0.99, shade);
      pos.push(w.x, w.y, w.z);
      uv.push(lat / TEX_METERS, s / TEX_METERS);
    }
  }
  const stride = cols + 1;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = i * stride + j;
      idx.push(k, k + 1, k + stride + 1, k, k + stride + 1, k + stride);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Nieve PBR: muy rugosa (difusa) pero con algo de especular, que es lo que
  // da el brillo granulado al contraluz. El normal map crea el relieve.
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    ...surface,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 1,
    metalness: 0.0,
    envMapIntensity: 0.7,
    side: THREE.DoubleSide,
    // Con DoubleSide, three.js sombrea usando las caras traseras y la pista se
    // auto-sombrea entera (se veía un rectángulo pálido sobre la nieve).
    // Forzar la cara frontal deja solo las sombras reales de los objetos.
    shadowSide: THREE.FrontSide,
  }));
  // Pigmento integrado en la nieve: conserva grano, relieve y sombras, sin
  // otra malla que pueda flotar o parpadear sobre la superficie en las curvas.
  mesh.material.onBeforeCompile = (shader) => {
    shader.uniforms.sprayHalfWidth = { value: track.width / 2 };
    shader.uniforms.sprayColor = { value: new THREE.Color(PISTE_EDGE_COLOR) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSprayCoord;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSprayCoord = uv * 4.0;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vSprayCoord;
        uniform float sprayHalfWidth;
        uniform vec3 sprayColor;
        float sprayNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          vec4 dots = vec4(dot(cell, vec2(127.1, 311.7)))
            + vec4(0.0, 127.1, 311.7, 438.8);
          vec4 n = fract(sin(dots) * 43758.5453);
          return mix(mix(n.x, n.y, f.x), mix(n.z, n.w, f.x), f.y);
        }
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // El centro sigue el límite real; el aerosol varía en ancho y densidad.
        float flow = sprayNoise(vec2(vSprayCoord.y * 0.7, sign(vSprayCoord.x) * 7.0));
        float distanceToEdge = abs(abs(vSprayCoord.x) - sprayHalfWidth);
        float sprayWidth = mix(0.28, 0.43, flow);
        float feather = 1.0 - smoothstep(0.06, sprayWidth, distanceToEdge);
        float grain = sprayNoise(vSprayCoord * vec2(65.0, 24.0));
        float pigment = feather * mix(0.65, 0.95, flow) * mix(0.68, 1.0, grain);
        diffuseColor.rgb *= mix(vec3(1.0), sprayColor, pigment);
      `);
  };
  mesh.material.customProgramCacheKey = () => 'snow-edge-spray-v1';
  mesh.receiveShadow = true; // la pista recibe las sombras de árboles y rocas
  return mesh;
}

// Terreno de fondo en coordenadas del mundo: una cuadrícula evita los pliegues
// que produciría ensanchar cientos de metros las cintas en las curvas cerradas.
function makeSurroundingTerrain(track) {
  const samples = [];
  const count = Math.ceil(track.length / 5);
  for (let i = 0; i <= count; i++) samples.push(track.frameAt(i / count * track.length).pos);
  const margin = 900;
  const minX = Math.min(...samples.map((p) => p.x)) - margin;
  const maxX = Math.max(...samples.map((p) => p.x)) + margin;
  const minZ = Math.min(...samples.map((p) => p.z)) - margin;
  const maxZ = Math.max(...samples.map((p) => p.z)) + margin;
  const spacing = LOW_END ? 12 : 8;
  const columns = Math.ceil((maxX - minX) / spacing);
  const rows = Math.ceil((maxZ - minZ) / spacing);
  const positions = [];
  const colors = [];
  const uv = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    const z = minZ + row / rows * (maxZ - minZ);
    for (let col = 0; col <= columns; col++) {
      const x = minX + col / columns * (maxX - minX);
      let distanceSquared = Infinity;
      let baseHeight = 0;
      // Proyección sobre segmentos, no sobre puntos: evita escalones de altura.
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        const d2 = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
        if (d2 < distanceSquared) {
          distanceSquared = d2;
          baseHeight = THREE.MathUtils.lerp(a.y, b.y, t);
        }
      }
      const distance = Math.sqrt(distanceSquared);
      const hills = THREE.MathUtils.smoothstep(distance, track.width / 2 + 35, 220);
      const relief = 12 + valueNoise(x * 0.006 + 73, z * 0.006 + 41) * 65;
      // Margen vertical para que los triángulos del terreno no corten la pista
      // al interpolar sus cambios de pendiente. La falda lateral cubre la unión.
      positions.push(x, baseHeight - 2.5 + hills * relief, z);
      uv.push(x / 4, z / 4);
      const shade = 0.92 + valueNoise(x * 0.04, z * 0.04) * 0.08;
      colors.push(shade * 0.98, shade * 0.99, shade);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const k = row * stride + col;
      indices.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    ...powderSnow, vertexColors: true, roughness: 1, metalness: 0,
  }));
  terrain.receiveShadow = true;
  return terrain;
}

// Une varias geometrías (pequeñas) en una sola, para copas por pisos.
function mergeGeometries(geometries) {
  const parts = geometries.map((g) => g.index ? g.toNonIndexed() : g);
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

// Abetos alpinos: ramas radiales descendentes, huecos entre pisos y una guía
// central estrecha. Cada especie comparte geometría entre todos sus ejemplares.
function treeSpecies() {
  const build = (height, radius, seed) => {
    const rng = mulberry32(seed);
    const positions = [];
    const tiers = LOW_END ? 7 : 10;
    const branches = LOW_END ? 6 : 8;
    const triangle = (a, b, c) => positions.push(...a, ...c, ...b);
    for (let tier = 0; tier < tiers; tier++) {
      const t = tier / tiers;
      const y = 1.25 + t * (height - 1.5);
      const span = radius * Math.pow(1 - t, 0.85);
      const phase = rng() * Math.PI * 2;
      for (let branch = 0; branch < branches; branch++) {
        const angle = phase + branch / branches * Math.PI * 2 + (rng() - 0.5) * 0.22;
        const length = span * (0.75 + rng() * 0.3);
        const width = length * (0.30 + rng() * 0.10);
        const rootY = y + (rng() - 0.5) * 0.22;
        const rings = [];
        for (let section = 0; section <= 4; section++) {
          const u = section / 4;
          const w = width * [0.15, 0.9, 1, 0.6, 0.015][section];
          const h = length * [0.18, 0.32, 0.23, 0.12, 0.005][section];
          const droop = -length * 0.25 * u + Math.pow(u, 5) * length * 0.12;
          const point = (side, lift) => [
            Math.cos(angle) * length * u - Math.sin(angle) * side,
            rootY + droop + lift,
            Math.sin(angle) * length * u + Math.cos(angle) * side,
          ];
          rings.push([point(-w, 0), point(0, h), point(w, 0), point(0, -h * 0.45)]);
        }
        for (let section = 0; section < rings.length - 1; section++) {
          for (let face = 0; face < 4; face++) {
            const next = (face + 1) % 4;
            triangle(rings[section][face], rings[section + 1][face], rings[section][next]);
            triangle(rings[section][next], rings[section + 1][face], rings[section + 1][next]);
          }
        }
      }
    }
    const branchGeometry = new THREE.BufferGeometry();
    branchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    branchGeometry.computeVertexNormals();
    const leader = new THREE.ConeGeometry(0.14, 0.65, 7).translate(0, height - 0.48, 0);
    const core = new THREE.ConeGeometry(radius * 0.35, height - 1.2, 9)
      .translate(0, (height + 1.2) / 2 - 0.3, 0);
    const foliageGeo = mergeGeometries([branchGeometry, core, leader]);
    branchGeometry.dispose();
    core.dispose();
    leader.dispose();
    const pos = foliageGeo.getAttribute('position');
    const normals = foliageGeo.getAttribute('normal');
    const colors = [];
    const needles = new THREE.Color(seed === 81 ? 0x244638 : 0x304b36);
    const snow = new THREE.Color(0xe4eff5);
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const patch = valueNoise(pos.getX(i) * 3 + seed, pos.getZ(i) * 3 + pos.getY(i));
      // Color real de nieve sobre las caras superiores; las acículas quedan
      // oscuras debajo. No se multiplica blanco por verde ni se sobreexpone.
      // Solo quedan pequeñas acumulaciones en las caras casi horizontales.
      // Así la silueta verde se separa con claridad de la nieve del entorno.
      const cover = THREE.MathUtils.smoothstep(normals.getY(i), 0.52, 0.88)
        * THREE.MathUtils.smoothstep(patch, 0.48, 0.76);
      color.copy(needles).multiplyScalar(0.7 + patch * 0.55).lerp(snow, cover);
      colors.push(color.r, color.g, color.b);
    }
    foliageGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const trunkGeo = new THREE.CylinderGeometry(0.045, 0.20, height - 0.3, 9, 5);
    const trunkPos = trunkGeo.getAttribute('position');
    const bark = [];
    const barkColor = new THREE.Color(0x665343);
    for (let i = 0; i < trunkPos.count; i++) {
      const grain = valueNoise(trunkPos.getX(i) * 44 + 8, trunkPos.getZ(i) * 44 + 17);
      color.copy(barkColor).multiplyScalar(0.65 + grain * 0.65);
      bark.push(color.r, color.g, color.b);
    }
    trunkGeo.setAttribute('color', new THREE.Float32BufferAttribute(bark, 3));
    return { foliageGeo, trunkGeo, trunkY: (height - 0.3) / 2 };
  };
  return { standard: build(5.7, 1.5, 42), tall: build(7.4, 1.25, 81) };
}

function buildTreeInstances(track, positions, species) {
  const foliage = new THREE.InstancedMesh(
    species.foliageGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }),
    positions.length,
  );
  const trunk = new THREE.InstancedMesh(
    species.trunkGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    positions.length,
  );
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const rng = mulberry32(1234);
  positions.forEach((p, i) => {
    const w = track.toWorld(p.s, p.lat, snowRelief(p.s, p.lat, track.width));
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    scale.set(p.scale * (0.88 + rng() * 0.12), p.scale * (0.9 + rng() * 0.22), p.scale);
    matrix.compose(w, rotation, scale);
    foliage.setMatrixAt(i, matrix);
    w.y += species.trunkY * scale.y;
    matrix.compose(w, rotation, scale);
    trunk.setMatrixAt(i, matrix);
    const tone = 0.9 + rng() * 0.1;
    foliage.setColorAt(i, new THREE.Color(tone, tone, tone));
  });
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
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

// Secciones indexadas: normales compartidas para un rocker y cantos suaves.
function makeSkiGeometry() {
  const positions = [], uvs = [], indices = [];
  const rows = 112;
  // Una sección biselada separa la cubierta, el canto de acero y la base.
  const section = [
    [-0.94, 0.010], [-0.55, 0.014], [0, 0.015], [0.55, 0.014],
    [0.94, 0.010], [1, 0.004], [1, -0.006], [0.94, -0.010],
    [0, -0.011], [-0.94, -0.010], [-1, -0.006], [-1, 0.004],
  ];
  const stride = section.length + 1;
  for (let i = 0; i <= rows; i++) {
    // Muestreo coseno: más detalle en los remates redondos.
    const t = (1 - Math.cos(Math.PI * i / rows)) / 2;
    const rocker = Math.max(0, (t - 0.64) / 0.36);
    const tail = Math.max(0, (0.10 - t) / 0.10);
    const y = 0.14 * rocker ** 2.3 + 0.018 * tail ** 2;
    let width = 0.076 + 0.027 * ((t - 0.4) / 0.6) ** 2;
    // Nariz elíptica que cierra tangencialmente, sin un frente plano.
    if (t > 0.91) width *= Math.sqrt(Math.max(0, 1 - ((t - 0.91) / 0.09) ** 2));
    if (t < 0.035) width *= Math.sqrt(Math.max(0, 1 - ((0.035 - t) / 0.035) ** 2));
    for (let j = 0; j <= section.length; j++) {
      const [x, h] = section[j % section.length];
      positions.push(x * width, y + h, 0.45 - t * 2.05);
      uvs.push((x + 1) / 2, t);
    }
  }
  const geometry = new THREE.BufferGeometry();
  // Tres grupos, sin piezas superpuestas ni z-fighting.
  for (let material = 0; material < 3; material++) {
    const start = indices.length;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < section.length; j++) {
        const surface = j < 4 ? 0 : (j >= 7 && j <= 8 ? 2 : 1);
        if (surface !== material) continue;
        const a = i * stride + j, b = a + stride;
        indices.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
    geometry.addGroup(start, indices.length - start, material);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSkiMaterials() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(184);
  const paint = ctx.createLinearGradient(0, 0, 256, 0);
  paint.addColorStop(0, '#722b30');
  paint.addColorStop(0.25, '#c44d43');
  paint.addColorStop(0.55, '#dc6650');
  paint.addColorStop(1, '#862f36');
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 256, 1024);
  // Vetas del laminado: textura longitudinal que se lee incluso en movimiento.
  for (let i = 0; i < 1500; i++) {
    ctx.strokeStyle = rng() > 0.5 ? 'rgba(255,218,175,0.10)' : 'rgba(42,16,25,0.12)';
    ctx.lineWidth = 0.4 + rng() * 1.1;
    const x = rng() * 256, y = rng() * 1024;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 3, y + 40, x - 2, y + 90, x + rng() * 3, y + 180);
    ctx.stroke();
  }
  // Gráfica de fábrica en la pala, con bandas marfil y carbón.
  ctx.fillStyle = '#202f38';
  ctx.beginPath();
  ctx.moveTo(0, 25); ctx.lineTo(256, 65);
  ctx.lineTo(256, 100); ctx.lineTo(0, 60); ctx.fill();
  ctx.fillStyle = '#e9d8b5';
  ctx.beginPath();
  ctx.moveTo(0, 70); ctx.lineTo(256, 110);
  ctx.lineTo(256, 119); ctx.lineTo(0, 79); ctx.fill();
  ctx.fillStyle = 'rgba(243,220,186,0.7)';
  ctx.fillRect(24, 70, 3, 865);
  ctx.fillRect(229, 70, 3, 865);
  // Arañazos finos sobre la pintura, sin ruido que parpadee a distancia.
  for (let i = 0; i < 85; i++) {
    const x = 12 + rng() * 232, y = rng() * 1024;
    ctx.strokeStyle = 'rgba(255,240,212,0.22)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + rng() * 3, y + 8 + rng() * 65); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return [
    new THREE.MeshStandardMaterial({ map, roughness: 0.37, metalness: 0.12 }),
    new THREE.MeshStandardMaterial({ color: 0x8c9ba4, roughness: 0.3, metalness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: 0x1e2630, roughness: 0.72 }),
  ];
}

// Esquís en el mundo, apoyados en la pendiente; se cantean al girar.
function makeSkis() {
  const group = new THREE.Group();
  const mat = makeSkiMaterials();
  const geo = makeSkiGeometry();
  for (const x of [-0.215, 0.215]) {
    const ski = new THREE.Mesh(geo, mat);
    ski.position.x = x;
    ski.castShadow = false; // sombra de contacto independiente del sesgo del paisaje
    ski.receiveShadow = true;
    group.add(ski);
  }
  // Cada esquí cantea sobre SU propio eje longitudinal (como un esquiador real),
  // no el par entero alrededor de un centro común.
  group.userData.skis = group.children;
  return group;
}

// Máscara suave: el cuerpo toca la nieve y el rocker pierde contacto en la punta.
function makeSkiContactShadows() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    const t = 1 - y / 255;
    const lengthFade = THREE.MathUtils.smoothstep(t, 0, 0.09)
      * (1 - THREE.MathUtils.smoothstep(t, 0.63, 1));
    for (let x = 0; x < 64; x++) {
      const across = Math.abs(x / 63 * 2 - 1);
      const alpha = (1 - THREE.MathUtils.smoothstep(across, 0.3, 1)) * lengthFade;
      pixels.data.set([28, 48, 68, Math.round(alpha * 90)], (y * 64 + x) * 4);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map, transparent: true,
    depthWrite: false, side: THREE.DoubleSide, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const group = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const geo = new THREE.BufferGeometry();
    const uv = [], indices = [];
    for (let row = 0; row <= 16; row++) {
      uv.push(0, row / 16, 1, row / 16);
      if (row < 16) {
        const i = row * 2;
        indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(34 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false; // vértices actualizados alrededor del jugador
    group.add(mesh);
  }
  return group;
}

// Bloques erosionados, parcialmente enterrados, con vetas minerales y nieve
// en las superficies altas. El tamaño conserva la zona de colisión existente.
function makeRocks(track) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0,
  });
  const rng = mulberry32(7);
  const stone = new THREE.Color(0x687078);
  const mineral = new THREE.Color(0x9b9487);
  const snow = new THREE.Color(0xe8f1f7);
  const color = new THREE.Color();
  for (const o of track.obstacles) {
    if (o.type !== 'rock') continue;
    const geometry = new THREE.IcosahedronGeometry(1, LOW_END ? 1 : 2);
    geometry.rotateY(rng() * Math.PI * 2);
    const seed = rng() * 100;
    const pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const shape = 0.82 + valueNoise(x * 2 + seed, z * 2 + y) * 0.18;
      pos.setXYZ(i, x * shape * 0.94, y * shape * 0.78, z * shape * 1.15);
    }
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute('normal');
    const colors = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const grain = valueNoise(x * 17 + seed, z * 17 + y * 4);
      const vein = valueNoise(x * 6 + y * 12 + seed, z * 3);
      color.copy(stone).lerp(mineral, vein * 0.65).multiplyScalar(0.75 + grain * 0.4);
      // Nieve solo en las mesetas superiores: conserva la lectura mineral de
      // la roca contra el terreno blanco.
      const cover = THREE.MathUtils.smoothstep(normals.getY(i), 0.58, 0.9)
        * THREE.MathUtils.smoothstep(y + vein * 0.2, 0.18, 0.5);
      color.lerp(snow, cover);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const rock = new THREE.Mesh(geometry, material);
    rock.position.copy(track.toWorld(o.s, o.lat, snowRelief(o.s, o.lat, track.width) + 0.24));
    rock.receiveShadow = true;
    rock.castShadow = true;
    group.add(rock);
  }
  return group;
}

// Superficie de despegue lineal (igual a la física), con hombros de nieve
// inclinados y un labio ligeramente azulado para distinguirlo durante la bajada.
function makeRampGeometry(width, height, length) {
  const hw = width / 2;
  const rows = 18;
  const lateral = [-hw - 0.8, -hw, -hw / 2, 0, hw / 2, hw, hw + 0.8];
  const positions = [], colors = [], uv = [], indices = [];
  const base = new THREE.Color(0xf0f5f9);
  const packed = new THREE.Color(0xc5dceb);
  const lip = new THREE.Color(0x88b6d3);
  const color = new THREE.Color();
  const vertex = (x, y, z, t, edge) => {
    positions.push(x, y, z);
    uv.push(x / 4, -z / 4);
    color.copy(base).lerp(packed, t * 0.35 + edge * 0.3)
      .lerp(lip, THREE.MathUtils.smoothstep(t, 0.94, 1) * 0.55);
    colors.push(color.r, color.g, color.b);
  };
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (const x of lateral) {
      const edge = Math.abs(x) > hw ? 1 : 0;
      vertex(x, edge ? -0.08 : height * t, length / 2 - t * length, t, edge);
    }
  }
  const stride = lateral.length;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < stride - 1; col++) {
      const k = row * stride + col;
      indices.push(k, k + 1, k + stride, k + 1, k + stride + 1, k + stride);
    }
  }
  // Cierra el frente hasta el suelo; los hombros se unen con la nieve lateral.
  const bottomStart = positions.length / 3;
  for (const x of lateral) vertex(x, -0.08, -length / 2, 1, 1);
  for (let col = 0; col < stride - 1; col++) {
    const top = rows * stride + col;
    const bottom = bottomStart + col;
    indices.push(top, top + 1, bottom, top + 1, bottom + 1, bottom);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function spawnJumpPowder(position, strength = 1) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xeaf7ff, transparent: true, opacity: 0.68, depthWrite: false,
  });
  const burst = new THREE.Group();
  burst.position.copy(position);
  burst.userData = { age: 0, material };
  const count = LOW_END ? 8 : 14;
  for (let i = 0; i < count; i++) {
    const puff = new THREE.Mesh(jumpPowderGeometry, material);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.45;
    const radius = 0.18 + Math.random() * 0.55;
    puff.position.set(Math.cos(angle) * radius, Math.random() * 0.18, Math.sin(angle) * radius);
    puff.scale.setScalar(0.65 + Math.random() * 0.9);
    puff.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * (0.7 + Math.random() * 1.3) * strength,
      (0.55 + Math.random() * 1.2) * strength,
      Math.sin(angle) * (0.7 + Math.random() * 1.3) * strength,
    );
    burst.add(puff);
  }
  scene.add(burst);
  jumpPowderBursts.push(burst);
}

function updateJumpPowder(dt) {
  for (let i = jumpPowderBursts.length - 1; i >= 0; i--) {
    const burst = jumpPowderBursts[i];
    burst.userData.age += dt;
    for (const puff of burst.children) {
      puff.position.addScaledVector(puff.userData.velocity, dt);
      puff.userData.velocity.y -= 1.2 * dt;
      puff.scale.multiplyScalar(1 + dt * 1.7);
    }
    burst.userData.material.opacity = Math.max(0, 0.68 * (1 - burst.userData.age / 0.72));
    if (burst.userData.age >= 0.72) {
      scene.remove(burst);
      burst.userData.material.dispose();
      jumpPowderBursts.splice(i, 1);
    }
  }
}

function clearJumpPowder() {
  for (const burst of jumpPowderBursts) {
    scene.remove(burst);
    burst.userData.material.dispose();
  }
  jumpPowderBursts.length = 0;
}

function makeRamps(track) {
  const group = new THREE.Group();
  const template = makeRampGeometry(PARAMS.rampHalfWidth * 2, PARAMS.rampHeight, PARAMS.rampLength);
  const material = new THREE.MeshStandardMaterial({
    ...pisteSnow, vertexColors: true, roughness: 0.94,
    side: THREE.DoubleSide, shadowSide: THREE.FrontSide,
  });
  const markerGeometry = new THREE.CylinderGeometry(0.065, 0.075, 2.2, 8);
  const markerMaterial = new THREE.MeshStandardMaterial({ color: PISTE_EDGE_COLOR, roughness: 0.82 });
  const flagMaterials = [
    new THREE.MeshStandardMaterial({ color: JUMP_FLAG_COLOR, roughness: 0.78, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: JUMP_FLAG_COLOR, roughness: 0.78, side: THREE.DoubleSide }),
  ];
  const bandMaterial = new THREE.MeshBasicMaterial({ color: PISTE_EDGE_COLOR, side: THREE.DoubleSide });
  const rampBand = (o, t, depth = 0.18) => {
    const halfWidth = PARAMS.rampHalfWidth - 0.18;
    const centerS = o.s - PARAMS.rampLength + t * PARAMS.rampLength;
    const vertices = [];
    for (const ds of [-depth / 2, depth / 2]) {
      const s = centerS + ds;
      const rampT = Math.max(0, Math.min(1, (s - (o.s - PARAMS.rampLength)) / PARAMS.rampLength));
      for (const lat of [o.lat - halfWidth, o.lat + halfWidth]) {
        const p = track.toWorld(s, lat, PARAMS.rampHeight * rampT + 0.025);
        vertices.push(p.x, p.y, p.z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    return new THREE.Mesh(geometry, bandMaterial);
  };
  for (const o of track.obstacles) {
    if (o.type !== 'jump') continue;
    const centerS = o.s - PARAMS.rampLength / 2;
    const geometry = template.clone();
    const pos = geometry.getAttribute('position');
    // Cada vértice sigue la curva y pendiente reales, sin una cuña rígida flotante.
    for (let i = 0; i < pos.count; i++) {
      const w = track.toWorld(centerS - pos.getZ(i), o.lat + pos.getX(i), pos.getY(i));
      pos.setXYZ(i, w.x, w.y, w.z);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const [index, t] of [0.18, 0.48, 0.78, 0.97].entries()) {
      group.add(rampBand(o, t, index === 3 ? 0.32 : 0.14));
    }
    const approachS = o.s - PARAMS.rampLength - 1.2;
    const approach = new THREE.Group();
    for (const side of [-1, 1]) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      const x = side * (PARAMS.rampHalfWidth + 0.9);
      marker.position.set(x, 1.1, 0);
      marker.castShadow = true;
      approach.add(marker);
      const flagShape = new THREE.Shape();
      flagShape.moveTo(0, 0); flagShape.lineTo(side * 0.82, -0.22); flagShape.lineTo(0, -0.55);
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), flagMaterials[side > 0 ? 0 : 1]);
      flag.position.set(x, 2.05, 0.02);
      approach.add(flag);
    }
    const frame = track.frameAt(approachS);
    const right = frame.side.clone().negate();
    const up = new THREE.Vector3().crossVectors(right, frame.tan).normalize();
    approach.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      right, up, frame.tan.clone().negate(),
    ));
    approach.position.copy(track.toWorld(approachS, o.lat,
      snowRelief(approachS, o.lat, track.width)));
    group.add(approach);
  }
  template.dispose();
  return group;
}

// Público con proporciones humanas y ropa de invierno. Cada cuerpo y brazo
// se agrupa en una sola malla para mantener bajo el número de draw calls.
function makeCrowd(track, finishS) {
  crowd = [];
  const group = new THREE.Group();
  const rng = mulberry32(77);
  const jackets = [0xb9473d, 0x3279a0, 0xd8a548, 0x67547f, 0x50806d, 0xc56e40];
  const skins = [0xe4b598, 0xc38e6c, 0x95674f, 0x674638];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const sphere = new THREE.SphereGeometry(1, LOW_END ? 10 : 16, LOW_END ? 8 : 12);
  const capsule = new THREE.CapsuleGeometry(1, 1, 4, LOW_END ? 8 : 12);
  const up = new THREE.Vector3(0, 1, 0);
  // Todas las piezas usan color de vértice; el sombreado sigue siendo suave.
  const builder = () => {
    const positions = [], normals = [], colors = [];
    const add = (source, position, scale, color, rotation = new THREE.Quaternion()) => {
      const geo = source.clone();
      geo.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(...position), rotation, new THREE.Vector3(...scale),
      ));
      const flat = geo.toNonIndexed();
      const pos = flat.getAttribute('position'), normal = flat.getAttribute('normal');
      const tint = new THREE.Color(color);
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        colors.push(tint.r, tint.g, tint.b);
      }
      geo.dispose(); flat.dispose();
    };
    const segment = (a, b, radius, color) => {
      const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
      const delta = to.clone().sub(from);
      add(capsule, from.add(to).multiplyScalar(0.5).toArray(),
        [radius, (delta.length() + radius) / 3, radius], color,
        new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()));
    };
    const finish = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    };
    return { add, segment, finish };
  };
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    // Filas espaciadas: las siluetas no se atraviesan al saludar.
    const s = finishS + 2 + Math.floor(i / 2) * 1.9 + rng() * 0.3;
    const lat = side * (track.width / 2 + 1.0 + rng() * 0.6);
    const jacket = jackets[i % jackets.length];
    const trim = new THREE.Color(jacket).multiplyScalar(0.58);
    const skin = skins[i % skins.length];
    const pants = i % 3 === 0 ? 0x414b58 : 0x27333c;
    const hat = i % 2 === 0 ? 0xe5dbc5 : trim;
    const fig = new THREE.Group();
    const body = builder();
    // Dos piernas articuladas, separadas, con rodillas y botas apoyadas.
    for (const leg of [-1, 1]) {
      const x = leg * 0.135;
      body.segment([x, 0.88, 0], [x * 1.12, 0.49, 0.025], 0.105, pants);
      body.segment([x * 1.12, 0.49, 0.025], [x * 1.22, 0.16, 0], 0.085, pants);
      body.add(sphere, [x * 1.22, 0.105, 0.045], [0.105, 0.105, 0.19], 0x252b30);
      body.add(sphere, [x * 1.22, 0.035, 0.06], [0.11, 0.033, 0.195], 0x121a21);
    }
    body.add(capsule, [0, 1.12, 0], [0.245, 0.20, 0.155], jacket);
    body.add(sphere, [0, 0.87, 0], [0.24, 0.075, 0.154], trim);
    // Costuras acolchadas y cremallera sobre el delantero de la chaqueta.
    for (const y of [1.00, 1.13, 1.26]) {
      body.segment([-0.19, y, 0.14], [0.19, y, 0.14], 0.008, trim);
    }
    body.segment([0, 0.89, 0.159], [0, 1.39, 0.159], 0.009, 0xd2d6d4);
    body.add(sphere, [0, 1.42, 0], [0.115, 0.07, 0.115], trim);
    body.add(sphere, [-0.095, 1.30, 0.148], [0.044, 0.12, 0.025], hat);
    body.add(sphere, [0, 1.60, 0.01], [0.13, 0.174, 0.125], skin);
    for (const x of [-0.13, 0.13]) body.add(sphere, [x, 1.59, 0.015], [0.028, 0.046, 0.03], skin);
    body.add(sphere, [0, 1.585, 0.132], [0.029, 0.039, 0.039], skin);
    for (const x of [-0.047, 0.047]) {
      body.add(sphere, [x, 1.635, 0.121], [0.013, 0.009, 0.007], 0x302c2a);
      body.segment([x - 0.018, 1.66, 0.115], [x + 0.017, 1.662, 0.115], 0.007, 0x514039);
    }
    body.segment([-0.031, 1.535, 0.114], [0, 1.528, 0.122], 0.006, 0x83554c);
    body.segment([0, 1.528, 0.122], [0.031, 1.535, 0.114], 0.006, 0x83554c);
    // Gorro tejido con vuelta y pompón, a distintas alturas y colores.
    body.add(sphere, [0, 1.735, 0], [0.14, 0.095, 0.136], hat);
    body.add(sphere, [0, 1.696, 0], [0.145, 0.036, 0.14], trim);
    if (i % 3 !== 0) body.add(sphere, [0.015, 1.825, 0], [0.046, 0.045, 0.046], hat);
    fig.add(body.finish());
    const arms = [];
    for (const armSide of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(armSide * 0.23, 1.34, 0);
      const arm = builder();
      arm.segment([0, 0, 0], [armSide * 0.035, -0.27, 0], 0.09, jacket);
      arm.add(sphere, [armSide * 0.035, -0.26, 0], [0.086, 0.09, 0.085], jacket);
      arm.segment([armSide * 0.035, -0.26, 0], [armSide * 0.02, -0.48, 0.13], 0.075, jacket);
      arm.add(sphere, [armSide * 0.02, -0.48, 0.13], [0.075, 0.045, 0.075], trim);
      arm.add(sphere, [armSide * 0.02, -0.545, 0.15], [0.065, 0.083, 0.055], 0x29323b);
      arm.add(sphere, [-armSide * 0.033, -0.53, 0.17], [0.03, 0.047, 0.032], 0x29323b);
      shoulder.add(arm.finish());
      shoulder.userData.restAngle = armSide * (i % 3 === 0 || armSide === side ? 2.45 : 0.35);
      shoulder.rotation.z = shoulder.userData.restAngle;
      fig.add(shoulder);
      arms.push(shoulder);
    }
    const heightScale = 0.91 + rng() * 0.15;
    fig.scale.set(heightScale * (0.94 + rng() * 0.12), heightScale, heightScale);
    const w = track.toWorld(s, lat, snowRelief(s, lat, track.width));
    fig.position.copy(w);
    const facing = track.toWorld(finishS - 5, 0, 0);
    fig.lookAt(facing.x, w.y, facing.z);
    group.add(fig);
    crowd.push({ fig, arms, baseY: w.y, phase: rng() * Math.PI * 2, energy: 0.7 + rng() * 0.6 });
  }
  sphere.dispose(); capsule.dispose();
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

// Portillón de salida: pasillo estrecho, protecciones y brazo abatible.
function makeStartGate(track, s) {
  const gate = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc5d3de, metalness: 0.65, roughness: 0.32 });
  const padding = new THREE.MeshStandardMaterial({ color: 0xc54435, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16384b, roughness: 0.8 });
  const barMaterial = new THREE.MeshStandardMaterial({ color: 0xf4db76, roughness: 0.55 });
  const add = (geo, material, x, y, z, parent = gate) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.06, 0.06, 3.15, 10), steel, side * 1.3, 1.575, 0);
    add(new THREE.CylinderGeometry(0.17, 0.17, 1.35, 12), padding, side * 1.3, 0.675, 0);
    // Vallas del cajón y asas para impulsarse al salir.
    add(new THREE.BoxGeometry(0.06, 0.9, 3.8), dark, side * 1.65, 0.55, 1.6);
    add(new THREE.CylinderGeometry(0.045, 0.045, 1.15, 8), steel, side * 1.02, 0.95, 0.35);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12364b'; ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = '#e65b44'; ctx.fillRect(0, 174, 1024, 18);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 86px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SALIDA', 512, 84);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.BoxGeometry(3.35, 0.64, 0.16), dark, 0, 2.86, 0);
  add(new THREE.PlaneGeometry(3.3, 0.62), new THREE.MeshBasicMaterial({ map: texture }), 0, 2.86, 0.09);
  const arm = new THREE.Group();
  arm.position.set(-1.3, 0.86, 0.05);
  add(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 10), barMaterial, 1.3, 0, 0, arm).rotation.z = Math.PI / 2;
  gate.add(arm);
  add(new THREE.BoxGeometry(0.34, 0.48, 0.2), dark, 1.3, 1.9, 0.04);
  const light = add(new THREE.SphereGeometry(0.105, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff674f }), 1.3, 1.9, 0.16);
  gate.userData = { arm, light };
  const frame = track.frameAt(s);
  const right = frame.side.clone().negate();
  const up = new THREE.Vector3().crossVectors(right, frame.tan).normalize();
  gate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, frame.tan.clone().negate()));
  gate.position.copy(track.toWorld(s, 0, snowRelief(s, 0, track.width)));
  return gate;
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
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), track.frameAt(s).side);
  g.position.copy(track.toWorld(s, 0, 0));
  return g;
}
