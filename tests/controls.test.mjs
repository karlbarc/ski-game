import test from 'node:test';
import assert from 'node:assert/strict';
import { combineSteer } from '../src/controls.js';

test('combineSteer picks the strongest input and clamps to [-1, 1]', () => {
  assert.equal(combineSteer(0, 0), 0);
  assert.equal(combineSteer(1, -0.3), 1);
  assert.equal(combineSteer(-0.5, 0.2), -0.5);
  assert.equal(combineSteer(2, 0), 1);
  assert.equal(combineSteer(-3, 0.1), -1);
});
