import * as THREE from 'three';
import { placeProp } from './props.js';
import { LAKE } from './lake.js';

// ---------------------------------------------------------------------------
// Mapa do jardim: canteiros de flores coloridas e um caminho de pedras
// da entrada até a beira do lago. Posições escolhidas para não cair em cima
// da estufa, do caminho principal nem da água.
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

const FLOWERS = ['flower_gazania', 'flower_ursinia', 'periwinkle_plant', 'dandelion_01', 'flower_heliophila', 'celandine_01'];

// Canteiro: um arbusto no centro e flores espalhadas em volta.
export async function buildFlowerBeds(scene) {
  const jobs = [];
  for (const c of BED_CENTERS) {
    jobs.push(placeProp(scene, 'shrub_03', c.x, c.z, { height: 0.9, rotY: Math.random() * 6.28 }));
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.7;
      const name = FLOWERS[(i + Math.floor(Math.random() * FLOWERS.length)) % FLOWERS.length];
      jobs.push(placeProp(scene, name, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, {
        height: 0.3 + Math.random() * 0.15,
        rotY: Math.random() * 6.28,
      }));
    }
  }
  return Promise.all(jobs);
}

// Caminho de pedras da entrada até a beira do lago (pedras chatas, poucas peças).
export function buildStonePath(scene, from = { x: -0.6, z: 11.2 }) {
  const edgeDir = new THREE.Vector2(from.x - LAKE.x, from.z - LAKE.z).normalize();
  const to = { x: LAKE.x + edgeDir.x * (LAKE.r + 0.2), z: LAKE.z + edgeDir.y * (LAKE.r + 0.2) };
  const count = 8;
  const geo = new THREE.CylinderGeometry(0.22, 0.24, 0.05, 14);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.9 });
  const stones = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    d.position.set(from.x + (to.x - from.x) * t, 0.025, from.z + (to.z - from.z) * t);
    d.rotation.set(0, Math.random() * Math.PI, 0);
    d.scale.set(0.9 + Math.random() * 0.25, 1, 0.9 + Math.random() * 0.25);
    d.updateMatrix();
    stones.setMatrixAt(i, d.matrix);
  }
  stones.receiveShadow = true;
  scene.add(stones);
  return stones;
}
