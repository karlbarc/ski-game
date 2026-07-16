# Ski Game MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Juego de ski en primera persona en el navegador (móvil y escritorio): bajar la pista "Verde" con curvas, árboles y saltos en el menor tiempo posible sin caerse.

**Architecture:** La pista se define como datos (spline de puntos de control + obstáculos) y el motor genera la malla 3D. La física es arcade y vive en "espacio de pista" (s = distancia a lo largo de la spline, lat = desplazamiento lateral), lo que hace las curvas, colisiones y bordes triviales de calcular y de testear sin navegador. El render (Three.js) convierte (s, lat, height) a coordenadas de mundo.

**Tech Stack:** Three.js (instalado con npm, servido estático vía import map — sin build step), ES modules, `node --test` para tests unitarios, Playwright (skill webapp-testing) para verificación e2e.

## Global Constraints

- Todo el copy visible al usuario en español (spec: juego para móvil en español).
- Sin build step: el juego debe funcionar sirviendo el directorio con `python3 -m http.server`.
- Three.js se importa como `three` vía import map apuntando a `./node_modules/three/build/three.module.js` — la misma copia sirve para navegador y tests de Node.
- Tests unitarios: `node --test tests/` (sin frameworks adicionales).
- `package.json` con `"type": "module"`.
- Convención de ejes en espacio de pista: `s` = metros a lo largo de la spline; `lat` = metros laterales (positivo = izquierda del sentido de bajada); `heading` = radianes relativos a la tangente de la pista (positivo = girando a la izquierda); steer input +1 = girar a la izquierda.
- Commits frecuentes; mensajes en inglés convencional (`feat:`, `test:`, `chore:`).

---

### Task 1: Scaffolding del proyecto

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `src/main.js` (versión mínima; se reemplaza en Task 6)

**Interfaces:**
- Consumes: nada.
- Produces: `index.html` con todos los elementos DOM (`#start-screen`, `#btn-touch`, `#btn-gyro`, `#hud`, `#timer`, `#speed`, `#message`, `#finish-screen`, `#finish-time`, `#finish-best`, `#finish-record`, `#btn-restart`, `#error-screen`) e import map `three`. Tasks posteriores dependen de estos IDs exactos.

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "ski-game",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "serve": "python3 -m http.server 8173"
  },
  "dependencies": {
    "three": "^0.170.0"
  }
}
```

- [ ] **Step 2: Crear .gitignore**

```
node_modules/
```

- [ ] **Step 3: Instalar dependencias**

Run: `npm install`
Expected: crea `node_modules/three/build/three.module.js` (verificar con `ls node_modules/three/build/three.module.js`).

- [ ] **Step 4: Crear index.html completo**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Ski Verde</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; touch-action: none; font-family: system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
  canvas { display: block; }
  .overlay { position: fixed; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: rgba(10, 30, 50, 0.75); color: #fff; text-align: center; z-index: 10; padding: 24px; }
  .overlay.visible { display: flex; }
  .overlay h1 { font-size: 2.2rem; }
  .overlay button { font-size: 1.3rem; padding: 14px 36px; border: none; border-radius: 10px; background: #2f80d0; color: #fff; }
  .overlay button:active { background: #1f5f9f; }
  #hud { position: fixed; top: 12px; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 16px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.6); font-size: 1.4rem; font-variant-numeric: tabular-nums; z-index: 5; pointer-events: none; }
  #message { position: fixed; top: 20%; width: 100%; text-align: center; color: #ffdd57; font-size: 1.6rem; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,.7); opacity: 0; transition: opacity .3s; z-index: 5; pointer-events: none; }
  #message.visible { opacity: 1; }
  #finish-record { color: #ffdd57; font-weight: 700; }
</style>
</head>
<body>
<div id="hud"><span id="timer">00:00.00</span><span id="speed">0 km/h</span></div>
<div id="message"></div>
<div id="start-screen" class="overlay visible">
  <h1>⛷️ Pista Verde</h1>
  <p>Baja lo más rápido posible sin caerte.<br>Mantén pulsado un lado de la pantalla para girar.</p>
  <button id="btn-touch">Jugar (táctil)</button>
  <button id="btn-gyro">Jugar (giroscopio)</button>
</div>
<div id="finish-screen" class="overlay">
  <h1>🏁 ¡Meta!</h1>
  <p id="finish-time"></p>
  <p id="finish-best"></p>
  <p id="finish-record" style="display:none">¡Nuevo récord!</p>
  <button id="btn-restart">Reintentar</button>
</div>
<div id="error-screen" class="overlay"><h1>Tu navegador no soporta WebGL</h1></div>
<script type="importmap">
{ "imports": { "three": "./node_modules/three/build/three.module.js" } }
</script>
<script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Crear src/main.js mínimo (se reemplaza en Task 6)**

```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0xbfdcf5);
renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
console.log('ski-game scaffold OK');
```

- [ ] **Step 6: Verificar que el servidor estático sirve todo**

Run: `python3 -m http.server 8173 &` y luego
`curl -s -o /dev/null -w "%{http_code}" http://localhost:8173/index.html` → Expected: `200`
`curl -s -o /dev/null -w "%{http_code}" http://localhost:8173/node_modules/three/build/three.module.js` → Expected: `200`
Matar el servidor después (`kill %1`).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore index.html src/main.js
git commit -m "chore: scaffold ski game (three.js via import map, no build step)"
```

---

### Task 2: Lógica de carrera (cronómetro y mejor tiempo)

**Files:**
- Create: `src/race.js`
- Test: `tests/race.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `createRace(startS: number, finishS: number) -> {status: 'ready'|'running'|'finished', startS, finishS, startTime: number, elapsed: number}`
  - `updateRace(race, playerS: number, nowMs: number) -> race` (inmutable, devuelve copia)
  - `formatTime(seconds: number) -> string` formato `mm:ss.cc`
  - `loadBest(storage, trackName: string) -> number|null`
  - `saveBest(storage, trackName: string, time: number) -> boolean` (true si es récord; clave `ski-best-${trackName}`)

