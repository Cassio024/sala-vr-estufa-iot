import * as THREE from 'three';
import { placeProp } from './props.js';

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


const FLOWERS = ['flower_gazania', 'flower_ursinia', 'periwinkle_plant', 'dandelion_01', 'flower_heliophila'];

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
