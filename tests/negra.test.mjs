import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/track.js';
import { azul } from '../src/tracks/azul.js';
import { negra } from '../src/tracks/negra.js';

test('negra has a plausible length', () => {
  const track = buildTrack(negra);
  assert.ok(track.length > 600 && track.length < 1200, `length=${track.length}`);
});

test('negra is narrower, denser and steeper than azul', () => {
  assert.ok(negra.width < azul.width, 'narrower piste');
  assert.ok(negra.obstacles.length > azul.obstacles.length, 'more obstacles');
  const drop = (data, track) => (data.controlPoints[0][1] - data.controlPoints.at(-1)[1]) / track.length;
  assert.ok(drop(negra, buildTrack(negra)) > drop(azul, buildTrack(azul)), 'steeper average slope');
});

test('negra keeps enough slope everywhere to avoid crawl stalls', () => {
  const track = buildTrack(negra);
  for (let s = 5; s < track.length - 5; s += 5) {
    const slope = -track.frameAt(s).tan.y;
    assert.ok(slope > 0.08, `slope=${slope.toFixed(3)} too flat at s=${s.toFixed(0)}`);
  }
});

test('negra obstacles sit inside the piste', () => {
  const track = buildTrack(negra);
  for (const o of track.obstacles) {
    assert.ok(o.s > 20 && o.s < track.length - 20, `obstacle at s=${o.s.toFixed(0)} too close to gates`);
    assert.ok(Math.abs(o.lat) <= negra.width / 2 - 1, `obstacle at lat=${o.lat} outside piste`);
  }
});

test('negra curves stay physically followable at speed', () => {
  // El giro necesario para seguir la curva a 20 m/s no debe exceder el steer máximo.
  const track = buildTrack(negra);
  for (let s = 10; s < track.length - 10; s += 5) {
    const c = Math.abs(track.frameAt(s).curvature);
    assert.ok(c * 20 <= 1.0, `curvature ${c.toFixed(4)} at s=${s.toFixed(0)} unfollowable at 20 m/s`);
  }
});
