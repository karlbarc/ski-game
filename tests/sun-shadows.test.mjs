import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { patchCascadeChunk, snapToTexels } from '../src/sun-shadows.js';

test('el parche de cascadas conserva el shader original para otras cantidades de luces', () => {
  const original = THREE.ShaderChunk.lights_fragment_begin;
  const patched = patchCascadeChunk(original);
  assert.match(patched, /NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 0/);
  assert.match(patched, /directLight\.color \*= sunCascadeShadow;/);
  // Las piezas originales siguen presentes, dentro de sus #else.
  assert.ok(patched.includes('getShadow( directionalShadowMap[ i ]'));
  assert.equal(patched.split('RE_Direct( directLight').length, original.split('RE_Direct( directLight').length);
  const balance = s => (s.match(/#if/g) || []).length - (s.match(/#endif/g) || []).length;
  assert.equal(balance(patched), balance(original));
});

test('el parche falla de forma explícita si three cambia el shader', () => {
  assert.throws(() => patchCascadeChunk('void main() {}'), /cambió/);
});

test('el centro de la sombra avanza en pasos de un texel en el plano de la luz', () => {
  const basis = new THREE.Matrix4().lookAt(new THREE.Vector3(100, 84, -30), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const right = new THREE.Vector3().setFromMatrixColumn(basis, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(basis, 1);
  const forward = new THREE.Vector3().setFromMatrixColumn(basis, 2);
  const texel = 36 / 2048;
  for (const p of [new THREE.Vector3(3.21, 1.7, -400.4), new THREE.Vector3(-12.9, 40, 9.99)]) {
    const snapped = snapToTexels(p, right, up, texel);
    for (const axis of [right, up]) {
      const steps = snapped.dot(axis) / texel;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6);
      assert.ok(Math.abs(snapped.dot(axis) - p.dot(axis)) <= texel / 2 + 1e-9);
    }
    assert.ok(Math.abs(snapped.dot(forward) - p.dot(forward)) < 1e-9);
  }
});
