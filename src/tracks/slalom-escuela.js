import { slalom } from './slalom.js';

export const slalomEscuela = {
  name: 'Inicial',
  recordName: 'Slalom Escuela',
  emoji: '🟢',
  category: 'slalom',
  difficultyLevel: 1,
  difficulty: 'Fácil',
  accent: '#50b98b',
  description: '10 banderines, pendiente moderada y giros suaves para aprender. Rodea cada bandera por fuera; toque +2 s, paso incorrecto u omisión +50 s.',
  width: 22,
  // Misma familia de relieve, con pendientes reducidas y curvas más suaves.
  controlPoints: slalom.controlPoints.map(([x, y, z]) => [x * 0.65, y * 0.65, z * 0.95]),
  obstacles: [],
  gates: Array.from({ length: 10 }, (_, i) => ({
    t: 0.12 + i * 0.082,
    offset: i % 2 === 0 ? 3 : -3,
    passSide: i % 2 === 0 ? 1 : -1,
  })),
};
