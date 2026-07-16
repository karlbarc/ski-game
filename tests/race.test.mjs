import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRace, updateRace, pauseRace, resumeRace, formatTime,
  loadBest, saveBest, loadBestSpeed, saveBestSpeed,
} from '../src/race.js';

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

test('paused time does not count toward elapsed', () => {
  let r = createRace(15, 700);
  r = updateRace(r, 16, 1000);   // cruza la salida, startTime = 1000
  r = updateRace(r, 100, 6000);  // elapsed = 5
  r = pauseRace(r, 6000);
  r = resumeRace(r, 16000);      // 10 s en pausa
  r = updateRace(r, 200, 21000);
  assert.equal(r.elapsed, 10);   // 5 antes de la pausa + 5 después
  assert.equal(r.status, 'running');
});

test('pause before the start line and resume without pause are no-ops', () => {
  const ready = createRace(15, 700);
  assert.deepEqual(pauseRace(ready, 500), ready);
  assert.deepEqual(resumeRace(ready, 600), ready);
  let r = updateRace(ready, 16, 1000);
  const paused = pauseRace(r, 2000);
  assert.deepEqual(pauseRace(paused, 3000), paused); // doble pausa no re-desplaza
});

test('saveBestSpeed only overwrites with higher speeds', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadBestSpeed(storage, 'Verde'), null);
  assert.equal(saveBestSpeed(storage, 'Verde', 90), true);
  assert.equal(saveBestSpeed(storage, 'Verde', 80), false);
  assert.equal(loadBestSpeed(storage, 'Verde'), 90);
  assert.equal(saveBestSpeed(storage, 'Verde', 110), true);
  assert.equal(loadBestSpeed(storage, 'Verde'), 110);
});

test('loadBest treats corrupted stored values as absent', () => {
  const mem = new Map([['ski-best-Verde', 'garbage']]);
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadBest(storage, 'Verde'), null);
  assert.equal(saveBest(storage, 'Verde', 60), true);
  assert.equal(loadBest(storage, 'Verde'), 60);
});
