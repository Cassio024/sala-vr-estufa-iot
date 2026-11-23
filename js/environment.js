import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { leafTextures, terracottaTextures, realMap } from './textures.js';

THREE.Cache.enabled = true;

// Direção do sol: a mesma luz direcional da estufa usa esta posição.
// Sol baixo (≈ 30° acima do horizonte): luz quente e sombras longas.
export const SUN_POSITION = new THREE.Vector3(7, 3.2, 3.5);

// Porta da estufa (fica no centro da parede da frente, z = +size/2).
export const DOOR_W = 1.2;
export const DOOR_H = 2.2;

// ---------------------------------------------------------------------------
// Renderer: cores naturais e sombras suaves
// ---------------------------------------------------------------------------
export function setupRenderer(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

// ---------------------------------------------------------------------------
// Céu 3D procedural (atmosfera real, não uma imagem). Fica bem longe da
// câmera e acompanha a direção do sol.
// ---------------------------------------------------------------------------
export function buildSky(scene) {
  const sky = new Sky();
  sky.scale.setScalar(60); // dentro do far da câmera (80)
  const u = sky.material.uniforms;
  u.turbidity.value = 5;   // mais névoa: céu mais suave e horizonte quente
  u.rayleigh.value = 2.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(SUN_POSITION).normalize();
  scene.add(sky);
  return sky;
}

// ---------------------------------------------------------------------------
// HDRI: usado só para reflexos e luz ambiente (não aparece como fundo).
// Se o arquivo não existir, usa um ambiente interno (RoomEnvironment).
// ---------------------------------------------------------------------------
export function setupEnvironment(renderer, scene, hdriUrl = 'assets/hdri/estufa.hdr') {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;

  new RGBELoader().load(
    hdriUrl,
    (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
    },
    undefined,
    () => console.info(`[ambiente] ${hdriUrl} não encontrado — usando ambiente padrão.`)
  );

  buildSky(scene);
}

// Chão de grama verde: cor gerada por código (sempre verde) + relevo real
// (normal map da textura CC0 em assets/textures/grama/normal.jpg).
function grassGroundMaterial(repeat) {
  // Cor verde gerada (a textura real é marrom); relevo e rugosidade são reais.
  const mat = new THREE.MeshStandardMaterial({ map: grassMap(repeat), roughness: 1 });
  mat.normalMap = realMap('assets/textures/grama/normal.jpg', { repeat, srgb: false });
  mat.normalScale.set(0.6, 0.6);
  mat.roughnessMap = realMap('assets/textures/grama/roughness.jpg', { repeat, srgb: false });
  return mat;
}

// Textura de grama feita por código (manchas e folhas em vários tons de verde).
export function grassMap(repeat = [20, 20]) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4d7d3a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const hue = 85 + Math.random() * 30;
    g.fillStyle = `hsla(${hue}, 45%, ${22 + Math.random() * 22}%, ${0.25 + Math.random() * 0.35})`;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 1 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Árvores e arbustos 3D em volta da estufa (InstancedMesh para ficar leve).
// Copa irregular: esfera com ruído, para parecer folhagem e não um cubo facetado.
function crownGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const v = new THREE.Vector3();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + 0.14 * Math.sin(v.x * 3.1 + v.z * 1.7)
      + 0.10 * Math.cos(v.y * 4.3 - v.x * 2.2)
      + 0.06 * Math.sin(v.z * 7.9 + v.y * 5.1);
    v.multiplyScalar(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildOutdoorScenery(scene, { count = 70, minR = 12, maxR = 36 } = {}) {
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.2, 1.6, 8);
  trunkGeo.translate(0, 0.8, 0);
  const crownGeo = crownGeometry();
  const spots = []; // sombra de contato no chão
  const leaf = leafTextures();
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    pbrMaterial('casca', { repeat: [1, 2], color: 0x5b3b22, roughness: 0.95 }),
    count);
  const crowns = new THREE.InstancedMesh(
    crownGeo,
    new THREE.MeshStandardMaterial({ map: leaf.map, bumpMap: leaf.bumpMap, bumpScale: 1, roughness: 0.85 }),
    count);

  const d = new THREE.Object3D();
  const col = new THREE.Color();
  const trees = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.8 + Math.random() * 1.2;
    const phase = Math.random() * Math.PI * 2;
    spots.push({ x, y: 0, z, r: 0.85 * s });
    trees.push({ x, z, s, phase });

    d.position.set(x, 0, z);
    d.rotation.set(0, Math.random() * Math.PI * 2, 0);
    d.scale.setScalar(s);
    d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);

    crowns.setColorAt(i, col.setHSL(0.25 + Math.random() * 0.1, 0.45, 0.3 + Math.random() * 0.14));
  }
  for (const m of [trunks, crowns]) {
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  // Copas balançando devagar com o vento (só a copa se move, o tronco fica parado).
  const sway = new THREE.Object3D();
  function update(t) {
    trees.forEach((tr, i) => {
      const wind = Math.sin(t * 0.8 + tr.phase) * 0.035 * tr.s + Math.sin(t * 2.1 + tr.phase * 2) * 0.01 * tr.s;
      sway.position.set(tr.x + wind, 2.3 * tr.s, tr.z + wind * 0.5);
      sway.rotation.set(0, 0, 0);
      sway.scale.set(1.3 * tr.s, 1.5 * tr.s, 1.3 * tr.s);
      sway.updateMatrix();
      crowns.setMatrixAt(i, sway.matrix);
    });
    crowns.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { spots, update };
}

// ---------------------------------------------------------------------------
// Materiais PBR
// Procura assets/textures/<nome>/color.jpg, normal.jpg e roughness.jpg.
// Enquanto não existirem, usa a cor sólida ou uma textura gerada por código.
// ---------------------------------------------------------------------------
const texLoader = new THREE.TextureLoader();

function proceduralMap(kind, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');

  if (kind === 'wood') {
    g.fillStyle = '#8b5a2b';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * 512;
      g.strokeStyle = `rgba(${(50 + Math.random() * 40) | 0},${(25 + Math.random() * 25) | 0},10,${0.08 + Math.random() * 0.18})`;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + Math.random() * 12 - 6, 340, y + Math.random() * 12 - 6, 512, y);
      g.stroke();
    }
  } else {
    g.fillStyle = '#9aa0a6';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 40, 20 + Math.random() * 40);
    }
    g.strokeStyle = '#5d6268';
    g.lineWidth = 6;
    g.strokeRect(0, 0, 512, 512);
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function pbrMaterial(name, { repeat = [1, 1], color = 0xffffff, roughness = 0.8, metalness = 0, fallback = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (fallback) mat.map = proceduralMap(fallback, repeat);

  const base = `assets/textures/${name}/`;
  const load = (file, slot, srgb) =>
    texLoader.load(
      base + file,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(...repeat);
        t.anisotropy = 4;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        mat[slot] = t;
        if (slot === 'map') mat.color.set(0xffffff);
        if (slot === 'roughnessMap') mat.roughness = 1;
        mat.needsUpdate = true;
      },
      undefined,
      () => {} // arquivo ausente: mantém o fallback
    );
  load('color.jpg', 'map', true);
  load('normal.jpg', 'normalMap', false);
  load('roughness.jpg', 'roughnessMap', false);
  return mat;
}

