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
  crawlSpeed: 1.5,      // por debajo de esto, el freno de carving se desactiva (evita soft-lock)
  tuckAccel: 1.6,       // bono de aceleración al ir en línea (m/s², se desvanece al girar)
  tuckWindow: 0.35,     // rad de heading dentro de los cuales aplica el bono
};

export function createPlayerState() {
  return {
    s: 0, lat: 0, heading: 0, speed: 0,
    height: 0, vy: 0, airborne: false,
    fallen: false, fallTimer: 0,
  };
}

function fall(st, halfWidth, params, obstacle) {
  st.fallen = true;
  st.fallTimer = params.fallPenalty;
  st.speed = 0;
  st.heading = 0;
  st.airborne = false;
  st.height = 0;
  st.vy = 0;
  if (obstacle) {
    // Te levantas justo detrás del obstáculo y a un lado, fuera de su
    // zona de colisión, para no volver a chocar con lo mismo al arrancar.
    st.s = obstacle.s - 2.5;
    const delta = st.lat - obstacle.lat;
    const side = delta !== 0 ? Math.sign(delta) : (obstacle.lat > 0 ? -1 : 1);
    st.lat = obstacle.lat + side * 1.8;
  }
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

  for (const o of track.obstacles) {
    if (o.type === 'jump' && !st.airborne && sPrev < o.s && st.s >= o.s
        && Math.abs(st.lat - o.lat) < 3.5) {
      st.airborne = true;
      st.height = 0.01;
      st.vy = Math.max(params.minJumpVy, st.speed * params.jumpLaunchFactor);
    }
    if ((o.type === 'tree' || o.type === 'rock') && !st.airborne
        && Math.abs(st.s - o.s) < 1.6 && Math.abs(st.lat - o.lat) < 1.2) {
      fall(st, halfWidth, params, o);
      return st;
    }
  }

  if (!st.airborne && Math.abs(st.lat) > halfWidth) {
    fall(st, halfWidth, params);
  }

  return st;
}
