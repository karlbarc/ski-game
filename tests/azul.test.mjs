import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/track.js';
import { verde } from '../src/tracks/verde.js';
import { azul } from '../src/tracks/azul.js';

test('azul has a plausible length', () => {
  const track = buildTrack(azul);
  assert.ok(track.length > 600 && track.length < 1200, `length=${track.length}`);
});

test('azul is narrower and has more obstacles than verde (media difficulty)', () => {
  assert.ok(azul.width < verde.width, 'narrower piste');
  assert.ok(azul.obstacles.length > verde.obstacles.length, 'more obstacles');
});

test('azul turns sharper than verde', () => {
  const a = buildTrack(azul);
  const v = buildTrack(verde);
  const maxCurv = (t) => {
    let m = 0;
    for (let s = 10; s < t.length - 10; s += 5) m = Math.max(m, Math.abs(t.frameAt(s).curvature));
    return m;
  };
  assert.ok(maxCurv(a) > maxCurv(v), `azul ${maxCurv(a)} vs verde ${maxCurv(v)}`);
});

test('azul keeps enough slope everywhere to avoid crawl stalls', () => {
  const track = buildTrack(azul);
  for (let s = 5; s < track.length - 5; s += 5) {
    const slope = -track.frameAt(s).tan.y;
    assert.ok(slope > 0.08, `slope=${slope.toFixed(3)} too flat at s=${s.toFixed(0)}`);
  }
});

test('azul obstacles sit inside the piste', () => {
  const track = buildTrack(azul);
  for (const o of track.obstacles) {
    assert.ok(o.s > 20 && o.s < track.length - 20, `obstacle at s=${o.s} too close to gates`);
    assert.ok(Math.abs(o.lat) <= azul.width / 2 - 1, `obstacle at lat=${o.lat} outside piste`);
  }
});