- [ ] **Step 1: Escribir tests que fallen**

`tests/race.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, updateRace, formatTime, loadBest, saveBest } from '../src/race.js';

test('race starts when crossing the start line and finishes at the finish line', () => {
  let r = createRace(15, 700);
  r = updateRace(r, 0, 1000);
  assert.equal(r.status, 'ready');
  r = updateRace(r, 16, 2000);
  assert.equal(r.status, 'running');
  r = updateRace(r, 100, 7000);
  assert.equal(r.elapsed, 5);
  r = updateRace(r, 701, 62000);
  assert.equal(r.status, 'finished');
  assert.equal(r.elapsed, 60);
});

test('formatTime renders mm:ss.cc', () => {
  assert.equal(formatTime(65.239), '01:05.23');
  assert.equal(formatTime(0), '00:00.00');
});

test('saveBest only overwrites with better times', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadBest(storage, 'Verde'), null);
  assert.equal(saveBest(storage, 'Verde', 70), true);
  assert.equal(saveBest(storage, 'Verde', 80), false);
  assert.equal(loadBest(storage, 'Verde'), 70);
  assert.equal(saveBest(storage, 'Verde', 60), true);
  assert.equal(loadBest(storage, 'Verde'), 60);
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/race.js'`

- [ ] **Step 3: Implementar src/race.js**

```js
export function createRace(startS, finishS) {
  return { status: 'ready', startS, finishS, startTime: 0, elapsed: 0 };
}

export function updateRace(race, playerS, nowMs) {
  const r = { ...race };
  if (r.status === 'ready' && playerS >= r.startS) {
    r.status = 'running';
    r.startTime = nowMs;
  }
  if (r.status === 'running') {
    r.elapsed = (nowMs - r.startTime) / 1000;
    if (playerS >= r.finishS) r.status = 'finished';
  }
  return r;
}

export function formatTime(sec) {
  const pad = (n) => String(n).padStart(2, '0');
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const c = Math.floor((sec * 100) % 100);
  return `${pad(m)}:${pad(s)}.${pad(c)}`;
}

export function loadBest(storage, trackName) {
  const v = storage.getItem(`ski-best-${trackName}`);
  return v == null ? null : parseFloat(v);
}

export function saveBest(storage, trackName, time) {
  const best = loadBest(storage, trackName);
  if (best === null || time < best) {
    storage.setItem(`ski-best-${trackName}`, String(time));
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/race.js tests/race.test.mjs
git commit -m "feat: race timer and best-time persistence logic"
```

---

### Task 3: Pista — datos y geometría (track.js + verde.js)

**Files:**
- Create: `src/track.js`
- Create: `src/tracks/verde.js`
- Test: `tests/track.test.mjs`

**Interfaces:**
- Consumes: `three` (CatmullRomCurve3, Vector3).
- Produces:
  - `src/tracks/verde.js` exporta `verde = { name: 'Verde', width: 16, controlPoints: number[][], obstacles: {type: 'tree'|'jump', t: number, offset: number}[] }`
  - `buildTrack(data) -> { curve, length: number, width: number, frameAt(s) -> {pos: Vector3, tan: Vector3, side: Vector3, curvature: number}, toWorld(s, lat, height=0) -> Vector3, obstacles: {type, t, offset, s, lat}[], data }`
    - `side` es horizontal, apunta a la izquierda del sentido de bajada; `curvature` en rad/m (proyección horizontal, con signo, mismo sentido que `heading`).
  - `mulberry32(seed) -> () => number` RNG determinista (lo usa Task 6 para colocar árboles del bosque).

