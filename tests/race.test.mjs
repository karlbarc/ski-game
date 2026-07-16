import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, updateRace, formatTime, loadBest, saveBest } from '../src/race.js';

test('race starts when crossing the start line and finishes at the finish line', () => {
  let r = createRace(15, 700);
  r = updateRace(r, 0, 1000);
  assert.equal(r.status, 'ready');
  r = updateRace(r, 16, 2000);
  assert.equal(r.status, 'running');
  r = updateRace(r, 100, 7000);
  assert.equal(r.elapsed, 5);
  r = updateRace(r, 701, 62000);
  assert.equal(r.status, 'finished');
  assert.equal(r.elapsed, 60);
});

test('formatTime renders mm:ss.cc', () => {
  assert.equal(formatTime(65.239), '01:05.23');
  assert.equal(formatTime(0), '00:00.00');
});

test('saveBest only overwrites with better times', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadBest(storage, 'Verde'), null);
  assert.equal(saveBest(storage, 'Verde', 70), true);
  assert.equal(saveBest(storage, 'Verde', 80), false);
  assert.equal(loadBest(storage, 'Verde'), 70);
  assert.equal(saveBest(storage, 'Verde', 60), true);
  assert.equal(loadBest(storage, 'Verde'), 60);
});
