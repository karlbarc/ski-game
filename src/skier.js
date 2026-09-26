import * as THREE from 'three';

// Superficies de secciones elípticas: perfiles anatómicos, sin articulaciones esféricas.
function sectionGeometry(rings, sides = 20) {
  const positions = [], indices = [];
  for (const [y, width, front, back, offset = 0] of rings) {
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const z = Math.sin(a);
      positions.push(Math.cos(a) * width, y, offset + z * (z < 0 ? front : back));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Frente local -Z. Articulaciones en metros; las botas permanecen sobre los esquís.
export function createSkier() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const colors = { suit: 0x163b83, lime: 0xb4db35, bib: 0xf1f3ef,
    helmet: 0x555c62, dark: 0x121b27, goggles: 0x78b5cf, metal: 0xa7b6c4 };
  const mats = Object.fromEntries(Object.entries(colors).map(([key, color]) =>
    [key, new THREE.MeshStandardMaterial({ color, roughness: key === 'goggles' ? 0.18 : 0.7,
      metalness: key === 'metal' ? 0.65 : 0 })]));
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const tube = new THREE.CylinderGeometry(0.85, 1, 1, 12);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const delta = new THREE.Vector3();
  function mesh(geo, material, scale, parent = body) {
    const part = new THREE.Mesh(geo, mats[material]);
    part.scale.set(...scale);
    part.castShadow = part.receiveShadow = true;
    parent.add(part);
    return part;
  }
  function oval(material, scale, parent) { return mesh(sphere, material, scale, parent); }
  function segment(material, radius, depth = radius) {
    const part = mesh(tube, material, [radius, 1, depth]);
    return { part, set(a, b) {
      delta.subVectors(b, a);
      part.position.copy(a).add(b).multiplyScalar(0.5);
      part.scale.y = delta.length();
      part.quaternion.setFromUnitVectors(up, delta.normalize());
    } };
  }
  // Cintura estrecha, volumen de cadera y unión amplia con los muslos.
  const hips = mesh(sectionGeometry([
    [-0.16, 0.13, 0.085, 0.10], [-0.12, 0.21, 0.13, 0.16],
    [-0.04, 0.245, 0.15, 0.185], [0.04, 0.225, 0.14, 0.17],
    [0.12, 0.185, 0.115, 0.13], [0.15, 0.17, 0.105, 0.12],
  ]), 'suit', [1, 1, 1]);
  const torso = new THREE.Group();
  body.add(torso);
  const chestRings = [
    [0.00, 0.18, 0.11, 0.125], [0.055, 0.182, 0.115, 0.13],
    [0.13, 0.188, 0.125, 0.14], [0.22, 0.217, 0.15, 0.15],
    [0.30, 0.247, 0.158, 0.145], [0.36, 0.256, 0.15, 0.135],
    [0.40, 0.239, 0.132, 0.12], [0.435, 0.188, 0.10, 0.10],
    [0.465, 0.082, 0.075, 0.075], [0.49, 0.077, 0.072, 0.072],
  ];
  const chestGeo = sectionGeometry(chestRings);
  const chest = mesh(chestGeo, 'bib', [1, 1, 1], torso);
  // Color lateral del traje, dorsal de tela sobre la espalda y el pecho.
  const tint = [], color = new THREE.Color();
  const cp = chestGeo.getAttribute('position');
  for (let i = 0; i < cp.count; i++) {
    const lateral = Math.abs(cp.getX(i));
    color.set(lateral > 0.175 && cp.getY(i) > 0.14 ? colors.suit : colors.bib);
    tint.push(color.r, color.g, color.b);
  }
  chestGeo.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3));
  chest.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const collar = mesh(sectionGeometry([
    [0, 0.08, 0.075, 0.075], [0.045, 0.078, 0.073, 0.073],
  ]), 'dark', [1, 1, 1], torso);
  collar.position.y = 0.465;
  for (const x of [-0.045, 0.045]) {
    const numeral = mesh(box, 'suit', [0.017, 0.125, 0.006], torso);
    numeral.position.set(x, 0.26, 0.148);
    numeral.rotation.x = -0.06;
    const cap = mesh(box, 'suit', [0.04, 0.016, 0.006], torso);
    cap.position.set(x - 0.01, 0.32, 0.145);
  }
  // Un solo tejido continuo por extremidad, deformado sobre sus tres articulaciones.
  function anatomy(profile, material, accent = false) {
    const sides = 16, rows = 24;
    const geo = sectionGeometry(Array.from({ length: rows + 1 }, (_, i) => [i / rows, 1, 1, 1]), sides);
    const part = mesh(geo, material, [1, 1, 1]);
    if (accent) {
      const colorsArray = [];
      for (let i = 0; i <= rows; i++) for (let j = 0; j <= sides; j++) {
        color.set(j >= 7 && j <= 9 ? colors.lime : colors.suit);
        colorsArray.push(color.r, color.g, color.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colorsArray, 3));
      part.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    }
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const center = new THREE.Vector3(), tangent = new THREE.Vector3(), right = new THREE.Vector3(), normal = new THREE.Vector3();
    const radial = new THREE.Vector3(0, 0, 1);
    return { part, set(a, b, c) {
      path.points[0].copy(a); path.points[1].copy(b); path.points[2].copy(c);
      const attr = geo.getAttribute('position');
      for (let i = 0; i <= rows; i++) {
        const t = i / rows;
        path.getPoint(t, center); path.getTangent(t, tangent);
        right.crossVectors(tangent, radial).normalize();
        normal.crossVectors(right, tangent).normalize();
        const k = Math.min(profile.length - 2, Math.floor(t * (profile.length - 1)));
        const f = t * (profile.length - 1) - k;
        const w = THREE.MathUtils.lerp(profile[k][0], profile[k + 1][0], f);
        const d = THREE.MathUtils.lerp(profile[k][1], profile[k + 1][1], f);
        for (let j = 0; j <= sides; j++) {
          const angle = j / sides * Math.PI * 2;
          const x = Math.cos(angle) * w, z = Math.sin(angle) * d;
          attr.setXYZ(i * (sides + 1) + j, center.x + right.x * x + normal.x * z,
            center.y + right.y * x + normal.y * z, center.z + right.z * x + normal.z * z);
        }
      }
      attr.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    } };
  }
  const head = new THREE.Group();
  body.add(head);
  // Carcasa de casco: cúpula ancha, nuca baja y borde definido.
  const helmetProfile = [
    [-0.09, 0.125, 0.135, 0.145], [-0.055, 0.152, 0.16, 0.173],
    [0.015, 0.16, 0.165, 0.18], [0.075, 0.153, 0.157, 0.171],
    [0.125, 0.132, 0.137, 0.148], [0.165, 0.095, 0.10, 0.108],
    [0.19, 0.045, 0.05, 0.053], [0.198, 0.001, 0.001, 0.001],
  ];
  mesh(sectionGeometry(helmetProfile, 32), 'helmet', [1, 1, 1], head);
  mesh(sectionGeometry([
    [-0.093, 0.128, 0.138, 0.148], [-0.08, 0.135, 0.145, 0.156],
  ], 32), 'dark', [1, 1, 1], head);
  // Banda continua apoyada sobre la carcasa, no un anillo esférico.
  mesh(sectionGeometry([
    [-0.046, 0.156, 0.164, 0.178], [0.003, 0.164, 0.169, 0.184],
  ], 32), 'dark', [1, 1, 1], head);
  const buckle = mesh(box, 'helmet', [0.055, 0.052, 0.012], head);
  buckle.position.set(0, -0.02, 0.183);
  mesh(box, 'dark', [0.028, 0.058, 0.015], head).position.set(0, -0.019, 0.193);
  // Ranuras oscuras curvas sobre la nuca, siguiendo el perfil de la cúpula.
  function vent(cx, cy, width, height) {
    const positions = [], indices = [];
    for (let row = 0; row <= 4; row++) {
      const y = cy + (row / 4 - 0.5) * height;
      const k = helmetProfile.findIndex((r, i) => i < helmetProfile.length - 1
        && y >= r[0] && y <= helmetProfile[i + 1][0]);
      const lower = helmetProfile[k], upper = helmetProfile[k + 1];
      const t = (y - lower[0]) / (upper[0] - lower[0]);
      const rx = THREE.MathUtils.lerp(lower[1], upper[1], t);
      const rz = THREE.MathUtils.lerp(lower[3], upper[3], t);
      for (let col = 0; col <= 8; col++) {
        const round = row === 0 || row === 4 ? 0.8 : 1;
        const x = cx + (col / 8 - 0.5) * width * round;
        positions.push(x, y, rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) + 0.0015);
        if (row < 4 && col < 8) {
          const i = row * 9 + col;
          indices.push(i, i + 1, i + 9, i + 1, i + 10, i + 9);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices); geo.computeVertexNormals();
    mesh(geo, 'dark', [1, 1, 1], head);
  }
  vent(-0.082, 0.082, 0.039, 0.024);
  vent(0.082, 0.082, 0.039, 0.024);
  vent(-0.022, 0.103, 0.018, 0.025);
  vent(0.022, 0.103, 0.018, 0.025);
  const frame = oval('dark', [0.141, 0.074, 0.044], head);
  frame.position.set(0, -0.025, -0.159);
  const lens = oval('goggles', [0.129, 0.06, 0.035], head);
  lens.position.set(0, -0.025, -0.176);
  for (const x of [-0.144, 0.144]) {
    const ear = oval('dark', [0.032, 0.07, 0.066], head);
    ear.position.set(x, -0.085, 0.005);
  }
  const limbs = [-1, 1].map(side => {
    const boot = new THREE.Group();
    boot.position.set(side * 0.215, 0, 0);
    body.add(boot);
    // Suela rígida y carcasa asimétrica: puntera baja, empeine y caña inclinada.
    mesh(sectionGeometry([
      [0.035, 0.082, 0.215, 0.14], [0.062, 0.087, 0.218, 0.145],
      [0.08, 0.084, 0.212, 0.14],
    ]), 'dark', [1, 1, 1], boot);
    mesh(sectionGeometry([
      [0.075, 0.082, 0.205, 0.133], [0.105, 0.086, 0.202, 0.132],
      [0.14, 0.082, 0.175, 0.12], [0.18, 0.073, 0.105, 0.095],
      [0.23, 0.074, 0.083, 0.072, -0.012],
      [0.29, 0.083, 0.082, 0.07, -0.025], [0.33, 0.081, 0.077, 0.068, -0.035],
    ]), 'helmet', [1, 1, 1], boot);
    mesh(sectionGeometry([
      [0.31, 0.072, 0.067, 0.06, -0.035], [0.355, 0.07, 0.064, 0.056, -0.043],
    ]), 'dark', [1, 1, 1], boot);
    // Lengüeta frontal y cuatro cierres de aluminio con palanca lateral.
    mesh(box, 'dark', [0.058, 0.15, 0.014], boot).position.set(0, 0.25, -0.106);
    for (const [y, z, width] of [[0.12, -0.15, 0.15], [0.165, -0.10, 0.145],
      [0.235, -0.106, 0.145], [0.295, -0.11, 0.15]]) {
      mesh(box, 'metal', [width, 0.014, 0.022], boot).position.set(0, y, z);
      mesh(box, 'dark', [0.028, 0.024, 0.035], boot).position.set(side * width / 2, y, z);
    }
    for (const x of [-0.082, 0.082]) {
      const pivot = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 12), 'metal', [1, 1, 1], boot);
      pivot.rotation.z = Math.PI / 2;
      pivot.position.set(x, 0.215, 0.005);
    }
    // Fijación: placa, mordazas de puntera y talonera con palanca de apertura.
    mesh(box, 'dark', [0.115, 0.022, 0.54], boot).position.set(0, 0.025, -0.025);
    mesh(box, 'helmet', [0.14, 0.055, 0.095], boot).position.set(0, 0.05, -0.25);
    for (const x of [-0.066, 0.066]) {
      mesh(box, 'metal', [0.025, 0.05, 0.07], boot).position.set(x, 0.078, -0.215);
    }
    mesh(box, 'helmet', [0.13, 0.10, 0.105], boot).position.set(0, 0.07, 0.185);
    mesh(box, 'metal', [0.095, 0.025, 0.058], boot).position.set(0, 0.105, 0.139);
    const lever = mesh(box, 'dark', [0.09, 0.026, 0.10], boot);
    lever.position.set(0, 0.14, 0.206); lever.rotation.x = -0.35;
    for (const x of [-0.10, 0.10]) {
      mesh(box, 'metal', [0.013, 0.026, 0.17], boot).position.set(x, 0.035, 0.10);
    }
    const glove = new THREE.Group();
    body.add(glove);
    // Palma cerrada, dedos curvados alrededor del mango y pulgar opuesto.
    mesh(sectionGeometry([
      [-0.065, 0.043, 0.035, 0.033], [-0.03, 0.056, 0.045, 0.037],
      [0.025, 0.059, 0.043, 0.038], [0.055, 0.045, 0.035, 0.03],
      [0.066, 0.022, 0.019, 0.02],
    ]), 'dark', [1, 1, 1], glove);
    const cuff = mesh(box, 'helmet', [0.10, 0.04, 0.077], glove);
    cuff.position.set(0, -0.062, 0.005);
    for (let i = 0; i < 4; i++) {
      const finger = oval('dark', [0.013, 0.042 - Math.abs(i - 1.5) * 0.004, 0.022], glove);
      finger.position.set((i - 1.5) * 0.025, 0.012, -0.042);
      finger.rotation.x = -0.5;
    }
    const thumb = oval('helmet', [0.024, 0.038, 0.023], glove);
    thumb.position.set(-side * 0.048, -0.003, -0.04); thumb.rotation.z = side * 0.6;
    const grip = mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.14, 10), 'dark', [1, 1, 1], glove);
    grip.position.set(0, -0.01, -0.028);
    const strap = mesh(new THREE.TorusGeometry(0.038, 0.006, 6, 16), 'dark', [1, 1, 1], glove);
    strap.position.set(0, -0.055, 0.018); strap.rotation.x = 0.7;
    const basket = oval('dark', [0.053, 0.012, 0.053]);
    return { side, boot, glove, basket,
      leg: anatomy([[0.135, 0.145], [0.135, 0.145], [0.115, 0.125],
        [0.092, 0.10], [0.086, 0.092], [0.095, 0.102], [0.084, 0.092], [0.066, 0.068]], 'suit', true),
      arm: anatomy([[0.095, 0.103], [0.091, 0.095], [0.078, 0.083],
        [0.065, 0.068], [0.070, 0.072], [0.061, 0.066], [0.045, 0.05]], 'suit', true),
      pole: segment('metal', 0.011) };
  });
  root.userData.body = body;
  root.userData.rig = { hips, torso, head, limbs };
  poseSkier(root, { steer: 0, airborne: false, fallen: false });
  return root;
}