- [ ] **Step 1: Escribir tests que fallen**

`tests/track.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/track.js';
import { verde } from '../src/tracks/verde.js';

test('buildTrack computes a plausible length', () => {
  const track = buildTrack(verde);
  assert.ok(track.length > 500 && track.length < 1200, `length=${track.length}`);
});

test('toWorld at s=0 lat=0 is near the first control point', () => {
  const track = buildTrack(verde);
  const p = track.toWorld(0, 0);
  const [x, y, z] = verde.controlPoints[0];
  assert.ok(p.distanceTo({ x, y, z }) < 1);
});

test('the track descends and side vectors are horizontal', () => {
  const track = buildTrack(verde);
  const a = track.frameAt(0);
  const b = track.frameAt(track.length);
  assert.ok(b.pos.y < a.pos.y - 50);
  assert.ok(Math.abs(track.frameAt(200).side.y) < 0.01);
});

test('obstacles are resolved to track coordinates', () => {
  const track = buildTrack(verde);
  assert.ok(track.obstacles.length >= 5);
  for (const o of track.obstacles) {
    assert.ok(o.s >= 0 && o.s <= track.length);
    assert.equal(o.lat, o.offset);
  }
});

test('curvature is finite everywhere and nonzero somewhere', () => {
  const track = buildTrack(verde);
  let maxC = 0;
  for (let s = 0; s < track.length; s += 10) {
    const c = track.frameAt(s).curvature;
    assert.ok(Number.isFinite(c));
    maxC = Math.max(maxC, Math.abs(c));
  }
  assert.ok(maxC > 0.001);
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/track.js'`

- [ ] **Step 3: Implementar src/tracks/verde.js**

```js
// Pista Verde (fácil): ~780 m, eses amplias, 2 saltos, árboles sueltos dentro de la pista.
export const verde = {
  name: 'Verde',
  width: 16,
  controlPoints: [
    [0, 0, 0],
    [0, -9, -70],
    [22, -18, -135],
    [42, -27, -195],
    [30, -36, -255],
    [-8, -46, -310],
    [-38, -57, -365],
    [-30, -68, -425],
    [5, -79, -480],
    [32, -90, -535],
    [18, -100, -595],
    [0, -108, -655],
    [0, -114, -720],
  ],
  obstacles: [
    { type: 'jump', t: 0.07, offset: 0 },
    { type: 'tree', t: 0.18, offset: 3 },
    { type: 'tree', t: 0.26, offset: -4 },
    { type: 'tree', t: 0.38, offset: 2 },
    { type: 'tree', t: 0.47, offset: -3 },
    { type: 'jump', t: 0.6, offset: 0 },
    { type: 'tree', t: 0.72, offset: 4 },
    { type: 'tree', t: 0.8, offset: -2 },
    { type: 'tree', t: 0.88, offset: 3 },
  ],
};
```

- [ ] **Step 4: Implementar src/track.js**

```js
import * as THREE from 'three';

const SAMPLES = 800;
const UP = new THREE.Vector3(0, 1, 0);

// RNG determinista (mulberry32) para colocar el bosque siempre igual.
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTrack(data) {
  const points = data.controlPoints.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();

  const frames = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const pos = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tan).normalize();
    frames.push({ s: u * length, pos, tan, side, curvature: 0 });
  }
  // Curvatura con signo (rad/m) de la proyección horizontal, mismo sentido que heading.
  for (let i = 1; i < frames.length - 1; i++) {
    const a = frames[i - 1].tan;
    const b = frames[i + 1].tan;
    let d = Math.atan2(b.x, b.z) - Math.atan2(a.x, a.z);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    frames[i].curvature = d / (frames[i + 1].s - frames[i - 1].s);
  }

  function frameAt(s) {
    const clamped = Math.min(Math.max(s, 0), length);
    const f = (clamped / length) * SAMPLES;
    const i = Math.min(Math.floor(f), SAMPLES - 1);
    const t = f - i;
    const A = frames[i];
    const B = frames[i + 1];
    return {
      pos: A.pos.clone().lerp(B.pos, t),
      tan: A.tan.clone().lerp(B.tan, t).normalize(),
      side: A.side.clone().lerp(B.side, t).normalize(),
      curvature: A.curvature + (B.curvature - A.curvature) * t,
    };
  }

  function toWorld(s, lat, height = 0) {
    const f = frameAt(s);
    return f.pos.clone().addScaledVector(f.side, lat).add(new THREE.Vector3(0, height, 0));
  }

  const obstacles = data.obstacles.map((o) => ({ ...o, s: o.t * length, lat: o.offset }));

  return { curve, length, width: data.width, frameAt, toWorld, obstacles, data };
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npm test`
Expected: PASS (todos los tests, incluidos los de race)

- [ ] **Step 6: Commit**

