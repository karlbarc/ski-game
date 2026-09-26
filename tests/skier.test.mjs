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

test('la caída deja al esquiador tendido y con brazos y piernas abiertos', () => {
  const skier = createSkier();
  poseSkier(skier, { steer: 0, airborne: false, fallen: true });
  const { torso, head, limbs } = skier.userData.rig;

  assert.ok(Math.abs(torso.quaternion.x) > 0.5, 'el torso debe quedar recostado');
  assert.ok(head.position.y < 0.35, 'la cabeza debe quedar cerca de la nieve');
  assert.ok(limbs[0].glove.position.x < -0.7, 'el brazo izquierdo debe quedar abierto');
  assert.ok(limbs[1].glove.position.x > 0.7, 'el brazo derecho debe quedar abierto');
  assert.ok(limbs[0].boot.position.x < -0.55, 'la pierna izquierda debe quedar separada');
  assert.ok(limbs[1].boot.position.x > 0.55, 'la pierna derecha debe quedar separada');

  poseSkier(skier, { steer: 0, airborne: false, fallen: false });
  assert.deepEqual(limbs.map(limb => limb.boot.position.toArray()), [
    [-0.215, 0, 0], [0.215, 0, 0],
  ]);
  for (const limb of limbs) {
    assert.ok(Math.abs(limb.boot.rotation.x) < 1e-9);
    assert.ok(Math.abs(limb.boot.rotation.y) < 1e-9);
    assert.ok(Math.abs(limb.boot.rotation.z) < 1e-9);
  }
});
