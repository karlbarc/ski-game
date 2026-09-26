import { PARAMS } from './player.js';

// Los ojos quedan sobre los pies respecto al plano de nieve. Elevarlos solo
// en el eje vertical retrasa la cámara al aumentar la pendiente y revela colas.
export function skiEyeOffset(tangent, height) {
  const horizontal = Math.hypot(tangent.x, tangent.z);
  const length = Math.hypot(horizontal, tangent.y);
  if (horizontal < 1e-6) return { x: 0, y: height, z: 0 };
  return {
    x: -tangent.x * tangent.y / (horizontal * length) * height,
    y: horizontal / length * height,
    z: -tangent.z * tangent.y / (horizontal * length) * height,
  };
}

// Altura de la superficie visible, incluidos los hombros laterales de las rampas.
// Al apoyar un esquí en el labio, prolongamos su plano para no hundir la punta.
export function skiSurfaceHeight(track, s, lat, relief, supportRamp = null) {
  let height = relief(s, lat, track.width);
  for (const ramp of track.obstacles) {
    if (ramp.type !== 'jump' || s < ramp.s - PARAMS.rampLength) continue;
    if (s > ramp.s && ramp !== supportRamp) continue;
    const lateral = Math.abs(lat - ramp.lat);
    if (lateral >= PARAMS.rampHalfWidth + 0.8) continue;
    const top = PARAMS.rampHeight * (s - ramp.s + PARAMS.rampLength) / PARAMS.rampLength;
    const shoulder = Math.max(0, (lateral - PARAMS.rampHalfWidth) / 0.8);
    height = Math.max(height, top * (1 - shoulder) - 0.08 * shoulder);
  }
  return height;
}

export function findSkiSupportRamp(track, player) {
  if (player.airborne) return null;
  return track.obstacles.find((ramp) => ramp.type === 'jump'
    && player.s >= ramp.s - PARAMS.rampLength - 2.2 && player.s < ramp.s
    && Math.abs(player.lat - ramp.lat) < PARAMS.rampHalfWidth + 0.8) || null;
}

// Compensa gradualmente el gran angular sin estirar las palas al acelerar.
export function skiLengthScale(fov) {
  return Math.tan(35 * Math.PI / 180) / Math.tan(fov * Math.PI / 360);
}

// Suavizado de la pose local: sigue al esquiador sin retrasar su trayectoria.
// La inclinación y la altura relativa conservan continuidad al despegar/aterrizar.
export function smoothSkiPose(previous, target, dt) {
  if (!previous) return { ...target };
  const pitchBlend = -Math.expm1(-Math.max(0, dt) / 0.10);
  const liftBlend = -Math.expm1(-Math.max(0, dt) / 0.14);
  return {
    pitch: previous.pitch + (target.pitch - previous.pitch) * pitchBlend,
    lift: previous.lift + (target.lift - previous.lift) * liftBlend,
  };
}
