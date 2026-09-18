import { PARAMS } from './player.js';

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