// ---------------------------------------------------------------------------
// Estufa: piso, vidro, estrutura metálica, telhado, luz do sol
// ---------------------------------------------------------------------------
export function buildGreenhouse(scene, { size = 8, height = 3, shadowMapSize = 4096 } = {}) {
  const half = size / 2;

  // Luzes (uma única com sombra, pensando no headset standalone).
  // Fim de tarde: céu azul-claro em cima, chão quente embaixo, sol laranja baixo.
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5340, 0.75));
  const sun = new THREE.DirectionalLight(0xffa35c, 3.6);
  sun.position.copy(SUN_POSITION);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize); // quality.js: 1024 no headset standalone
  const sc = sun.shadow.camera;
  sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3; // borda da sombra mais suave (com PCFSoft)
  scene.add(sun);

  // Piso e terreno externo
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    pbrMaterial('pedras', { repeat: [size * 2, size * 2], color: 0xc9c7c0, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    grassGroundMaterial([24, 24])
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // Vidro (transparência simples: bem mais leve que "transmission" em VR)
  const glass = new THREE.MeshStandardMaterial({
    color: 0xcfeaf5, transparent: true, opacity: 0.16, roughness: 0.05,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    map: realMap('assets/textures/metal/color.jpg'),
    normalMap: realMap('assets/textures/metal/normal.jpg', { srgb: false }),
    roughnessMap: realMap('assets/textures/metal/roughness.jpg', { srgb: false }),
    metalness: 0.8,
    roughness: 1,
  });

  // Paredes laterais e de trás inteiras.
  const wallGeo = new THREE.PlaneGeometry(size, height);
  for (const [x, z, ry] of [[0, -half, 0], [-half, 0, Math.PI / 2], [half, 0, Math.PI / 2]]) {
    const w = new THREE.Mesh(wallGeo, glass);
    w.position.set(x, height / 2, z);
    w.rotation.y = ry;
    scene.add(w);
  }
  // Parede da frente com a porta: dois painéis de vidro e um painel em cima da porta.
  const sideW = half - DOOR_W / 2;
  const sideGeo = new THREE.PlaneGeometry(sideW, height);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(sideGeo, glass);
    w.position.set(sx * (half + DOOR_W / 2) / 2, height / 2, half);
    scene.add(w);
  }
  const lintel = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, height - DOOR_H), glass);
  lintel.position.set(0, DOOR_H + (height - DOOR_H) / 2, half);
  scene.add(lintel);

  // Batentes (moldura metálica) e verga da porta.
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, DOOR_H, 0.08), frameMat);
    post.position.set(sx * DOOR_W / 2, DOOR_H / 2, half);
    post.castShadow = true;
    scene.add(post);
  }
  const doorHead = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.12, 0.06, 0.08), frameMat);
  doorHead.position.set(0, DOOR_H, half);
  doorHead.castShadow = true;
  scene.add(doorHead);

  // Folha da porta: gira em torno da dobradiça (borda esquerda). A maçaneta fica na borda direita.
  const door = new THREE.Group();
  door.position.set(-DOOR_W / 2, 0, half);
  const leafH = DOOR_H - 0.03;
  const leafGlass = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - 0.04, leafH - 0.06, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xcfeaf5, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false })
  );
  leafGlass.position.set(DOOR_W / 2, leafH / 2, 0);
  door.add(leafGlass);
  // Moldura da folha (4 barras finas).
  for (const [w, h, x, y] of [
    [DOOR_W, 0.04, DOOR_W / 2, 0.02], [DOOR_W, 0.04, DOOR_W / 2, leafH - 0.02],
    [0.04, leafH, 0.02, leafH / 2], [0.04, leafH, DOOR_W - 0.02, leafH / 2],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), frameMat);
    bar.position.set(x, y, 0);
    bar.castShadow = true;
    door.add(bar);
  }
  // Maçaneta (barra vertical) do lado de dentro e de fora.
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.36, 12),
    new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.9, roughness: 0.25 })
  );
  handle.position.set(DOOR_W - 0.14, 1.0, 0.04);
  door.add(handle);
  scene.add(door);

  // Telhado em duas águas + empenas triangulares
  const slope = Math.atan2(1, half);
  const roofGeo = new THREE.PlaneGeometry(size, Math.hypot(half, 1));
  const roofA = new THREE.Mesh(roofGeo, glass);
  roofA.rotation.x = -Math.PI / 2 + slope;
  roofA.position.set(0, height + 0.5, half / 2);
  const roofB = new THREE.Mesh(roofGeo, glass);
  roofB.rotation.x = -Math.PI / 2 - slope;
  roofB.position.set(0, height + 0.5, -half / 2);
  scene.add(roofA, roofB);

  const tri = new THREE.Shape();
  tri.moveTo(-half, 0); tri.lineTo(half, 0); tri.lineTo(0, 1);
  const gableGeo = new THREE.ShapeGeometry(tri);
  for (const sx of [-1, 1]) {
    const g = new THREE.Mesh(gableGeo, glass);
    g.rotation.y = Math.PI / 2;
    g.position.set(sx * half, height, 0);
    scene.add(g);
  }

  // Estrutura: postes (instanciados), travessas e cumeeira
  const posts = [];
  for (const t of [-half, -half / 2, 0, half / 2, half]) posts.push([-half, t], [half, t]);
  for (const t of [-half / 2, 0, half / 2]) posts.push([t, -half], [t, half]);
  // Sem poste no vão da porta.
  const doorPosts = posts.filter(([x, z]) => !(z === half && Math.abs(x) < DOOR_W / 2));
  posts.length = 0;
  posts.push(...doorPosts);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, height, 0.07), frameMat, posts.length);
  const d = new THREE.Object3D();
  posts.forEach(([x, z], i) => {
    d.position.set(x, height / 2, z);
    d.updateMatrix();
    postMesh.setMatrixAt(i, d.matrix);
  });
  postMesh.castShadow = true;
  scene.add(postMesh);

  const rails = [
    [size, 0.05, 0.05, 0, height, -half], [size, 0.05, 0.05, 0, height, half],
    [0.05, 0.05, size, -half, height, 0], [0.05, 0.05, size, half, height, 0],
    [size, 0.07, 0.07, 0, height + 1, 0], // cumeeira
  ];
  for (const [w, h, dd, x, y, z] of rails) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), frameMat);
    r.position.set(x, y, z);
    r.castShadow = true;
    scene.add(r);
  }

  // Embasamento de concreto em volta da estufa (com vão na porta).
  const curbH = 0.3;
  const curbT = 0.25;
  const curbMat = pbrMaterial('concreto', { repeat: [4, 1], color: 0xe2e0da, roughness: 0.9 });
  const addCurb = (w, h, d, x, y, z) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), curbMat);
    c.position.set(x, y, z);
    c.castShadow = true;
    c.receiveShadow = true;
    scene.add(c);
  };
  addCurb(size + curbT * 2, curbH, curbT, 0, curbH / 2, -half - curbT / 2); // fundo
  addCurb(curbT, curbH, size, -half - curbT / 2, curbH / 2, 0);          // esquerda
  addCurb(curbT, curbH, size, half + curbT / 2, curbH / 2, 0);           // direita
  const frontW = half - DOOR_W / 2;                                       // frente, com vão da porta
  for (const sx of [-1, 1]) {
    addCurb(frontW, curbH, curbT, sx * (half + DOOR_W / 2) / 2, curbH / 2, half + curbT / 2);
  }

  return { size, height, floor, ground, door, roofY: (z) => height + 1 - Math.abs(z) / half };
}