```bash
git add src/track.js src/tracks/verde.js tests/track.test.mjs
git commit -m "feat: spline-based track builder and Verde track data"
```

---

### Task 4: Física del esquiador (player.js)

**Files:**
- Create: `src/player.js`
- Test: `tests/player.test.mjs`

**Interfaces:**
- Consumes: `track.frameAt(s)`, `track.width`, `track.obstacles` (de Task 3).
- Produces:
  - `PARAMS` (constantes de física, exportadas para tuning y tests)
  - `createPlayerState() -> {s, lat, heading, speed, height, vy, airborne, fallen, fallTimer}`
  - `stepPlayer(state, steer: number, dt: number, track, params = PARAMS) -> state` (inmutable, devuelve copia). `steer` ∈ [-1, 1], +1 = izquierda.

**Modelo físico (espacio de pista):**
- La gravedad proyectada en la pendiente acelera; drag cuadrático y fricción limitan la velocidad (~16 m/s máx).
- Girar (heading ≠ 0) frena (carveBrake) y desplaza lateralmente: `dlat = speed·sin(heading)·dt`.
- La pista "gira bajo el jugador": `heading -= curvature·ds`. Para seguir una curva hay que contra-girar; si no, derivas hacia el borde (efecto centrífugo emergente).
- Saltos: al cruzar `o.s` de un `jump` cerca del centro (|lat−o.lat| < 3.5), despega con `vy = max(minJumpVy, speed·jumpLaunchFactor)`. En el aire no se puede girar (pero la curvatura sigue aplicando: vuelas recto mientras la pista gira).
- Caída: árbol (|Δs| < 1.6 y |Δlat| < 1.2) o salirse (|lat| > width/2, solo en el suelo). Efecto: speed=0, heading=0, fallTimer=fallPenalty, lat re-centrado dentro de la pista.

- [ ] **Step 1: Escribir tests que fallen**

`tests/player.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerState, stepPlayer, PARAMS } from '../src/player.js';
import { buildTrack } from '../src/track.js';
import { verde } from '../src/tracks/verde.js';

const track = buildTrack(verde);

function run(state, steer, seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) state = stepPlayer(state, steer, dt, track);
  return state;
}

test('gravity accelerates the player down the slope', () => {
  const st = run(createPlayerState(), 0, 3);
  assert.ok(st.speed > 2, `speed=${st.speed}`);
  assert.ok(st.s > 3, `s=${st.s}`);
});

test('steering changes heading and drifts laterally', () => {
  let st = { ...createPlayerState(), speed: 10 };
  st = run(st, 1, 0.5);
  assert.ok(st.heading > 0.2, `heading=${st.heading}`);
  assert.ok(st.lat > 0.1, `lat=${st.lat}`);
});

test('carving brakes compared to going straight', () => {
  const straight = run({ ...createPlayerState(), speed: 10 }, 0, 1.2);
  let carving = { ...createPlayerState(), speed: 10 };
  carving = run(carving, 1, 0.6);
  carving = run(carving, -1, 0.6);
  assert.ok(carving.speed < straight.speed, `${carving.speed} vs ${straight.speed}`);
});

test('hitting a tree causes a fall: speed 0 and penalty timer', () => {
  const tree = track.obstacles.find((o) => o.type === 'tree');
  let st = { ...createPlayerState(), s: tree.s - 5, lat: tree.lat, speed: 12 };
  st = run(st, 0, 1);
  assert.equal(st.fallen, true);
  assert.equal(st.speed, 0);
  assert.ok(st.fallTimer > 0);
});

test('going off-piste causes a fall and re-centers inside the track', () => {
  let st = { ...createPlayerState(), s: 100, lat: 0, speed: 12 };
  st = run(st, 1, 3);
  assert.equal(st.fallen, true);
  assert.ok(Math.abs(st.lat) <= track.width / 2);
});

test('fall recovers after the penalty', () => {
  let st = { ...createPlayerState(), s: 100, speed: 0, fallen: true, fallTimer: PARAMS.fallPenalty };
  st = run(st, 0, PARAMS.fallPenalty + 0.1);
  assert.equal(st.fallen, false);
});

test('ramps launch the player and steering is locked in the air', () => {
  const jump = track.obstacles.find((o) => o.type === 'jump');
  let st = { ...createPlayerState(), s: jump.s - 3, lat: jump.lat, speed: 14 };
  st = run(st, 0, 0.5);
  assert.equal(st.airborne, true);
  const a = stepPlayer(st, 1, 1 / 60, track);
  const b = stepPlayer(st, -1, 1 / 60, track);
  assert.equal(a.heading, b.heading);
});

test('the player lands after a jump', () => {
  const jump = track.obstacles.find((o) => o.type === 'jump');
  let st = { ...createPlayerState(), s: jump.s - 3, lat: jump.lat, speed: 14 };
  st = run(st, 0, 4);
  assert.equal(st.airborne, false);
  assert.equal(st.height, 0);
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/player.js'`

