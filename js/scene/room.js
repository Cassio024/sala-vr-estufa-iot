// Estufa, bancadas, luminária, mesa e cenário externo (árvores e posições usadas pelo resto da cena).
import * as THREE from 'three';
import { pbrMaterial, buildGreenhouse, buildBenches, buildLamp, buildOutdoorScenery } from '../environment.js';

export const GREENHOUSE_SIZE = 8;
export const TABLE_Y = 0.78; // altura da superfície da mesa
export const TABLE_Z = -1;

// Devolve o que o resto da cena precisa: a porta (para a animação), as posições
// dos vasos das bancadas e as árvores (para sombras de contato e vento).
// No modo leve (headset standalone) vão menos árvores (todas num InstancedMesh: 2 draw calls).
export function buildRoom(scene, { shadowMapSize, low = false }) {
  const greenhouse = buildGreenhouse(scene, { size: GREENHOUSE_SIZE, height: 3, shadowMapSize });
  const benchSpots = buildBenches(scene, GREENHOUSE_SIZE);
  buildLamp(scene, 0, TABLE_Z, greenhouse.roofY(TABLE_Z) - 0.05);

  const woodMat = pbrMaterial('madeira', { fallback: 'wood', roughness: 0.7 });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), woodMat);
  tableTop.position.set(0, TABLE_Y - 0.03, TABLE_Z);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  for (const [x, dz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE_Y, 0.06), woodMat);
    leg.position.set(x, TABLE_Y / 2, TABLE_Z + dz);
    leg.castShadow = true;
    scene.add(leg);
  }

  const outdoor = buildOutdoorScenery(scene, low ? { count: 40 } : {});
  return { greenhouse, benchSpots, outdoor, tableTop };
}
