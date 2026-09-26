export const SCORE_RANGES_CS = Object.freeze({
  Verde: [2500, 180000],
  Azul: [2600, 180000],
  Roja: [2500, 180000],
  Negra: [2200, 180000],
  Alpina: [3500, 180000],
  'Slalom Escuela': [2500, 180000],
  'Slalom Inicial': [2500, 180000],
  'Slalom Avanzado': [3500, 180000],
  'Slalom Experto': [4000, 180000],
});

export function validateScore(input) {
  if (!input || typeof input !== 'object') throw new Error('Solicitud inválida.');
  const track = typeof input.track === 'string' ? input.track : '';
  const range = SCORE_RANGES_CS[track];
  if (!range) throw new Error('Pista no permitida.');

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 20) throw new Error('El nombre debe tener entre 2 y 20 caracteres.');

  const timeCs = Math.round(Number(input.timeSec) * 100);
  if (!Number.isFinite(timeCs) || timeCs < range[0] || timeCs > range[1]) {
    throw new Error(`El tiempo no es válido para ${track}.`);
  }

  const speedKmh = Math.round(Number(input.speedKmh));
  if (!Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > 200) {
    throw new Error('La velocidad no es válida.');
  }
  return { track, name, time_cs: timeCs, speed_kmh: speedKmh };
}
