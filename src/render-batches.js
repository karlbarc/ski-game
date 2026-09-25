import * as THREE from 'three';

// Mantiene las instancias idénticas, pero con límites pequeños que permiten
// descartar sectores fuera de la cámara o del volumen de sombras.
// Para mallas estáticas cuyas matrices ya están expresadas en el mundo.
export function splitStaticInstances(source, cellSize = 80) {
  const cells = new Map();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    const key = `${Math.floor(matrix.elements[12] / cellSize)},${Math.floor(matrix.elements[14] / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  const batches = [];
  for (const indices of cells.values()) {
    const batch = new THREE.InstancedMesh(source.geometry, source.material, indices.length);
    batch.castShadow = source.castShadow;
    batch.receiveShadow = source.receiveShadow;
    batch.matrixAutoUpdate = false;
    indices.forEach((sourceIndex, index) => {
      source.getMatrixAt(sourceIndex, matrix);
      batch.setMatrixAt(index, matrix);
      if (source.instanceColor) {
        source.getColorAt(sourceIndex, color);
        batch.setColorAt(index, color);
      }
    });
    batch.computeBoundingSphere();
    batches.push(batch);
  }
  // Solo libera los buffers de instancias; geometría y material se comparten.
  source.dispose();
  return batches;
}
