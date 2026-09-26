import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlalom, stepSlalom, slalomResult, slalomNotice, slalomPoleOffsets } from '../src/slalom.js';
import { slalom } from '../src/tracks/slalom.js';
import { buildTrack } from '../src/track.js';

const position = (s, lat, height = 0) => ({ s, lat, height });
const initial = () => createSlalom([{ s: 20, lat: 2.5, passSide: 1 }]);

test('both poles trigger contact on either side, with one penalty per flag', () => {
  for (const passSide of [-1, 1]) {
    const gate = { s: 20, lat: passSide * 4, passSide };
    for (const lat of slalomPoleOffsets(gate)) {
      const before = createSlalom([gate]);
      const after = stepSlalom(before, position(18, lat), position(19.5, lat), 20);
      assert.equal(after.gates[0].touched, true);
      assert.equal(slalomResult(after).penalty, 2);
      assert.match(slalomNotice(before, after).text, /¡Tocaste la bandera!/);
    }
    const [outer, inner] = slalomPoleOffsets(gate);
    let state = stepSlalom(createSlalom([gate]), position(19.5, outer), position(19.5, inner), 20);
    assert.equal(slalomResult(state).penalty, 2);
    state = stepSlalom(state, position(19.5, inner), position(21, inner), 20);
    assert.equal(slalomResult(state).penalty, 50, 'passing inside the panel is still incorrect');
  }
});

test('contact warns once, including a simultaneous incorrect crossing', () => {
  for (const lat of [2.8, 2.3]) {
    const before = initial();
    const after = stepSlalom(before, position(18, lat), position(22, lat), 20);
    const notice = slalomNotice(before, after);
    assert.match(notice.text, /¡Tocaste la bandera!/);
    assert.match(notice.text, lat === 2.8 ? /\+2 s/ : /50 s/);
    assert.equal(notice.duration, 2500);
    assert.equal(slalomNotice(after, stepSlalom(after, position(22, lat), position(23, lat), 20)), null);
  }
});

test('slalom is 50% longer with a 25-degree start and sustained gentle and steep sections', () => {
  const track = buildTrack(slalom);
  assert.ok(Math.abs(track.length - 552.3738418056782 * 1.5) < 0.5);
  const first = track.gates[0].s;
  let gentle = 0;
  let steep = 0;
  for (let s = 3; s < track.length - 3; s += 2) {
    const { tan } = track.frameAt(s);
    const angle = Math.atan2(-tan.y, Math.hypot(tan.x, tan.z)) * 180 / Math.PI;
    assert.ok(angle > 7.8 && angle < 32.2, `${angle}° at ${s} m`);
    if (s < first - 3) assert.ok(Math.abs(angle - 25) < 0.15);
    if (angle < 13) gentle += 2;
    if (angle > 28) steep += 2;
  }
  assert.ok(gentle > 240);
  assert.ok(steep > 180);
});

test('exterior passes on both sides are valid; central line misses every gate', () => {
  const track = buildTrack(slalom);
  assert.equal(track.gates.length, 12);
  let state = createSlalom(track.gates);
  for (const g of track.gates) {
    assert.ok(g.s > 15 && g.s < track.length - 15);
    const lat = g.lat + g.passSide * 1.5;
    state = stepSlalom(state, position(g.s - 3, lat), position(g.s + 3, lat), track.width);
  }
  assert.deepEqual(slalomResult(state, 40), { missed: 0, touches: 0, penalty: 0, total: 40, completed: 12 });
  const skipped = stepSlalom(createSlalom(track.gates), position(15, 0), position(track.length - 15, 0), track.width, true);
  assert.equal(slalomResult(skipped, 40).total, 640);
});

test('swept contact counts once, including when both frame endpoints miss the pole', () => {
  let state = stepSlalom(initial(), position(18, 2.8), position(22, 2.8), 20);
  assert.equal(slalomResult(state, 30).total, 32);
  state = stepSlalom(state, position(22, 2.8), position(24, 2.8), 20);
  assert.equal(slalomResult(state).penalty, 2);
});

test('lateral crossing is interpolated at the gate, not at the frame endpoint', () => {
  const state = stepSlalom(initial(), position(19, 0), position(23, 4), 20);
  assert.equal(slalomResult(state).penalty, 50);
});

test('incorrect pass overrides a touch and cannot be repaired or penalized repeatedly', () => {
  let state = stepSlalom(initial(), position(19, 2.3), position(21, 2.3), 20);
  assert.equal(slalomResult(state).penalty, 50);
  state = stepSlalom(state, position(21, 4), position(19, 4), 20);
  state = stepSlalom(state, position(19, 4), position(21, 4), 20);
  assert.equal(slalomResult(state).penalty, 50);
});

test('reverse direction, airborne shortcut, out of bounds and omissions cost 50 seconds', () => {
  for (const [a, b] of [
    [position(21, 4), position(19, 4)],
    [position(19, 4, 3), position(21, 4, 3)],
    [position(19, 12), position(21, 12)],
    [position(21, 0), position(22, 0)],
  ]) assert.equal(slalomResult(stepSlalom(initial(), a, b, 20)).penalty, 50);
  assert.equal(slalomResult(stepSlalom(initial(), position(0, 0), position(1, 0), 20, true)).penalty, 50);
});

test('restart clears penalties and courses without gates preserve elapsed time', () => {
  assert.equal(slalomResult(initial()).penalty, 0);
  assert.equal(slalomResult(createSlalom(), 32.5).total, 32.5);
});
