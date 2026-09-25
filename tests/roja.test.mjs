import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/track.js';
import { azul } from '../src/tracks/azul.js';
import { roja } from '../src/tracks/roja.js';
import { negra } from '../src/tracks/negra.js';

const track = buildTrack(roja);

test('roja falls between azul and negra in width, slope and obstacle density', () => {
  const tracks = [azul, roja, negra].map(buildTrack);
  const slope = (t) => -t.data.controlPoints.at(-1)[1] / t.length;
  const density = (t) => t.obstacles.filter((o) => o.type !== 'jump').length / t.length;
  assert.ok(azul.width > roja.width && roja.width > negra.width);
  assert.ok(slope(tracks[0]) < slope(track) && slope(track) < slope(tracks[2]));
  assert.ok(density(tracks[0]) < density(track) && density(track) < density(tracks[2]));
  assert.ok(azul.difficultyLevel < roja.difficultyLevel && roja.difficultyLevel < negra.difficultyLevel);
  assert.ok(track.length > 750 && track.length < 950);
});

test('roja has continuous downhill and followable curves', () => {
  for (let s = 5; s < track.length - 5; s += 2) {
    const frame = track.frameAt(s);
    assert.ok(-frame.tan.y > 0.08, `too flat at ${s}`);
    assert.ok(Math.abs(frame.curvature) * 20 <= 1, `too sharp at ${s}`);
  }
});

test('roja places obstacles within the piste and gives all three jumps clear landings', () => {
  const jumps = track.obstacles.filter((o) => o.type === 'jump');
  assert.equal(jumps.length, 3);
  for (const o of track.obstacles) {
    assert.ok(o.s > 20 && o.s < track.length - 20);
    assert.ok(Math.abs(o.lat) <= roja.width / 2 - 1);
  }
  for (const jump of jumps) {
    assert.ok(!track.obstacles.some((o) => o.type !== 'jump' && o.s > jump.s && o.s - jump.s < 30));
  }
});