- [ ] **Step 3: Implementar src/player.js**

```js
export const PARAMS = {
  gravity: 9.8,
  friction: 0.25,      // rozamiento base de la nieve (m/s²)
  drag: 0.005,         // resistencia del aire (·v²)
  carveBrake: 2.5,     // frenada extra por carving (·|sin(heading)|)
  turnRate: 1.8,       // rad/s con steer a tope
  maxHeading: 1.1,     // rad
  jumpLaunchFactor: 0.22,
  minJumpVy: 2.5,
  fallPenalty: 3.0,    // segundos parado tras caerse
  maxSpeed: 45,
};

export function createPlayerState() {
  return {
    s: 0, lat: 0, heading: 0, speed: 0,
    height: 0, vy: 0, airborne: false,
    fallen: false, fallTimer: 0,
  };
}

function fall(st, halfWidth, params) {
  st.fallen = true;
  st.fallTimer = params.fallPenalty;
  st.speed = 0;
  st.heading = 0;
  st.airborne = false;
  st.height = 0;
  st.vy = 0;
  const edge = halfWidth - 1;
  st.lat = Math.max(-edge, Math.min(edge, st.lat));
}

export function stepPlayer(state, steer, dt, track, params = PARAMS) {
  const st = { ...state };
  if (st.fallen) {
    st.fallTimer -= dt;
    if (st.fallTimer <= 0) {
      st.fallen = false;
      st.fallTimer = 0;
    }
    return st;
  }

  const frame = track.frameAt(st.s);

  if (!st.airborne) {
    st.heading += steer * params.turnRate * dt;
    st.heading = Math.max(-params.maxHeading, Math.min(params.maxHeading, st.heading));
    const slope = -frame.tan.y; // seno de la pendiente, positivo cuesta abajo
    const accel = params.gravity * slope * Math.cos(st.heading)
      - params.friction
      - params.drag * st.speed * st.speed
      - params.carveBrake * Math.abs(Math.sin(st.heading));
    st.speed = Math.max(0, Math.min(params.maxSpeed, st.speed + accel * dt));
  } else {
    st.height += st.vy * dt;
    st.vy -= params.gravity * dt;
    if (st.height <= 0) {
      st.height = 0;
      st.vy = 0;
      st.airborne = false;
    }
  }

  const sPrev = st.s;
  const ds = st.speed * Math.cos(st.heading) * dt;
  st.s += ds;
  st.lat += st.speed * Math.sin(st.heading) * dt;
  st.heading -= frame.curvature * ds; // la pista gira bajo el jugador

  const halfWidth = track.width / 2;

  for (const o of track.obstacles) {
    if (o.type === 'jump' && !st.airborne && sPrev < o.s && st.s >= o.s
        && Math.abs(st.lat - o.lat) < 3.5) {
      st.airborne = true;
      st.height = 0.01;
      st.vy = Math.max(params.minJumpVy, st.speed * params.jumpLaunchFactor);
    }
    if (o.type === 'tree' && !st.airborne
        && Math.abs(st.s - o.s) < 1.6 && Math.abs(st.lat - o.lat) < 1.2) {
      fall(st, halfWidth, params);
      return st;
    }
  }

  if (!st.airborne && Math.abs(st.lat) > halfWidth) {
    fall(st, halfWidth, params);
  }

  return st;
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/player.js tests/player.test.mjs
git commit -m "feat: arcade ski physics in track space (carving, jumps, falls)"
```

---

### Task 5: Controles (táctil, giroscopio, teclado)

**Files:**
- Create: `src/controls.js`
- Test: `tests/controls.test.mjs`

**Interfaces:**
- Consumes: DOM global (`window`, eventos `keydown/keyup`, `touchstart/touchmove/touchend`, `deviceorientation`).
- Produces:
  - `combineSteer(...values) -> number` (pura: gana el input de mayor magnitud, clamp a [-1, 1])
  - `createControls(target = window) -> { steer() -> number, setMode(mode: 'touch'|'gyro') -> Promise<boolean>, mode() -> string }`
  - Convención: steer +1 = izquierda. ArrowLeft/lado izquierdo de pantalla/inclinar el móvil a la izquierda → +1. El teclado siempre está activo (útil en escritorio y tests e2e).
  - `setMode('gyro')` pide permiso en iOS (`DeviceOrientationEvent.requestPermission`); si falla o se deniega devuelve `false` y deja modo `touch`.

- [ ] **Step 1: Escribir test que falle (parte pura)**

