import * as THREE from 'three';

// Nivel de detalle por sector: cada lote estático (ver splitStaticInstances)
// recibe un gemelo con geometría ligera que comparte matrices, colores y
// material. Cerca de la cámara se dibuja el detallado y lejos el ligero; las
// sombras usan la misma visibilidad, así que también se abaratan.
export function lodPairs(detailBatches, lowGeometry) {
  return detailBatches.map((detail) => {
    const low = new THREE.InstancedMesh(lowGeometry, detail.material, detail.count);
    low.instanceMatrix = detail.instanceMatrix;
    low.instanceColor = detail.instanceColor;
    low.castShadow = detail.castShadow;
    low.receiveShadow = detail.receiveShadow;
    low.matrixAutoUpdate = false;
    low.boundingSphere = detail.boundingSphere;
    low.visible = false;
    return { detail, low };
  });
}

// `distance` se mide hasta el borde del sector: todo árbol más cercano que
// eso se dibuja con detalle.
export function updateLod(pairs, cameraPosition, distance) {
  for (const { detail, low } of pairs) {
    const sphere = detail.boundingSphere;
    const near = cameraPosition.distanceTo(sphere.center) - sphere.radius < distance;
    detail.visible = near;
    low.visible = !near;
  }
}
