import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/track.js';
import { slalom } from '../src/tracks/slalom.js';
import { slalomEscuela } from '../src/tracks/slalom-escuela.js';
import { slalomAvanzado } from '../src/tracks/slalom-avanzado.js';
import { slalomExperto } from '../src/tracks/slalom-experto.js';
import { createSlalom, stepSlalom, slalomResult } from '../src/slalom.js';

test('slalom variants progress in slope, gate spacing and lateral demand', () => {
  const tracks = [slalomEscuela, slalom, slalomAvanzado, slalomExperto].map(buildTrack);
  const spacing = t => (t.gates.at(-1).s - t.gates[0].s) / (t.gates.length - 1);
  const slope = t => -t.frameAt(20).tan.y;
  const slopeRange = t => {
    const values = [];
    for (let s = 10; s < t.length - 10; s += 5) values.push(-t.frameAt(s).tan.y);
    return Math.max(...values) - Math.min(...values);
  };
  assert.deepEqual(tracks.map(t => t.data.name), ['Inicial', 'Intermedia', 'Avanzada', 'Experto']);
  assert.deepEqual(tracks.map(t => t.gates.length), [10, 12, 18, 24]);
  assert.ok(slope(tracks[0]) < slope(tracks[1]));
  assert.ok(slope(tracks[1]) < slope(tracks[2]));
  assert.ok(slope(tracks[2]) < slope(tracks[3]));
  assert.ok(spacing(tracks[0]) > spacing(tracks[1]));
  assert.ok(spacing(tracks[1]) > spacing(tracks[2]));
  assert.ok(spacing(tracks[2]) > spacing(tracks[3]));
  assert.ok(Math.abs(spacing(tracks[3]) - 38) < 0.01, `expert spacing=${spacing(tracks[3])}`);
  assert.ok(slopeRange(tracks[3]) > slopeRange(tracks[2]), 'expert has stronger slope changes');
  for (const t of tracks) {
    let state = createSlalom(t.gates);
    for (const [i, gate] of t.gates.entries()) {
      assert.ok(gate.s > 15 && gate.s < t.length - 15);
      if (i) assert.equal(gate.passSide, -t.gates[i - 1].passSide);
      const lat = gate.lat + gate.passSide * 1.5;
      assert.ok(Math.abs(lat) < t.width / 2 - 1);
      state = stepSlalom(state, { s: gate.s - 3, lat, height: 0 },
        { s: gate.s + 3, lat, height: 0 }, t.width);
    }
    assert.equal(slalomResult(state).penalty, 0);
  }
});
