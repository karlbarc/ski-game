import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartSequence, stepStartSequence, presentStartSequence, stepPresentedStartSequence } from '../src/start.js';

test('start holds for 3, 2, 1 and releases only on the final signal', () => {
  let state = createStartSequence();
  assert.equal(state.cue, 3);
  for (const cue of [2, 1, 0]) {
    state = stepStartSequence(state, 1);
    assert.equal(state.cue, cue);
    assert.equal(state.released, cue === 0);
  }
  assert.equal(state.visible, true);
  assert.equal(stepStartSequence(state, 1).visible, false);
});

test('pausing preserves the countdown and restart restores a closed start', () => {
  const state = stepStartSequence(createStartSequence(), 1.4);
  assert.equal(stepStartSequence(state, 20, true), state);
  assert.equal(stepStartSequence(state, 0.6).cue, 1);
  assert.equal(createStartSequence().released, false);
});

test('a delayed frame releases the start without leaving it stuck', () => {
  const state = stepStartSequence(createStartSequence(), 4);
  assert.equal(state.released, true);
  assert.equal(state.visible, false);
});


test('a slow first render does not consume the visible 3', () => {
  let state = createStartSequence();
  state = stepPresentedStartSequence(state, 1000);
  assert.equal(state.cue, 3);
  // La primera imagen tarda 2,5 segundos en prepararse.
  state = presentStartSequence(state, 3500);
  state = stepPresentedStartSequence(state, 3516);
  assert.equal(state.cue, 3);
  state = stepPresentedStartSequence(state, 4499);
  assert.equal(state.cue, 3);
  state = stepPresentedStartSequence(state, 4500);
  assert.equal(state.cue, 2);
  state = stepPresentedStartSequence(state, 5500);
  assert.equal(state.cue, 1);
  state = stepPresentedStartSequence(state, 6500);
  assert.equal(state.released, true);
});

test('new tracks and retries get identical durations after rendering', () => {
  for (const renderedAt of [16, 2500]) {
    let state = presentStartSequence(createStartSequence(), renderedAt);
    state = stepPresentedStartSequence(state, renderedAt - 2);
    assert.equal(state.elapsed, 0, 'an older animation-frame timestamp cannot rewind the clock');
    state = stepPresentedStartSequence(state, renderedAt + 999);
    assert.equal(state.cue, 3);
    state = stepPresentedStartSequence(state, renderedAt + 1000);
    assert.equal(state.cue, 2);
  }
});
