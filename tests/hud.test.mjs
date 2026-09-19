import test from 'node:test';
import assert from 'node:assert/strict';
import { createHud } from '../src/hud.js';

function element() {
  return { textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } };
}

test('limita las escrituras dinámicas del HUD a diez por segundo', () => {
  const nodes = new Map([
    ['timer-text', element()], ['progress', element()],
    ['speed-fill', element()], ['speed-value', element()],
  ]);
  const writes = new Map();
  for (const [id, node] of nodes) {
    let value = '';
    Object.defineProperty(node, 'textContent', {
      get: () => value,
      set: (next) => { value = next; writes.set(id, (writes.get(id) || 0) + 1); },
    });
  }
  const hud = createHud({ getElementById: (id) => nodes.get(id) });

  for (let now = 0; now < 100; now += 16) {
    hud.setTimer(`00:00.${now}`, now);
    hud.setSpeed(now, now);
    hud.setProgress(now, 1000, now);
  }
  assert.equal(writes.get('timer-text'), 1);
  assert.equal(writes.get('speed-value'), 1);
  assert.equal(writes.get('progress'), 1);

  hud.setTimer('00:00.10', 100);
  hud.setSpeed(10, 100);
  hud.setProgress(10, 1000, 100);
  assert.equal(writes.get('timer-text'), 2);
  assert.equal(writes.get('speed-value'), 2);
  assert.equal(writes.get('progress'), 2);
});
