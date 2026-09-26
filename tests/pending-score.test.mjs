import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPendingScore, loadPendingScore, savePendingScore } from '../src/pending-score.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const score = {
  trackKey: 'verde', track: 'Verde', name: 'Powder', timeSec: 42.5, speedKmh: 91,
};

test('a guest result survives the Google redirect for up to 24 hours', () => {
  const storage = memoryStorage();
  savePendingScore(storage, score, 1_000);
  assert.deepEqual(loadPendingScore(storage, 2_000), { ...score, savedAt: 1_000 });
  assert.equal(loadPendingScore(storage, 1_000 + 24 * 60 * 60 * 1000 + 1), null);
});

test('publishing clears the pending guest result', () => {
  const storage = memoryStorage();
  savePendingScore(storage, score, 1_000);
  clearPendingScore(storage);
  assert.equal(loadPendingScore(storage, 2_000), null);
});

test('invalid pending results are discarded', () => {
  const storage = memoryStorage();
  savePendingScore(storage, { ...score, name: 'A' }, 1_000);
  assert.equal(loadPendingScore(storage, 2_000), null);
});
