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

import { createControls } from '../src/controls.js';

test('name editing and menu scrolling do not steer or cancel native input', () => {
  const handlers = {};
  const controls = createControls({ addEventListener(type, fn) { handlers[type] = fn; } });
  const input = { closest: () => ({}) };
  handlers.keydown({ key: 'ArrowLeft', target: input });
  assert.equal(controls.steer(), 0);
  let prevented = false;
  handlers.touchmove({ target: input, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  handlers.keydown({ key: 'ArrowLeft' });
  assert.equal(controls.steer(), 1);
  handlers.blur();
  assert.equal(controls.steer(), 0);
});
