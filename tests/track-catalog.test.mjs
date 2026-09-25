import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, CATEGORIES, categoryTracks, trackProgress } from '../src/track-catalog.js';
import { saveBest } from '../src/race.js';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('the five tracks belong to two categories and sort by numeric difficulty', () => {
  assert.equal(Object.keys(TRACKS).length, 5);
  assert.equal(CATEGORIES.length, 2);
  const shuffled = { negra: TRACKS.negra, roja: TRACKS.roja, alpina: TRACKS.alpina, azul: TRACKS.azul, verde: TRACKS.verde };
  assert.deepEqual(categoryTracks('obstaculos', shuffled).map(([key]) => key), ['verde', 'azul', 'roja', 'negra']);
  assert.deepEqual(categoryTracks('recreativas', shuffled).map(([key]) => key), ['alpina']);
  assert.deepEqual(categoryTracks('slalom'), []);
  for (const track of Object.values(TRACKS)) assert.ok(Number.isFinite(track.difficultyLevel));
});

test('only the first track of each category starts unlocked', () => {
  const saved = storage();
  assert.equal(trackProgress(saved, 'verde').unlocked, true);
  assert.equal(trackProgress(saved, 'alpina').unlocked, true);
  assert.equal(trackProgress(saved, 'azul').unlocked, false);
  assert.equal(trackProgress(saved, 'negra').unlocked, false);
  assert.equal(trackProgress(saved, 'missing').unlocked, false);
});

test('finishing unlocks the next race, preserving existing saved completions', () => {
  const saved = storage();
  saveBest(saved, 'Alpina', 90);
  assert.equal(trackProgress(saved, 'azul').unlocked, false);
  saveBest(saved, 'Verde', 60);
  assert.equal(trackProgress(saved, 'verde').completed, true);
  assert.equal(trackProgress(saved, 'azul').unlocked, true);
  assert.equal(trackProgress(saved, 'negra').unlocked, false);
  saveBest(saved, 'Azul', 70);
  assert.equal(trackProgress(saved, 'roja').unlocked, true);
  assert.equal(trackProgress(saved, 'negra').unlocked, false);
  saveBest(saved, 'Roja', 75);
  assert.equal(trackProgress(saved, 'negra').unlocked, true);
  assert.equal(trackProgress(saved, 'negra').previous.name, 'Roja');
});

test('invalid or unfinished times do not unlock the next track', () => {
  const saved = storage();
  for (const value of ['NaN', 'Infinity', '0', '-3']) {
    saved.setItem('ski-best-Verde', value);
    assert.equal(trackProgress(saved, 'azul').unlocked, false);
  }
});