`tests/controls.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { combineSteer } from '../src/controls.js';

test('combineSteer picks the strongest input and clamps to [-1, 1]', () => {
  assert.equal(combineSteer(0, 0), 0);
  assert.equal(combineSteer(1, -0.3), 1);
  assert.equal(combineSteer(-0.5, 0.2), -0.5);
  assert.equal(combineSteer(2, 0), 1);
  assert.equal(combineSteer(-3, 0.1), -1);
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/controls.js'`

- [ ] **Step 3: Implementar src/controls.js**

Nota: el módulo toca APIs de navegador dentro de `createControls`; solo `combineSteer` se importa en Node (el import del módulo no debe ejecutar código de navegador a nivel de módulo).

```js
export function combineSteer(...values) {
  let out = 0;
  for (const v of values) if (Math.abs(v) > Math.abs(out)) out = v;
  return Math.max(-1, Math.min(1, out));
}

export function createControls(target = window) {
  const state = { mode: 'touch', keyboard: 0, touch: 0, gyro: 0 };
  const keys = new Set();

  function syncKeys() {
    state.keyboard = (keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0);
  }
  target.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      keys.add(e.key);
      syncKeys();
    }
  });
  target.addEventListener('keyup', (e) => {
    keys.delete(e.key);
    syncKeys();
  });

  function touchSync(e) {
    let v = 0;
    for (const t of e.touches) v = t.clientX < innerWidth / 2 ? 1 : -1;
    state.touch = e.touches.length ? v : 0;
  }
  target.addEventListener('touchstart', touchSync, { passive: false });
  target.addEventListener('touchmove', (e) => {
    e.preventDefault();
    touchSync(e);
  }, { passive: false });
  target.addEventListener('touchend', touchSync);

  target.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    // gamma < 0 = inclinar a la izquierda (portrait) -> steer positivo
    state.gyro = Math.max(-1, Math.min(1, -e.gamma / 25));
  });

  async function setMode(mode) {
    if (mode === 'gyro') {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined'
            && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') throw new Error('denied');
        }
      } catch {
        state.mode = 'touch';
        return false;
      }
    }
    state.mode = mode;
    return true;
  }

  return {
    steer: () => combineSteer(state.keyboard, state.mode === 'gyro' ? state.gyro : state.touch),
    setMode,
    mode: () => state.mode,
  };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/controls.js tests/controls.test.mjs
git commit -m "feat: touch, gyroscope and keyboard controls"
```

---

### Task 6: Escena 3D, HUD e integración (main.js + hud.js)

**Files:**
- Create: `src/hud.js`
- Modify: `src/main.js` (reemplazar completo el placeholder de Task 1)

**Interfaces:**
- Consumes: todo lo anterior — `buildTrack`, `mulberry32`, `verde`, `createPlayerState`, `stepPlayer`, `PARAMS`, `createRace`, `updateRace`, `formatTime`, `loadBest`, `saveBest`, `createControls`; IDs del DOM de Task 1.
- Produces:
  - `createHud(doc = document) -> { setTimer(text), setSpeed(kmh), flash(text, ms), showFinish(timeText, bestText, isRecord), hideFinish(), hideStart() }`
  - `window.__game = { state: () => ({ player, race }), trackLength }` (hook para verificación e2e)
  - Query params: `?autopilot=1` (steering automático para e2e) y `?timescale=N` (multiplica dt; solo para e2e).

- [ ] **Step 1: Implementar src/hud.js**

```js
export function createHud(doc = document) {
  const el = (id) => doc.getElementById(id);
  let msgTimer = 0;
  return {
    setTimer(text) { el('timer').textContent = text; },
    setSpeed(kmh) { el('speed').textContent = `${Math.round(kmh)} km/h`; },
    flash(text, ms = 1500) {
      const m = el('message');
      m.textContent = text;
      m.classList.add('visible');
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => m.classList.remove('visible'), ms);
    },
    showFinish(timeText, bestText, isRecord) {
      el('finish-time').textContent = timeText;
      el('finish-best').textContent = bestText;
      el('finish-record').style.display = isRecord ? 'block' : 'none';
      el('finish-screen').classList.add('visible');
    },
    hideFinish() { el('finish-screen').classList.remove('visible'); },
    hideStart() { el('start-screen').classList.remove('visible'); },
  };
}
```

- [ ] **Step 2: Reemplazar src/main.js completo**

