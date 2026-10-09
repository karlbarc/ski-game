import * as THREE from 'three';

// Sombras del sol en dos cascadas: un mapa pequeño y nítido alrededor del
// esquiador y el mapa amplio de siempre para el resto. La luz cercana solo
// aporta su mapa de sombras; la iluminación la pone la luz amplia, así que el
// coste por píxel sigue siendo una muestra de sombra (dos en la franja de
// transición entre cascadas).

const NEAR_HALF = 18; // m: caja de 36 m alrededor del jugador
const FAR_HALF = 80;

// Sustituye el bucle de luces direccionales cuando hay exactamente dos con
// sombra (la cercana y la amplia). Con cualquier otra cantidad el shader de
// three queda intacto. La cercana es el índice 0: ambas proyectan sombra y
// three ordena las luces de forma estable, por orden de inserción en escena.
const CASCADE_SHADOW = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2
	float sunCascadeShadow = 1.0;
	if ( receiveShadow ) {
		vec3 nearCoord = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
		vec2 edge = abs( nearCoord.xy - 0.5 ) * 2.0;
		float blend = ( nearCoord.z < 0.0 || nearCoord.z > 1.0 ) ? 1.0
			: smoothstep( 0.75, 0.95, max( edge.x, edge.y ) );
		if ( blend < 1.0 ) sunCascadeShadow = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
		if ( blend > 0.0 ) sunCascadeShadow = mix( sunCascadeShadow, getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ), blend );
	}
#endif
`;
const LOOP_START = '\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {\n\t\tdirectionalLight = directionalLights[ i ];';
const SHADOW_LINE = /\t\tdirectLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \][^\n]*\n/;
const RE_DIRECT = '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}';

export function patchCascadeChunk(chunk) {
  const loop = chunk.indexOf(LOOP_START);
  const shadow = chunk.slice(loop).match(SHADOW_LINE);
  const direct = chunk.indexOf(RE_DIRECT, loop);
  if (loop < 0 || !shadow || direct < 0) throw new Error('sun-shadows: el shader de luces de three cambió');
  const shadowAt = loop + shadow.index;
  return chunk.slice(0, loop) + CASCADE_SHADOW + LOOP_START
    + '\n\t\t#if NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 0\n\t\t// cascada cercana: solo aporta su mapa de sombras\n\t\t#else'
    + chunk.slice(loop + LOOP_START.length, shadowAt)
    + '\t\t#if NUM_DIR_LIGHT_SHADOWS == 2\n\t\tdirectLight.color *= sunCascadeShadow;\n\t\t#else\n'
    + shadow[0] + '\t\t#endif\n'
    + chunk.slice(shadowAt + shadow[0].length, direct)
    + RE_DIRECT.slice(0, -2) + '\n\t\t#endif\n\t}'
    + chunk.slice(direct + RE_DIRECT.length);
}

// Mueve el centro de la caja de sombra en pasos de un texel, medidos en el
// plano de la luz: así los bordes de sombra no titilan al avanzar.
export function snapToTexels(point, right, up, texel) {
  const r = point.dot(right);
  const u = point.dot(up);
  return point.clone()
    .addScaledVector(right, Math.round(r / texel) * texel - r)
    .addScaledVector(up, Math.round(u / texel) * texel - u);
}

function shadowLight(color, intensity, half, size) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.castShadow = true;
  light.shadow.mapSize.set(size, size);
  const cam = light.shadow.camera;
  cam.near = 1;
  cam.far = 400;
  cam.left = cam.bottom = -half;
  cam.right = cam.top = half;
  cam.updateProjectionMatrix(); // sin esto los límites de arriba no se aplican
  return light;
}

export function createSunShadows(scene, { offset, color, intensity, lowEnd }) {
  THREE.ShaderChunk.lights_fragment_begin = patchCascadeChunk(THREE.ShaderChunk.lights_fragment_begin);
  // La cercana va primero en la escena (ver CASCADE_SHADOW) y no ilumina.
  const near = shadowLight(color, 0, NEAR_HALF, lowEnd ? 1024 : 2048);
  near.shadow.bias = -0.0002;
  near.shadow.normalBias = 0.08;
  const far = shadowLight(color, intensity, FAR_HALF, lowEnd ? 512 : 2048);
  far.shadow.bias = -0.0004;
  far.shadow.normalBias = 0.35;
  for (const light of [near, far]) scene.add(light, light.target);
  // Base de la cámara de sombra: fija porque la dirección del sol no cambia.
  const basis = new THREE.Matrix4().lookAt(offset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const right = new THREE.Vector3().setFromMatrixColumn(basis, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(basis, 1);
  const place = (light, focus, half) => {
    const texel = (half * 2) / light.shadow.mapSize.x;
    light.target.position.copy(snapToTexels(focus, right, up, texel));
    light.position.copy(light.target.position).add(offset);
  };
  return {
    far,
    // nearFocus: junto al jugador; farFocus: por delante, donde mira la cámara.
    follow(nearFocus, farFocus) {
      place(near, nearFocus, NEAR_HALF);
      place(far, farFocus, FAR_HALF);
    },
  };
}
