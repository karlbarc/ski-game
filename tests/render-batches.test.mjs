import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { splitStaticInstances } from '../src/render-batches.js';

function forest() {
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(2, 8, 6), new THREE.MeshStandardMaterial(), 100);
  mesh.castShadow = mesh.receiveShadow = true;
  for (let i = 0; i < mesh.count; i++) {
    mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i % 2 ? -12 : 12, 4, -i * 8));
    mesh.setColorAt(i, new THREE.Color(i / 100, 0.4, 0.2));
  }
  mesh.computeBoundingSphere();
  return mesh;
}

test('spatial batches preserve every tree transform, color, geometry and shadow', () => {
  const source = forest();
  const expected = new Map();
  const matrix = new THREE.Matrix4(), color = new THREE.Color();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix); source.getColorAt(i, color);
    expected.set(JSON.stringify(matrix.elements), color.toArray());
  }
  const batches = splitStaticInstances(source);
  assert.equal(batches.reduce((n, b) => n + b.count, 0), 100);
  for (const batch of batches) {
    assert.equal(batch.geometry, source.geometry);
    assert.equal(batch.material, source.material);
    assert.ok(batch.castShadow && batch.receiveShadow);
    for (let i = 0; i < batch.count; i++) {
      batch.getMatrixAt(i, matrix); batch.getColorAt(i, color);
      const key = JSON.stringify(matrix.elements);
      assert.deepEqual(color.toArray(), expected.get(key));
      expected.delete(key);
    }
  }
  assert.equal(expected.size, 0);
});

test('camera and shadow frustums skip distant sectors without dropping visible trees', () => {
  const source = forest();
  const batches = splitStaticInstances(source);
  const cameras = [new THREE.PerspectiveCamera(90, 1.6, 0.1, 3000), new THREE.OrthographicCamera(-80, 80, 80, -80, 1, 400)];
  for (const camera of cameras) {
    for (const angle of [-1, 0, 1]) {
      camera.position.set(0, 12, -400);
      camera.lookAt(Math.sin(angle) * 100, 0, -400 - Math.cos(angle) * 100);
      camera.updateMatrixWorld();
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      assert.ok(frustum.intersectsObject(source));
      const visible = batches.filter((batch) => frustum.intersectsObject(batch));
      const submitted = visible.reduce((n, batch) => n + batch.count, 0);
      assert.ok(submitted < source.count * 0.75, `${submitted} instances submitted`);
      for (const batch of batches) {
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < batch.count; i++) {
          batch.getMatrixAt(i, matrix);
          const sphere = source.geometry.boundingSphere.clone().applyMatrix4(matrix);
          if (frustum.intersectsSphere(sphere)) assert.ok(visible.includes(batch));
        }
      }
    }
  }
});