// ---------------------------------------------------------------------------
// Bancadas com várias plantas (InstancedMesh: poucos draw calls)
// ---------------------------------------------------------------------------
export function buildBenches(scene, size = 8) {
  const wood = pbrMaterial('madeira', { repeat: [1, 3], fallback: 'wood', roughness: 0.7 });
  const benchLen = size - 1.2;
  const topY = 0.8;

  for (const side of [-1, 1]) {
    const x = side * (size / 2 - 0.7);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, benchLen), wood);
    top.position.set(x, topY, 0);
    top.castShadow = top.receiveShadow = true;
    scene.add(top);
    for (const [lx, lz] of [[-0.3, -1], [0.3, -1], [-0.3, 1], [0.3, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, topY, 0.05), wood);
      leg.position.set(x + lx, topY / 2, lz * (benchLen / 2 - 0.1));
      leg.castShadow = true;
      scene.add(leg);
    }
  }

  const perSide = 8;
  const total = perSide * 2;
  const spots = []; // posições dos vasos, para as sombras de contato
  const pots = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.07, 0.05, 0.12, 16),
    new THREE.MeshStandardMaterial({ map: terracottaTextures().map, roughness: 0.85 }), total);
  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f6b2f }), total);
  const leaves = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), total * 6);

  const d = new THREE.Object3D();
  const col = new THREE.Color();
  const base = topY + 0.025 + 0.12; // topo do vaso
  let n = 0;
  let leafN = 0;

  for (const side of [-1, 1]) {
    const px = side * (size / 2 - 0.7);
    for (let k = 0; k < perSide; k++) {
      const pz = -2.6 + k * 0.75;
      const s = 0.8 + Math.random() * 0.6;
      spots.push({ x: px, y: topY + 0.005, z: pz, r: 0.1 });

      d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
      d.position.set(px, topY + 0.025 + 0.06, pz);
      d.updateMatrix(); pots.setMatrixAt(n, d.matrix);

      d.scale.set(1, s, 1);
      d.position.set(px, base + 0.1 * s, pz);
      d.updateMatrix(); stems.setMatrixAt(n, d.matrix);

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        d.position.set(px + Math.cos(a) * 0.05 * s, base + 0.15 * s + (i % 2) * 0.03, pz + Math.sin(a) * 0.05 * s);
        d.rotation.set(0, -a, 0);
        d.scale.set(0.08 * s, 0.02 * s, 0.035 * s);
        d.updateMatrix();
        leaves.setMatrixAt(leafN, d.matrix);
        leaves.setColorAt(leafN, col.setHSL(0.28 + Math.random() * 0.06, 0.5, 0.28 + Math.random() * 0.14));
        leafN++;
      }
      n++;
    }
  }
  // As plantas das bancadas são modelos reais (ver props.js > buildGreenhousePlants).
  // As instâncias procedurais ficam fora da cena; só as posições são usadas.
  return spots;
}

// ---------------------------------------------------------------------------
// Luminária pendurada sobre a mesa
// ---------------------------------------------------------------------------
export function buildLamp(scene, x, z, ceilingY, y = 2.3) {
  const lamp = new THREE.Group();
  lamp.position.set(x, 0, z);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, ceilingY - y, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111 }));
  cord.position.y = (ceilingY + y) / 2;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.18, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2f3a45, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
  shade.position.y = y;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c4 }));
  bulb.position.y = y - 0.05;
  const light = new THREE.PointLight(0xfff0cf, 4, 5, 2);
  light.position.y = y - 0.1;

  lamp.add(cord, shade, bulb, light);
  scene.add(lamp);
  return lamp;
}