export function poseSkier(skier, { steer, airborne, fallen, dip = 0 }) {
  const body = skier.userData.body;
  const { hips, torso, head, limbs } = skier.userData.rig;
  // El eje lateral del personaje apunta al lado opuesto del giro de la pista.
  const turn = -THREE.MathUtils.clamp(steer, -1, 1) * (airborne ? 0.35 : 1);
  const intensity = Math.abs(turn);
  const compression = Math.min(0.12, Math.max(0, dip)) + intensity * 0.17;
  const pelvis = new THREE.Vector3(turn * 0.48, 0.86 - compression, 0.13);
  // El tronco se inclina sin estirarse: conserva la distancia cadera-cuello.
  const lean = turn * 0.52;
  const neck = pelvis.clone().add(new THREE.Vector3(
    Math.sin(lean) * 0.35, Math.cos(lean) * 0.35, -0.44));
  hips.position.copy(pelvis);
  hips.rotation.z = -lean * 0.7;
  torso.position.copy(pelvis);
  torso.scale.y = neck.distanceTo(pelvis) / 0.49;
  torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), neck.clone().sub(pelvis).normalize());
  head.position.copy(neck).add(new THREE.Vector3(Math.sin(lean) * 0.13, 0.17, -0.02));
  head.rotation.set(0.08, -turn * 0.12, -lean * 0.65);
  for (const limb of limbs) {
    const s = limb.side;
    // La pierna interior se recoge y la exterior sostiene el giro.
    const inside = Math.max(0, s * turn);
    const knee = new THREE.Vector3(limb.boot.position.x + turn * 0.25,
      0.52 - compression * 0.35 - inside * 0.055, -0.23 - inside * 0.07);
    // Bota y espinilla comparten el eje lateral, pivotando desde la base del esquí.
    const edgeAngle = -Math.atan2(knee.x - limb.boot.position.x, knee.y);
    limb.boot.rotation.z = edgeAngle;
    const ankle = new THREE.Vector3(0, 0.29, 0)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), edgeAngle).add(limb.boot.position);
    const hip = pelvis.clone().add(new THREE.Vector3(s * 0.095, 0.025, 0).applyAxisAngle(
      new THREE.Vector3(0, 0, 1), -lean * 0.7));
    limb.leg.set(hip, knee, ankle);
    const shoulder = new THREE.Vector3(s * 0.185, 0.365 * torso.scale.y, 0)
      .applyQuaternion(torso.quaternion).add(pelvis);
    // El brazo interior acompaña el giro con una apertura pequeña.
    const armMotion = intensity - inside * 0.8;
    const elbow = shoulder.clone().add(new THREE.Vector3(s * (0.15 + armMotion * 0.12), -0.22 + armMotion * 0.08, -0.02));
    const hand = shoulder.clone().add(new THREE.Vector3(s * (airborne ? 0.34 : 0.23 + armMotion * 0.19),
      -0.13 - armMotion * 0.13 + Math.max(0, -s * turn) * 0.08, -0.34));
    limb.glove.position.copy(hand);
    limb.glove.rotation.set(-0.25, -s * 0.15, -s * 0.12);
    limb.arm.set(shoulder, elbow, hand);
    const tip = hand.clone().add(new THREE.Vector3(s * (0.17 + armMotion * 0.58), -0.77 + armMotion * 0.40, 0.80 - armMotion * 0.12));
    limb.pole.set(hand, tip);
    limb.basket.position.copy(tip).lerp(hand, 0.06);
  }
  // La caída transforma todo el cuerpo; al esquiar, el balanceo nace en las rodillas.
  body.rotation.set(fallen ? -0.35 : 0, 0, fallen ? 1.2 : 0);
  body.position.y = fallen ? 0.18 : 0;
}
