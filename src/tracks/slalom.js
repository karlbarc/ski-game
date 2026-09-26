import { CatmullRomCurve3, Vector3 } from 'three';

const firstGateT = 0.12;
const targetLength = 552.3738418056782 * 1.5;
// Fracción de recorrido y pendiente: hombros suaves y dos palas sostenidas.
const slopeProfile = [
  [0, 25], [0.12, 25], [0.18, 8], [0.28, 8],
  [0.35, 30], [0.46, 30], [0.54, 10], [0.64, 10],
  [0.72, 32], [0.83, 32], [0.91, 12], [1, 12],
];
function slopeAt(t) {
  const end = slopeProfile.findIndex(([u]) => u >= t);
  if (end <= 0) return slopeProfile[0][1] * Math.PI / 180;
  const [a, startAngle] = slopeProfile[end - 1];
  const [b, endAngle] = slopeProfile[end];
  const u = (t - a) / (b - a);
  const blend = u * u * (3 - 2 * u);
  return (startAngle + (endAngle - startAngle) * blend) * Math.PI / 180;
}
const horizontalCurve = new CatmullRomCurve3([
  [0, 0, 0], [0, 0, -70], [5, 0, -145], [12, 0, -220],
  [5, 0, -295], [-5, 0, -370], [0, 0, -445], [0, 0, -515],
].map((p) => new Vector3(...p)), false, 'centripetal');
const horizontalLength = horizontalCurve.getLength();
// Integra por distancia real para que los cambios de pendiente no alteren
// el aumento de longitud ni la posición relativa de las puertas.
const samples = 512;
const profile = [{ distance: 0, height: 0 }];
for (let i = 1; i <= samples; i++) {
  const angle = slopeAt((i - 0.5) / samples);
  const previous = profile.at(-1);
  profile.push({
    distance: previous.distance + targetLength / samples * Math.cos(angle),
    height: previous.height - targetLength / samples * Math.sin(angle),
  });
}
const horizontalScale = profile.at(-1).distance / horizontalLength;
const controlPoints = profile.map(({ distance, height }) => {
  const p = horizontalCurve.getPointAt(distance / profile.at(-1).distance);
  p.multiplyScalar(horizontalScale);
  return [p.x, height, p.z];
});

export const slalom = {
  name: 'Intermedia',
  recordName: 'Slalom Inicial',
  emoji: '🚩',
  category: 'slalom',
  difficultyLevel: 2,
  difficulty: 'Intermedia',
  accent: '#ed7054',
  description: 'Rodea los 12 banderines por fuera, siguiendo las flechas. Tiempo + penalizaciones: toque +2 s; paso incorrecto u omisión +50 s.',
  width: 20,
  // Salida de 25° y terreno variable entre 8° y 32° tras la primera bandera.
  controlPoints,
  obstacles: [],
  gates: Array.from({ length: 12 }, (_, i) => ({
    t: firstGateT + i * 0.067,
    offset: i % 2 === 0 ? 4 : -4,
    passSide: i % 2 === 0 ? 1 : -1,
  })),
};
