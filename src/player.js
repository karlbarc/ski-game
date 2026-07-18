export const PARAMS = {
  gravity: 9.8,
  friction: 0.25,      // rozamiento base de la nieve (m/s²)
  drag: 0.0035,        // resistencia del aire (·v²)
  carveBrake: 2.5,     // frenada extra por carving (·|sin(heading)|)
  turnRate: 1.0,       // rad/s con steer a tope
  maxHeading: 1.1,     // rad
  jumpLaunchFactor: 0.12,
  minJumpVy: 2.0,
  rampLength: 6,       // la rampa sube desde o.s - rampLength hasta el labio en o.s
  rampHeight: 1.3,
  rampHalfWidth: 3.5,
  maxSpeed: 45,
  crawlSpeed: 1.5,      // por debajo de esto, el freno de carving se desactiva (evita soft-lock)
  tuckAccel: 2.4,       // bono de aceleración al ir en línea (m/s², se desvanece al girar)
  tuckWindow: 0.35,     // rad de heading dentro de los cuales aplica el bono
};

export function createPlayerState() {
  return {
    s: 0, lat: 0, heading: 0, speed: 0,
    height: 0, vy: 0, airborne: false,
    fallen: false,
  };
}

// El jugador se levanta cuando lo decide (botón Continuar): la penalización
// por caída es el tiempo que tarde en pulsarlo, con el crono corriendo.
export function recoverPlayer(state) {
  return { ...state, fallen: false };
}

// Busca una posición lateral dentro de la pista despejada de todos los
// obstáculos cercanos (un poco por detrás y varios metros por delante),
// para que al levantarte y arrancar recto no vuelvas a chocar.
function findClearLat(track, s, preferredLat) {
  const edge = track.width / 2 - 1;
  const nearby = track.obstacles.filter((o) =>
    (o.type === 'tree' || o.type === 'rock') && o.s > s - 2 && o.s < s + 10);
  const isClear = (lat) => nearby.every((o) => Math.abs(lat - o.lat) >= 1.8);
  const candidates = [preferredLat, 0];
  for (let d = 1; d <= edge; d += 0.5) candidates.push(d, -d);
  for (const lat of candidates) {
    const clamped = Math.max(-edge, Math.min(edge, lat));
    if (isClear(clamped)) return clamped;
  }
  return 0; // sin hueco perfecto (no debería ocurrir): al centro
}

function fall(st, track, params, obstacle) {
  st.fallen = true;
  st.speed = 0;
  st.heading = 0;
  st.airborne = false;
  st.height = 0;
  st.vy = 0;
  let preferred = st.lat;
  if (obstacle) {
    // Te levantas detrás del obstáculo, en el lado por el que venías.
    st.s = obstacle.s - 2.5;
    const delta = st.lat - obstacle.lat;
    const side = delta !== 0 ? Math.sign(delta) : (obstacle.lat > 0 ? -1 : 1);
    preferred = obstacle.lat + side * 1.8;
  }
  st.lat = findClearLat(track, st.s, preferred);
}

export function stepPlayer(state, steer, dt, track, params = PARAMS) {
  const st = { ...state };
  if (st.fallen) return st; // en el suelo hasta que recoverPlayer lo levante

  const frame = track.frameAt(st.s);

  if (!st.airborne) {
    st.heading += steer * params.turnRate * dt;
    st.heading = Math.max(-params.maxHeading, Math.min(params.maxHeading, st.heading));
    const slope = -frame.tan.y; // seno de la pendiente, positivo cuesta abajo
    const carveBrake = st.speed > params.crawlSpeed
      ? params.carveBrake * Math.abs(Math.sin(st.heading))
      : 0;
    const tuck = params.tuckAccel * Math.max(0, 1 - Math.abs(st.heading) / params.tuckWindow);
    const accel = params.gravity * slope * Math.cos(st.heading)
      + tuck
      - params.friction
      - params.drag * st.speed * st.speed
      - carveBrake;
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

  // Rampas: la altura sigue el plano inclinado hasta el labio (o.s) y ahí despega.
  if (!st.airborne) {
    let onRamp = false;
    for (const o of track.obstacles) {
      if (o.type !== 'jump' || Math.abs(st.lat - o.lat) >= params.rampHalfWidth) continue;
      if (st.s >= o.s - params.rampLength && st.s < o.s) {
        st.height = params.rampHeight * (st.s - (o.s - params.rampLength)) / params.rampLength;
        onRamp = true;
      } else if (sPrev < o.s && st.s >= o.s) {
        st.airborne = true;
        st.height = params.rampHeight;
        st.vy = Math.max(params.minJumpVy, st.speed * params.jumpLaunchFactor);
        onRamp = true;
      }
    }
    if (!onRamp && !st.airborne && st.height > 0) {
      // Se salió de la rampa por un lado: cae desde esa altura.
      st.airborne = true;
      st.vy = 0;
    }
  }

  for (const o of track.obstacles) {
    // Los árboles chocan también en el aire (la copa es más alta que cualquier
    // salto); las rocas son bajas y se pueden sobrevolar.
    if (o.type === 'tree' || (o.type === 'rock' && !st.airborne)) {
      // La roca es visualmente más pequeña que el abeto: caja de colisión más ajustada.
      const hitS = o.type === 'rock' ? 1.2 : 1.6;
      const hitLat = o.type === 'rock' ? 0.85 : 1.2;
      if (Math.abs(st.s - o.s) < hitS && Math.abs(st.lat - o.lat) < hitLat) {
        fall(st, track, params, o);
        return st;
      }
    }
  }

  if (!st.airborne && Math.abs(st.lat) > halfWidth) {
    fall(st, track, params);
  }

  return st;
}