```js
import * as THREE from 'three';
import { buildTrack, mulberry32 } from './track.js';
import { verde } from './tracks/verde.js';
import { createPlayerState, stepPlayer, PARAMS } from './player.js';
import { createRace, updateRace, formatTime, loadBest, saveBest } from './race.js';
import { createControls } from './controls.js';
import { createHud } from './hud.js';

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

const track = buildTrack(verde);
const START_S = 15;
const FINISH_S = track.length - 15;

scene.add(makeRibbon(track, -track.width / 2, track.width / 2, 0xf4f9ff, 0));
scene.add(makeRibbon(track, track.width / 2, track.width / 2 + 25, 0xdde7ee, 0.15));
scene.add(makeRibbon(track, -track.width / 2 - 25, -track.width / 2, 0xdde7ee, 0.15));
scene.add(makeTrees(track));
scene.add(makeRamps(track));
scene.add(makeGate(track, START_S, 0xd04040));
scene.add(makeGate(track, FINISH_S, 0x3050c0));

let player = createPlayerState();
let race = createRace(START_S, FINISH_S);
let started = false;
let finishShown = false;
let lastSteer = 0;

const hud = createHud();
const controls = createControls();

document.getElementById('btn-touch').addEventListener('click', () => startGame('touch'));
document.getElementById('btn-gyro').addEventListener('click', () => startGame('gyro'));
document.getElementById('btn-restart').addEventListener('click', restart);

function startGame(mode) {
  controls.setMode(mode).then((ok) => {
    if (!ok) hud.flash('Giroscopio no disponible, usando táctil');
  });
  hud.hideStart();
  started = true;
}

function restart() {
  player = createPlayerState();
  race = createRace(START_S, FINISH_S);
  finishShown = false;
  hud.hideFinish();
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
  const isRecord = saveBest(localStorage, track.data.name, time);
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
  camera.rotateZ(player.fallen ? 0.5 : lastSteer * 0.12);
  const fov = Math.min(95, 70 + player.speed * 0.9);
  if (Math.abs(fov - camera.fov) > 0.1) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, 0.05) * TIMESCALE;
  last = now;

  if (started && race.status !== 'finished') {
    lastSteer = AUTOPILOT ? autopilotSteer() : controls.steer();
    const prev = player;
    player = stepPlayer(player, lastSteer, dt, track);
    race = updateRace(race, player.s, now);
    if (player.fallen && !prev.fallen) hud.flash('¡Te has caído!');
    if (player.airborne && !prev.airborne) hud.flash('¡Salto!', 800);
    if (race.status === 'finished' && !finishShown) finish();
  }

  updateCamera();
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

window.__game = { state: () => ({ player, race }), trackLength: track.length };

// ---------- construcción de la escena ----------

function makeRibbon(track, latA, latB, color, drop) {
  const rows = 400;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= rows; i++) {
    const s = (i / rows) * track.length;
    const a = track.toWorld(s, latA, -drop);
    const b = track.toWorld(s, latB, -drop);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  for (let i = 0; i < rows; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

function makeTrees(track) {
  const group = new THREE.Group();
  const rng = mulberry32(42);
  const positions = [];
  for (let s = 5; s < track.length - 5; s += 5) {
    for (const sideSign of [-1, 1]) {
      if (rng() < 0.75) {
        positions.push({
          s,
          lat: sideSign * (track.width / 2 + 2 + rng() * 12),
          scale: 0.8 + rng() * 0.7,
        });
      }
    }
  }
  for (const o of track.obstacles) {
    if (o.type === 'tree') positions.push({ s: o.s, lat: o.lat, scale: 1 });
  }
  const foliage = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.6, 4.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x1d5c33 }),
    positions.length,
  );
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.25, 0.3, 1.6, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a3d24 }),
    positions.length,
  );
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => {
    const w = track.toWorld(p.s, p.lat, 0);
    m.makeScale(p.scale, p.scale, p.scale).setPosition(w.x, w.y + 2.8 * p.scale, w.z);
    foliage.setMatrixAt(i, m);
    m.makeScale(p.scale, p.scale, p.scale).setPosition(w.x, w.y + 0.8 * p.scale, w.z);
    trunk.setMatrixAt(i, m);
  });
  group.add(foliage, trunk);
  return group;
}

function makeRamps(track) {
  const group = new THREE.Group();
  for (const o of track.obstacles) {
    if (o.type !== 'jump') continue;
    const f = track.frameAt(o.s);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8f2fb }),
    );
    mesh.position.copy(track.toWorld(o.s, o.lat, 0.2));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), f.tan);
    mesh.rotateX(-0.18);
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
```

- [ ] **Step 3: Verificar que los tests unitarios siguen pasando**

Run: `npm test`
Expected: PASS (main.js no se importa en tests, pero confirma que no se rompió nada)

- [ ] **Step 4: Smoke test con Playwright (skill webapp-testing)**

Arrancar el servidor: `python3 -m http.server 8173` (en background). Usar la skill `example-skills:webapp-testing` con viewport móvil (390×844) para comprobar en `http://localhost:8173/`:
- La página carga sin errores en la consola del navegador.
- `#start-screen` es visible; tras click en `#btn-touch` desaparece y hay un `<canvas>` renderizando (screenshot para inspección visual: se debe ver la pista blanca, árboles y la portería de salida).
- `window.__game.state().player.s` crece tras ~3 segundos (el jugador se desliza).

