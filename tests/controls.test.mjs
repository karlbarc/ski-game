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

test('Shift plus either arrow brakes in that direction, in either key order', () => {
  for (const arrow of ['ArrowLeft', 'ArrowRight']) {
    for (const shiftFirst of [true, false]) {
      const handlers = {};
      const controls = createControls({ addEventListener(type, fn) { handlers[type] = fn; } });
      const shift = { key: 'Shift', code: 'ShiftLeft' };
      const direction = { key: arrow };
      handlers.keydown(shiftFirst ? shift : direction);
      assert.equal(controls.brake(), 0);
      handlers.keydown(shiftFirst ? direction : shift);
      assert.equal(controls.brake(), 1);
      assert.equal(controls.steer(), arrow === 'ArrowLeft' ? 1 : -1);
      handlers.keyup(shift);
      assert.equal(controls.brake(), 0);
      assert.notEqual(controls.steer(), 0);
      handlers.keydown(shift);
      handlers.keyup(direction);
      assert.equal(controls.brake(), 0);
      handlers.keydown(direction);
      handlers.keydown({ key: 'Shift', code: 'ShiftRight' });
      handlers.keyup(shift);
      assert.equal(controls.brake(), 1, 'the other Shift key is still held');
      handlers.blur();
      assert.equal(controls.brake(), 0);
      assert.equal(controls.steer(), 0);
      const input = { closest: () => ({}) };
      handlers.keydown({ ...shift, target: input });
      handlers.keydown({ ...direction, target: input });
      assert.equal(controls.brake(), 0);
    }
  }
});

test('downward drag brakes progressively on either side and releases cleanly', async () => {
  const previousWidth = globalThis.innerWidth;
  globalThis.innerWidth = 400;
  try {
    for (const x of [80, 320]) {
      const handlers = {};
      const controls = createControls({ addEventListener(type, fn) { handlers[type] = fn; } });
      const finger = (id, y) => ({ identifier: id, clientX: x, clientY: y });
      const emit = (type, touches) => handlers[type]({ touches, preventDefault() {} });
      emit('touchstart', [finger(1, 100)]);
      emit('touchmove', [finger(1, 110)]);
      assert.equal(controls.brake(), 0);
      emit('touchmove', [finger(1, 158)]);
      assert.equal(controls.brake(), 0.5);
      emit('touchmove', [finger(1, 230)]);
      assert.equal(controls.brake(), 1);
      assert.equal(controls.steer(), x < 200 ? 1 : -1);
      emit('touchstart', [finger(1, 230), finger(2, 400)]);
      assert.equal(controls.brake(), 1, 'second finger must not reset the gesture');
      emit('touchend', [finger(2, 400)]);
      assert.equal(controls.brake(), 0, 'replacement finger starts a fresh gesture');
      emit('touchmove', [finger(2, 500)]);
      handlers.touchcancel();
      assert.equal(controls.brake(), 0);
      assert.equal(controls.steer(), 0);
      await controls.setMode('gyro');
      emit('touchstart', [finger(3, 100)]);
      emit('touchmove', [finger(3, 200)]);
      assert.equal(controls.brake(), 1);
      assert.equal(controls.steer(), x < 200 ? 1 : -1);
      emit('touchmove', [finger(3, 80)]);
      assert.equal(controls.brake(), 0, 'upward motion releases the brake');
      emit('touchmove', [finger(3, 200)]);
      emit('touchend', []);
      assert.equal(controls.brake(), 0);
      emit('touchstart', [finger(4, 100)]);
      emit('touchmove', [finger(4, 200)]);
      handlers.blur();
      assert.equal(controls.brake(), 0);
    }
  } finally {
    if (previousWidth === undefined) delete globalThis.innerWidth;
    else globalThis.innerWidth = previousWidth;
  }
});

test('horizontal swipe steers by distance and a fast movement brakes', async () => {
  const previousWidth = globalThis.innerWidth;
  globalThis.innerWidth = 400;
  try {
    const handlers = {};
    const controls = createControls({ addEventListener(type, fn) { handlers[type] = fn; } });
    await controls.setMode('swipe');
    const finger = (x) => ({ identifier: 1, clientX: x, clientY: 200 });
    const emit = (type, x, timeStamp) => handlers[type]({
      touches: x == null ? [] : [finger(x)], timeStamp, preventDefault() {},
    });

    emit('touchstart', 200, 0);
    emit('touchmove', 245, 100);
    assert.equal(controls.steer(), -0.5);
    assert.equal(controls.brake(), 0, 'a measured slide only steers');
    emit('touchmove', 155, 140);
    assert.equal(controls.steer(), 0.5);
    assert.equal(controls.brake(), 1, 'a very fast slide fully brakes');
    emit('touchend', null, 150);
    assert.equal(controls.steer(), 0);
    assert.equal(controls.brake(), 0);
  } finally {
    if (previousWidth === undefined) delete globalThis.innerWidth;
    else globalThis.innerWidth = previousWidth;
  }
});

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
