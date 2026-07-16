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