Expected: todo lo anterior se cumple; guardar screenshot en el scratchpad para revisión.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/hud.js
git commit -m "feat: 3D scene, first-person camera, HUD and game loop"
```

---

### Task 7: Verificación end-to-end y ajuste fino

**Files:**
- Create: `README.md`
- Modify: `src/player.js` y/o `src/main.js` (solo constantes de tuning, si la verificación lo exige)

**Interfaces:**
- Consumes: `window.__game`, query params `?autopilot=1&timescale=N`, DOM IDs.
- Produces: juego verificado de extremo a extremo + README con instrucciones.

- [ ] **Step 1: E2E — completar la pista con autopilot**

Con el servidor corriendo, usar Playwright (skill webapp-testing), viewport móvil:
1. Abrir `http://localhost:8173/?autopilot=1&timescale=4`.
2. Click en `#btn-touch`.
3. Esperar (timeout 90 s) hasta que `window.__game.state().race.status === 'finished'`.
4. Comprobar que `#finish-screen` es visible y `#finish-time` cumple `/\d{2}:\d{2}\.\d{2}/`.

Expected: la carrera termina sin que el autopilot se caiga. Si el autopilot se cae, ajustar las ganancias de `autopilotSteer` o los parámetros de física y repetir (después de cualquier cambio en `PARAMS`, correr `npm test`).

- [ ] **Step 2: E2E — persistencia del mejor tiempo**

En la misma página tras terminar: leer `localStorage.getItem('ski-best-Verde')` → debe ser un número. Recargar, correr de nuevo con autopilot y comprobar que `#finish-best` muestra un tiempo.

Expected: el mejor tiempo persiste entre recargas.

- [ ] **Step 3: E2E — caída con penalización**

1. Abrir `http://localhost:8173/?timescale=2` (sin autopilot).
2. Click en `#btn-touch`.
3. Mantener `ArrowLeft` (keyboard.down) durante 4 s → el jugador debe salirse de la pista.
4. Comprobar `window.__game.state().player.fallen === true` en algún momento y que `#message` mostró "¡Te has caído!".
5. Esperar >3 s y comprobar que `fallen` vuelve a `false` y el jugador puede seguir.

Expected: caída, penalización y recuperación funcionan.

- [ ] **Step 4: Juego manual en escritorio (sanity check humano)**

Run: `npm run serve` y abrir `http://localhost:8173/` — bajar con las flechas. Criterio: se puede completar la pista con esfuerzo razonable (dificultad "verde"), los saltos se notan, chocar con un árbol tira al suelo. Ajustar `PARAMS` (carveBrake, turnRate, drag) si la sensación es mala; re-correr `npm test` tras cualquier ajuste.

- [ ] **Step 5: Crear README.md**

```markdown
# Ski Verde ⛷️

Juego de ski en primera persona para navegador (móvil y escritorio).
Baja la pista en el menor tiempo posible sin caerte.

## Jugar

```bash
npm install
npm run serve
```

Abre http://localhost:8173 (en el móvil: usa la IP local de tu máquina).

- **Táctil:** mantén pulsado el lado izquierdo/derecho de la pantalla para girar.
- **Giroscopio:** inclina el teléfono (requiere aceptar el permiso en iOS).
- **Teclado:** flechas ← →.

Chocar con un árbol o salirte de la pista te tira al suelo (~3 s de penalización).
El mejor tiempo se guarda en el navegador.

## Desarrollo

- `npm test` — tests unitarios (física, pista, cronómetro) con `node --test`.
- Las pistas son datos: añade un archivo en `src/tracks/` con puntos de control y obstáculos.

## Verificación e2e

Query params de ayuda: `?autopilot=1` (steering automático) y `?timescale=4` (acelera el tiempo).
```

- [ ] **Step 6: Commit final**

```bash
git add README.md src/player.js src/main.js
git commit -m "docs: README + e2e-verified gameplay tuning"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** pista por spline ✓ (Task 3), física arcade/carving ✓ (Task 4), caída con penalización 3 s y crono corriendo ✓ (Task 2+4: el crono es wall-clock y no se pausa), saltos sin giro en el aire ✓ (Task 4), controles táctil/giro/teclado con fallback iOS ✓ (Task 5), HUD + mejor tiempo localStorage ✓ (Task 2+6), fallback WebGL ✓ (Task 6), verificación Playwright móvil ✓ (Task 6+7).
- **Consistencia de tipos:** `frameAt/toWorld/obstacles` (Task 3) coinciden con su uso en Tasks 4 y 6; `combineSteer/steer/setMode` coinciden entre Tasks 5 y 6; IDs del DOM de Task 1 coinciden con hud.js/main.js de Task 6.
- **Sin placeholders:** todo el código está completo en el plan.
