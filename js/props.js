import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildGrass3D } from './grama3d.js';
import { addWind } from './vento.js';
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

// Árvores: folhas balançam mais; tronco e galhos só um pouco.
function prepareModel(name, root) {
  if (!name.includes('tree')) return root;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const isLeaf = /leaf|leaves|folha/i.test(m.name || '') || m.alphaTest > 0 || m.transparent;
      addWind(m, isLeaf ? { amp: 0.012, speed: 1.4 } : { amp: 0.003, speed: 1.1 });
    }
  });
  return root;
}

function load(name) {
  if (!cache.has(name)) {
    cache.set(name, loader.loadAsync(`${BASE}${name}.glb`).then((g) => prepareModel(name, g.scene)));
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

// Desenha muitas cópias do mesmo modelo com InstancedMesh: uma draw call por malha do
// modelo, em vez de uma por cópia (o jardim tem ~180 objetos; sem isso seriam ~180
// draw calls, pesado demais para o Quest).
// placements: [{ x, z, height?, scale?, rotY?, baseY? }] — mesmas regras do placeProp.
export async function instanceProp(scene, name, placements, { castShadow = false } = {}) {
  if (!placements.length) return [];
  const base = await load(name);
  base.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(base);
  if (box.isEmpty()) return [];
  const size = box.getSize(new THREE.Vector3());

  // Matriz de cada cópia (escala → assenta a base em baseY → gira → posiciona).
  const d = new THREE.Object3D();
  const matrices = placements.map((p) => {
    const k = p.height ? p.height / Math.max(size.y, 0.001) : (p.scale ?? 1);
    d.position.set(p.x, (p.baseY ?? 0) - box.min.y * k, p.z);
    d.rotation.set(0, p.rotY ?? 0, 0);
    d.scale.setScalar(k);
    d.updateMatrix();
    return d.matrix.clone();
  });

  const meshes = [];
  const m = new THREE.Matrix4();
  base.traverse((o) => {
    if (!o.isMesh) return;
    const inst = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    matrices.forEach((mat, i) => inst.setMatrixAt(i, m.multiplyMatrices(mat, o.matrixWorld)));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere(); // recorte (frustum culling) considera todas as cópias
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    meshes.push(inst);
  });
  meshes.forEach((x) => scene.add(x));
  return meshes;
}

// Sorteia posições dentro de um anel (minR..maxR), fora das áreas de "avoid".
// avoid(x, z, r) recebe o raio "r" que a cópia ocupa no chão: vários modelos da
// Poly Haven (grama, dente-de-leão...) trazem uma fileira de variações com 2–3 m de
// largura, e só o centro não basta para mantê-los fora da estufa.
function scatterSpots(count, { minR, maxR, avoid = null, height, footprint = 0, rnd = Math.random }) {
  const placed = [];
  let tries = 0;
  while (placed.length < count && tries < count * 20) {
    tries++;
    const a = rnd() * Math.PI * 2;
    const r = minR + rnd() * (maxR - minR);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = height * (0.8 + rnd() * 0.4);
    if (avoid && avoid(x, z, footprint * h)) continue;
    placed.push({ x, z, height: h, rotY: rnd() * Math.PI * 2 });
  }
  return placed;
}

// Espalha várias cópias de um objeto dentro de uma área (círculos fora de "avoid").
export async function scatterProp(scene, name, count, { castShadow = false, ...area }) {
  const base = await load(name);
  const size = new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3());
  // Raio no chão por metro de altura (metade da maior largura).
  const footprint = Math.max(size.x, size.z) / 2 / Math.max(size.y, 0.001);
  const spots = scatterSpots(count, { ...area, footprint });
  await instanceProp(scene, name, spots, { castShadow });
  return spots.length;
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
// density: fração das cópias (1 = todas; o modo leve usa menos para o Quest).
export function buildGarden(scene, { density = 1 } = {}) {
  const n = (count) => Math.max(1, Math.round(count * density));
  // r = raio que a cópia ocupa no chão (ver scatterSpots).
  const inGreenhouse = (x, z, r) => Math.abs(x) < 5 + r && Math.abs(z) < 5 + r;
  const onPath = (x, z, r) => Math.abs(x) < 1.6 + r && z > 3 - r && z < 12 + r;
  const avoid = (x, z, r = 0) => inGreenhouse(x, z, r) || onPath(x, z, r);
  const area = { minR: 6, maxR: 24, avoid };

  const jobs = [

    // Árvores reais (Poly Haven, sem simplificar a malha para não quebrar a forma).
    scatterProp(scene, 'island_tree_02', n(12), { minR: 10, maxR: 32, avoid, height: 8, castShadow: true }),
    // Vasos com plantas na entrada.
    placeProp(scene, 'potted_plant_01', -1.6, 5.3, { height: 0.75 }),
    placeProp(scene, 'potted_plant_01', 1.6, 5.3, { height: 0.75, rotY: 1 }),
    // (A cerca em volta do mapa é feita em scene/fence.js.)
  ];
  // Grama 3D densa: lâminas espalhadas pelo chão (um draw call).
  buildGrass3D(scene, avoid);
  return Promise.all(jobs);
}
