import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/track.js';
import { verde } from '../src/tracks/verde.js';

test('buildTrack computes a plausible length', () => {
  const track = buildTrack(verde);
  assert.ok(track.length > 500 && track.length < 1200, `length=${track.length}`);
});

test('toWorld at s=0 lat=0 is near the first control point', () => {
  const track = buildTrack(verde);
  const p = track.toWorld(0, 0);
  const [x, y, z] = verde.controlPoints[0];
  assert.ok(p.distanceTo({ x, y, z }) < 1);
});

test('the track descends and side vectors are horizontal', () => {
  const track = buildTrack(verde);
  const a = track.frameAt(0);
  const b = track.frameAt(track.length);
  assert.ok(b.pos.y < a.pos.y - 50);
  assert.ok(Math.abs(track.frameAt(200).side.y) < 0.01);
});

test('obstacles are resolved to track coordinates', () => {
  const track = buildTrack(verde);
  assert.ok(track.obstacles.length >= 5);
  for (const o of track.obstacles) {
    assert.ok(o.s >= 0 && o.s <= track.length);
    assert.equal(o.lat, o.offset);
  }
});

test('curvature is finite everywhere and nonzero somewhere', () => {
  const track = buildTrack(verde);
  let maxC = 0;
  for (let s = 0; s < track.length; s += 10) {
    const c = track.frameAt(s).curvature;
    assert.ok(Number.isFinite(c));
    maxC = Math.max(maxC, Math.abs(c));
  }
  assert.ok(maxC > 0.001);
});
