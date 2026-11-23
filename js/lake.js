import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Lago ao lado da estufa: água com ondulação, vitórias-régias, juncos e pedras.
// Tudo com poucas peças (InstancedMesh) para não pesar no FPS.
// ---------------------------------------------------------------------------

export const LAKE = { x: -7.5, z: 7, r: 2.6 };

// Textura de ondulação: manchas claras e escuras, usada como relevo (bumpMap).
function rippleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const light = Math.random() < 0.5;
    grad.addColorStop(0, light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

export function buildLake(scene, { x = LAKE.x, z = LAKE.z, r = LAKE.r } = {}) {
  // Superfície da água: levemente transparente, com reflexo do ambiente.
  const ripples = rippleTexture();
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f7fa3,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.88,
    bumpMap: ripples,
    bumpScale: 0.6,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 48), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.012, z);
  water.receiveShadow = true;
  scene.add(water);

  // Pedras ao redor da borda.
  const stoneGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8f94, roughness: 0.9, flatShading: true });
  const stoneCount = 34;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
  const d = new THREE.Object3D();
  for (let i = 0; i < stoneCount; i++) {
    const a = (i / stoneCount) * Math.PI * 2 + Math.random() * 0.1;
    const rr = r + 0.02 + Math.random() * 0.08;
    const s = 0.7 + Math.random() * 0.7;
    d.position.set(x + Math.cos(a) * rr, 0.05 * s, z + Math.sin(a) * rr);
    d.rotation.set(Math.random(), Math.random(), Math.random());
    d.scale.set(s, s * 0.6, s);
    d.updateMatrix();
    stones.setMatrixAt(i, d.matrix);
  }
  stones.castShadow = true;
  stones.receiveShadow = true;
  scene.add(stones);

  // Juncos (reeds) na beira: hastes finas e altas.
  const reedGeo = new THREE.CylinderGeometry(0.008, 0.012, 1, 5);
  reedGeo.translate(0, 0.5, 0);
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x5f7f3a, roughness: 0.8 });
  const reedCount = 46;
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, reedCount);
  const col = new THREE.Color();
  for (let i = 0; i < reedCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = r * (0.92 + Math.random() * 0.22);
    const h = 0.55 + Math.random() * 0.7;
    d.position.set(x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr);
    d.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25);
    d.scale.set(1, h, 1);
    d.updateMatrix();
    reeds.setMatrixAt(i, d.matrix);
    reeds.setColorAt(i, col.setHSL(0.2 + Math.random() * 0.05, 0.45, 0.28 + Math.random() * 0.12));
  }
  reeds.castShadow = true;
  scene.add(reeds);

  // Vitórias-régias: folhas redondas que flutuam e balançam devagar.
  const padGeo = new THREE.CircleGeometry(0.22, 28);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.7, side: THREE.DoubleSide });
  const pads = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * (r * 0.7);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x + Math.cos(a) * rr, 0.022, z + Math.sin(a) * rr);
    pad.rotation.y = Math.random() * Math.PI * 2;
    pad.scale.setScalar(0.7 + Math.random() * 0.6);
    pad.userData.phase = Math.random() * Math.PI * 2;
    pad.userData.baseY = pad.position.y;
    scene.add(pad);
    pads.push(pad);
  }

  return {
    update(t) {
      ripples.offset.set(t * 0.01, t * 0.006);
      for (const p of pads) {
        p.position.y = p.userData.baseY + Math.sin(t * 0.8 + p.userData.phase) * 0.004;
        p.rotation.y += 0.0004;
      }
    },
  };
}
