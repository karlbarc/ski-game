import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORE_RANGES_CS, validateScore } from '../supabase/functions/submit-score/score-validation.js';

test('every public track has an explicit accepted time range', () => {
  assert.deepEqual(Object.keys(SCORE_RANGES_CS).sort(), [
    'Alpina', 'Azul', 'Negra', 'Roja', 'Slalom Avanzado', 'Slalom Escuela',
    'Slalom Experto', 'Slalom Inicial', 'Verde',
  ].sort());
});

test('valid scores are normalized for database storage', () => {
  assert.deepEqual(validateScore({ track: 'Verde', name: '  Snow  ', timeSec: 30.041, speedKmh: 108.6 }), {
    track: 'Verde', name: 'Snow', time_cs: 3004, speed_kmh: 109,
  });
});

test('unknown tracks and implausible values are rejected', () => {
  assert.throws(() => validateScore({ track: 'Inventada', name: 'Snow', timeSec: 60, speedKmh: 80 }), /Pista/);
  assert.throws(() => validateScore({ track: 'Verde', name: 'Snow', timeSec: 24.99, speedKmh: 80 }), /tiempo/);
  assert.throws(() => validateScore({ track: 'Verde', name: 'Snow', timeSec: 60, speedKmh: 201 }), /velocidad/);
  assert.throws(() => validateScore({ track: 'Verde', name: '', timeSec: 60, speedKmh: 80 }), /nombre/);
  assert.throws(() => validateScore({ track: 'Verde', name: '123456789012345678901', timeSec: 60, speedKmh: 80 }), /20 caracteres/);
});

test('user names may contain up to 20 characters', () => {
  const name = '12345678901234567890';
  assert.equal(validateScore({ track: 'Verde', name, timeSec: 60, speedKmh: 80 }).name, name);
});
