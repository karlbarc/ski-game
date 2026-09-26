import { slalom } from './slalom.js';

export const slalomAvanzado = {
  name: 'Avanzada',
  recordName: 'Slalom Avanzado',
  emoji: '🔴',
  category: 'slalom',
  difficultyLevel: 3,
  difficulty: 'Difícil',
  accent: '#d94b63',
  description: '18 banderines más juntos, mayor pendiente y cambios de dirección amplios. Anticipa cada giro; toque +2 s, paso incorrecto u omisión +50 s.',
  width: 22,
  controlPoints: slalom.controlPoints.map(([x, y, z]) => [x * 1.3, y * 1.15, z * 1.05]),
  obstacles: [],
  gates: Array.from({ length: 18 }, (_, i) => ({
    t: 0.10 + i * 0.047,
    offset: i % 2 === 0 ? 5 : -5,
    passSide: i % 2 === 0 ? 1 : -1,
  })),
};
