import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Canteiros de flores feitos por código: terra escura, caules verdes e flores
// coloridas. Poucas peças (InstancedMesh), sempre bonitas e leves.
// Posições fora da estufa, do caminho principal e da área de passagem.
// ---------------------------------------------------------------------------

const BED_CENTERS = [
  { x: -6.2, z: -1.0 },
  { x: -6.2, z: 2.2 },
  { x: 6.0, z: 1.5 },
  { x: 6.0, z: -2.5 },
  { x: 8.0, z: 5.0 },
  { x: -10.5, z: -5.0 },
  { x: 10.0, z: -5.5 },
  { x: -2.5, z: -8.0 },
  { x: 3.0, z: -8.0 },
];

const PALETTE = [0xf472b6, 0xfacc15, 0xa78bfa, 0xf8fafc, 0xfb923c, 0xef4444, 0x60a5fa];
const STEMS_PER_BED = 26;
const RADIUS = 0.85;

export function buildFlowerBeds(scene) {
  const count = BED_CENTERS.length * STEMS_PER_BED;

  // Terra do canteiro: disco escuro levemente acima do chão.
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  const soilGeo = new THREE.CircleGeometry(RADIUS + 0.12, 32).rotateX(-Math.PI / 2);
  const soil = new THREE.InstancedMesh(soilGeo, soilMat, BED_CENTERS.length);

  // Caules: cilindros finos verdes.
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.01, 1, 5);
  stemGeo.translate(0, 0.5, 0);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x3d7a34, roughness: 0.8 }), count);

  // Flores: esferas achatadas coloridas no topo de cada caule.
  const headGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }), count);

  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let k = 0;
  BED_CENTERS.forEach((c, bi) => {
    d.position.set(c.x, 0.012, c.z);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    soil.setMatrixAt(bi, d.matrix);

    for (let i = 0; i < STEMS_PER_BED; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * RADIUS;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const h = 0.28 + Math.random() * 0.22;
      d.position.set(x, 0.02, z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      stems.setMatrixAt(k, d.matrix);

      d.position.set(x, 0.02 + h, z);
      d.scale.set(1.1, 0.8, 1.1);
      d.updateMatrix();
      heads.setMatrixAt(k, d.matrix);
      heads.setColorAt(k, col.setHex(PALETTE[Math.floor(Math.random() * PALETTE.length)]));
      k++;
    }
  });

  for (const m of [soil, stems, heads]) {
    m.receiveShadow = true;
    scene.add(m);
  }
  stems.castShadow = true;
  heads.castShadow = true;
  return { soil, stems, heads };
}
