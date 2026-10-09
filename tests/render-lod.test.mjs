import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { splitStaticInstances } from '../src/render-batches.js';
import { lodPairs, updateLod } from '../src/render-lod.js';

function forest() {
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(2, 8, 24), new THREE.MeshStandardMaterial(), 100);
  mesh.castShadow = mesh.receiveShadow = true;
  for (let i = 0; i < mesh.count; i++) {
    mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i % 2 ? -12 : 12, 4, -i * 8));
    mesh.setColorAt(i, new THREE.Color(i / 100, 0.4, 0.2));
  }
  return mesh;
}

test('el gemelo ligero comparte instancias, material y sombras con el detallado', () => {
  const low = new THREE.ConeGeometry(2, 8, 5);
  for (const { detail, low: twin } of lodPairs(splitStaticInstances(forest(), 40), low)) {
    assert.equal(twin.geometry, low);
    assert.equal(twin.material, detail.material);
    assert.equal(twin.instanceMatrix, detail.instanceMatrix);
    assert.equal(twin.instanceColor, detail.instanceColor);
    assert.equal(twin.count, detail.count);
    assert.ok(twin.castShadow && twin.receiveShadow);
  }
});

test('solo los sectores cercanos a la cámara dibujan el detalle, y nunca ambos', () => {
  const pairs = lodPairs(splitStaticInstances(forest(), 40), new THREE.ConeGeometry(2, 8, 5));
  const camera = new THREE.Vector3(0, 2, -300);
  updateLod(pairs, camera, 50);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (const { detail, low } of pairs) {
    assert.notEqual(detail.visible, low.visible);
    for (let i = 0; i < detail.count; i++) {
      detail.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      if (position.distanceTo(camera) < 50) assert.ok(detail.visible, 'árbol cercano sin detalle');
    }
  }
  const detailed = pairs.filter(p => p.detail.visible).reduce((n, p) => n + p.detail.count, 0);
  assert.ok(detailed > 0 && detailed < 40, `${detailed} árboles con detalle`);
});
