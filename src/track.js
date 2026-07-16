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
