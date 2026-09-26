import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkier, poseSkier } from '../src/skier.js';

test('la animación del esquiador no desplaza su anclaje en la pista', () => {
  const skier = createSkier();
  skier.position.set(12, 8, -30);
  for (const pose of [
    { steer: 1, airborne: false, fallen: false, dip: 0.5 },
    { steer: -1, airborne: true, fallen: false },
    { steer: 0, airborne: false, fallen: true },
  ]) {
    poseSkier(skier, pose);
    assert.deepEqual(skier.position.toArray(), [12, 8, -30]);
    skier.updateMatrixWorld(true);
    skier.traverse(part => assert.ok(part.matrixWorld.elements.every(Number.isFinite)));
  }
  poseSkier(skier, { steer: 0, airborne: false, fallen: false });
  assert.equal(skier.userData.body.rotation.x, 0);
  assert.equal(skier.userData.body.rotation.z, 0);
  assert.ok(Math.abs(skier.userData.body.position.y) < 1e-9);
});
