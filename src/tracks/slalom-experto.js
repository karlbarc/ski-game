import { slalom } from './slalom.js';
import { CatmullRomCurve3, Vector3 } from 'three';

// Amplifica cada tramo vertical por separado para crear palas y transiciones
// más marcadas sin introducir ningún segmento cuesta arriba.
const controlPoints = [];
let height = slalom.controlPoints[0][1];
for (let i = 0; i < slalom.controlPoints.length; i++) {
  const [x, y, z] = slalom.controlPoints[i];
  if (i > 0) {
    const t = i / (slalom.controlPoints.length - 1);
    const previousY = slalom.controlPoints[i - 1][1];
    const slopeMultiplier = 1.4 + 0.18 * Math.sin(t * Math.PI * 8);
    height += (y - previousY) * slopeMultiplier;
  }
  controlPoints.push([x * 1.5, height, z * 1.08]);
}

const gateCount = 24;
const trackLength = new CatmullRomCurve3(
  controlPoints.map((point) => new Vector3(...point)), false, 'centripetal',
).getLength();
const gateSpacingT = 38 / trackLength;
const firstGateT = (1 - gateSpacingT * (gateCount - 1)) / 2;

export const slalomExperto = {
  name: 'Experto',
  emoji: '⚫',
  category: 'slalom',
  difficultyLevel: 4,
  difficulty: 'Experto',
  accent: '#9d79e8',
  description: '24 banderines muy juntos, palas más empinadas y cambios de pendiente continuos. Exige anticipación y precisión; toque +2 s, paso incorrecto u omisión +50 s.',
  width: 23,
  controlPoints,
  obstacles: [],
  gates: Array.from({ length: gateCount }, (_, i) => ({
    t: firstGateT + i * gateSpacingT,
    offset: i % 2 === 0 ? 5.5 : -5.5,
    passSide: i % 2 === 0 ? 1 : -1,
  })),
};
