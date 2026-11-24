import * as THREE from 'three';
import { placeProp } from './props.js';

// ---------------------------------------------------------------------------
// Detalhes da estufa: luminárias de cultivo acesas sobre as bancadas e
// objetos 3D reais (Poly Haven, CC0) nos cantos: jardineiras, plantas e mangueira.
// Posições longe da mesa central, do painel e da placa no fundo.
// ---------------------------------------------------------------------------

const BENCH_X = 3.3;     // centro das bancadas (lados esquerdo e direito)
const LIGHT_Y = 2.15;    // altura das luminárias
const LIGHT_LEN = 6.0;   // comprimento da barra de luz

export function buildGrowLights(scene, ceilingY = 3) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.4 });
  // Faixa de LED de cultivo (rosa/roxo), com brilho próprio. No PC o bloom a faz brilhar.
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x220818, emissive: 0xff4fd8, emissiveIntensity: 2.2, roughness: 0.5,
  });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  for (const side of [-1, 1]) {
    const x = side * BENCH_X;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, LIGHT_LEN), bodyMat);
    body.position.set(x, LIGHT_Y, 0);
    body.castShadow = true;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, LIGHT_LEN - 0.1), ledMat);
    led.position.set(x, LIGHT_Y - 0.031, 0);
    scene.add(body, led);

    // Dois cabos prendendo cada barra ao teto.
    for (const z of [-LIGHT_LEN / 2 + 0.4, LIGHT_LEN / 2 - 0.4]) {
      const len = ceilingY - LIGHT_Y;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 6), cableMat);
      cable.position.set(x, LIGHT_Y + len / 2, z);
      scene.add(cable);
    }
  }
}

// Objetos 3D reais nos cantos da estufa.
export function buildGreenhouseProps(scene) {
  return Promise.all([
    // Jardineiras de madeira junto à parede do fundo, nos cantos.
    placeProp(scene, 'planter_box_01', -2.6, -3.55, { height: 0.55, castShadow: true }),
    placeProp(scene, 'planter_box_01', 2.6, -3.55, { height: 0.55, rotY: Math.PI, castShadow: true }),
    // Plantas grandes em vaso nos cantos da frente, ao lado da porta.
    placeProp(scene, 'potted_plant_04', -3.4, 3.35, { height: 0.7, castShadow: true }),
    placeProp(scene, 'potted_plant_04', 3.4, 3.35, { height: 0.7, rotY: 1.2, castShadow: true }),
    // Mangueira de parede no lado esquerdo.
    placeProp(scene, 'garden_hose_wall_mounted_01', -3.85, 1.6, { height: 0.5, rotY: Math.PI / 2, baseY: 0.6 }),
  ]);
}
