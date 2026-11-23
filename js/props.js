import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ---------------------------------------------------------------------------
// Objetos reais (Poly Haven, CC0) carregados de assets/models/polyhaven/*.glb.
// Cada modelo é carregado uma vez e clonado nos lugares onde aparece.
// ---------------------------------------------------------------------------

// Os modelos foram otimizados com compressão Meshopt, então o carregador precisa do decodificador.
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const BASE = 'assets/models/polyhaven/';

function load(name) {
  if (!cache.has(name)) {
    cache.set(name, loader.loadAsync(`${BASE}${name}.glb`).then((g) => g.scene));
  }
  return cache.get(name);
}

// Coloca um objeto no chão, com altura desejada e rotação em Y.
// Se "height" não for informado, mantém o tamanho original do modelo.
// Sombra só para objetos grandes (cerca, árvores); flores e grama não projetam sombra,
// porque o custo de desenhar sombra de centenas de objetos pequenos não compensa.
export async function placeProp(scene, name, x, z, { height = null, rotY = 0, scale = 1, castShadow = false, baseY = 0 } = {}) {
  const base = await load(name);
  const obj = base.clone(true);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const k = height ? height / Math.max(size.y, 0.001) : scale;
  obj.scale.setScalar(k);

  // Assenta a base do modelo em baseY (0 = chão; ~0.8 = tampo da bancada).
  const minY = new THREE.Box3().setFromObject(obj).min.y;
  obj.position.set(x, baseY - minY, z);
  obj.rotation.y = rotY;

  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = castShadow;
      o.receiveShadow = true;
    }
  });
  scene.add(obj);
  return obj;
}

// Espalha várias cópias de um objeto dentro de uma área (círculos fora de "avoid").
export async function scatterProp(scene, name, count, { minR, maxR, avoid = null, height, rnd = Math.random, castShadow = false }) {
  const placed = [];
  let tries = 0;
  while (placed.length < count && tries < count * 20) {
    tries++;
    const a = rnd() * Math.PI * 2;
    const r = minR + rnd() * (maxR - minR);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (avoid && avoid(x, z)) continue;
    placed.push({ x, z });
  }
  for (const p of placed) {
    await placeProp(scene, name, p.x, p.z, { height: height * (0.8 + rnd() * 0.4), rotY: rnd() * Math.PI * 2, castShadow });
  }
  return placed.length;
}

// Plantas reais nas bancadas da estufa. "spots" vem de buildBenches (posição de cada vaso).
export function buildGreenhousePlants(scene, spots) {
  return Promise.all(spots.map((s, i) => {
    // Altura e rotação variadas para não parecerem todas iguais.
    const h = 0.4 + ((i * 37) % 11) * 0.02;
    const rotY = ((i * 53) % 360) * (Math.PI / 180);
    return placeProp(scene, 'potted_plant_01', s.x, s.z, { height: h, rotY, baseY: s.y });
  }));
}

// Jardim completo: flores, grama, arbustos, samambaias, vasos perto da porta e cerca.
// Áreas da estufa e do caminho ficam livres.
export function buildGarden(scene) {
  const inGreenhouse = (x, z) => Math.abs(x) < 5 && Math.abs(z) < 5;
  const onPath = (x, z) => Math.abs(x) < 1.6 && z > 3 && z < 12;
  const avoid = (x, z) => inGreenhouse(x, z) || onPath(x, z);
  const area = { minR: 6, maxR: 24, avoid };

  const jobs = [
    scatterProp(scene, 'grass_medium_01', 35, { ...area, minR: 5, height: 0.45 }),
    scatterProp(scene, 'grass_medium_02', 25, { ...area, minR: 5, height: 0.3 }),
    scatterProp(scene, 'flower_gazania', 18, { ...area, height: 0.3 }),
    scatterProp(scene, 'flower_ursinia', 16, { ...area, height: 0.3 }),
    scatterProp(scene, 'periwinkle_plant', 14, { ...area, height: 0.25 }),
    scatterProp(scene, 'dandelion_01', 12, { ...area, height: 0.25 }),
    scatterProp(scene, 'flower_heliophila', 10, { ...area, height: 0.3 }),
    scatterProp(scene, 'shrub_01', 9, { ...area, minR: 8, height: 1.1 }),
    scatterProp(scene, 'shrub_02', 7, { ...area, minR: 8, height: 0.9 }),
    scatterProp(scene, 'shrub_03', 7, { ...area, minR: 8, height: 0.9 }),
    scatterProp(scene, 'shrub_04', 7, { ...area, minR: 8, height: 0.9 }),
    scatterProp(scene, 'fern_02', 8, { ...area, height: 0.5 }),
    scatterProp(scene, 'calathea_orbifolia_01', 6, { ...area, height: 0.4 }),
    // Árvores reais (Poly Haven). Cada tipo isolado: se um falhar, os outros seguem.
    ...[
      ['island_tree_02', 3, 8],
      ['island_tree_03', 3, 8],
      ['pine_tree_01', 3, 10],
      ['fir_sapling_medium', 4, 3.5],
    ].map(([name, count, h]) =>
      scatterProp(scene, name, count, { minR: 12, maxR: 30, avoid, height: h, castShadow: true })
        .catch((err) => console.warn(`[árvores] ${name} não carregou:`, err))),
    // Vasos com plantas na entrada.
    placeProp(scene, 'potted_plant_01', -1.6, 5.3, { height: 0.75 }),
    placeProp(scene, 'potted_plant_01', 1.6, 5.3, { height: 0.75, rotY: 1 }),
    placeProp(scene, 'planter_pot_clay', -2.3, 6.1, { height: 0.35 }),
    placeProp(scene, 'planter_pot_clay', 2.3, 6.1, { height: 0.35, rotY: 0.6 }),
    // Cerca de tela em volta do jardim.
    buildFence(scene, 'modular_chainlink_fence', { from: { x: -22, z: -20 }, to: { x: 22, z: -20 } }),
    buildFence(scene, 'modular_chainlink_fence', { from: { x: -22, z: -20 }, to: { x: -22, z: 20 } }),
    buildFence(scene, 'modular_chainlink_fence', { from: { x: 22, z: -20 }, to: { x: 22, z: 20 } }),
  ];
  return Promise.all(jobs);
}

// Cerca em linha: repete o módulo ao longo de um segmento.
export async function buildFence(scene, name, { from, to, height = 1.2 }) {
  const base = await load(name);
  const probe = base.clone(true);
  const box = new THREE.Box3().setFromObject(probe);
  const size = box.getSize(new THREE.Vector3());
  const k = height / Math.max(size.y, 0.001);
  const segLen = size.x * k;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const total = Math.hypot(dx, dz);
  const n = Math.ceil(total / segLen);
  // Rotação em Y que alinha o eixo X do módulo com o segmento from→to.
  const rotY = -Math.atan2(dz, dx);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    await placeProp(scene, name, from.x + dx * t, from.z + dz * t, { height, rotY, castShadow: true });
  }
  return n;
}
