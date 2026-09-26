import { verde } from './tracks/verde.js';
import { azul } from './tracks/azul.js';
import { roja } from './tracks/roja.js';
import { negra } from './tracks/negra.js';
import { alpina } from './tracks/alpina.js';
import { slalom } from './tracks/slalom.js';
import { slalomEscuela } from './tracks/slalom-escuela.js';
import { slalomAvanzado } from './tracks/slalom-avanzado.js';
import { slalomExperto } from './tracks/slalom-experto.js';
import { loadBest } from './race.js';

export const TRACKS = {
  verde, azul, roja, negra, alpina, slalomEscuela, slalom, slalomAvanzado, slalomExperto,
};
export const CATEGORIES = [
  { id: 'obstaculos', name: 'Obstáculos', emoji: '🏁', description: 'Esquiva obstáculos, supera saltos y mejora tu tiempo.' },
  { id: 'slalom', name: 'Slalom', emoji: '🚩', description: 'Rodea los banderines por fuera. Gana el menor tiempo con penalizaciones.' },
  { id: 'recreativas', name: 'Recreativas', emoji: '🏔️', description: 'Disfruta de la montaña y sus paisajes.' },
];

// La progresión es independiente por categoría y sigue siempre la dificultad.
export function categoryTracks(category, tracks = TRACKS) {
  return Object.entries(tracks)
    .filter(([, data]) => data.category === category)
    .sort(([keyA, a], [keyB, b]) => a.difficultyLevel - b.difficultyLevel || keyA.localeCompare(keyB));
}

// El nombre del récord permanece estable aunque cambie el título visible.
export function trackRecordName(track) {
  return track.recordName || track.name;
}

export function trackProgress(storage, key, tracks = TRACKS) {
  const data = tracks[key];
  if (!data) return { unlocked: false, completed: false, previous: null };
  const ordered = categoryTracks(data.category, tracks);
  const index = ordered.findIndex(([id]) => id === key);
  const previous = index > 0 ? ordered[index - 1][1] : null;
  const completed = (track) => {
    const best = loadBest(storage, trackRecordName(track));
    return best != null && best > 0;
  };
  return {
    unlocked: previous === null || completed(data) || completed(previous),
    completed: completed(data),
    previous,
  };
}
