// Vaso, solo e planta da mesa principal.
//   Vaso de barro com borda e pratinho; terra com pedrinhas; caule curvo com flores.
//   As folhas vêm de um glTF da Poly Haven (ver loadModels); sem ele ficam folhas simples.
//   A planta reage à umidade: seca = murcha e amarela; ENCHARCADA (água em excesso)
//   = água empoçada na terra e no pratinho, e as folhas também amarelam um pouco.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tryLoadModel, makeTintable, tint } from '../models.js';
import { terracottaTextures, realMap } from '../textures.js';
import { TABLE_Y, TABLE_Z } from './room.js';

export const POT_HEIGHT = 0.2;
export const SOIL_Y = TABLE_Y + POT_HEIGHT + 0.001;
// Medidas usadas pelas fitas da "planta em análise" (main.js).
export const POT_RIM = { height: POT_HEIGHT + 0.012, radius: 0.145 };
export const SAUCER = { radius: 0.12, height: 0.014 };

const SOIL_DRY = new THREE.Color(0xc9a178);
const SOIL_WET = new THREE.Color(0x3b2415);
const LEAF_DRY = new THREE.Color(0xa3863a);
const LEAF_HEALTHY = new THREE.Color(0x3f9b48);
const PETAL = new THREE.Color(0xf472b6);
const PETAL_DRY = new THREE.Color(0x8b6b4a);
const DRY_LEAF_LEVEL = 40; // abaixo disso a planta começa a murchar
const EXCESS_START = 85; // acima disso aparece água empoçada

// Aleatório previsível (as pedrinhas ficam sempre no mesmo lugar).
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function curveTube(points, radius, segments = 16) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), segments, radius, 6, false);
}

export function createPlant(scene) {
  // ---------------------------------------------------------------------------
  // Vaso de barro com borda, e o pratinho embaixo
  // ---------------------------------------------------------------------------
  const terracotta = terracottaTextures().map;
  const potMat = new THREE.MeshStandardMaterial({ map: terracotta, roughness: 0.85 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, POT_HEIGHT, 32), potMat);
  pot.position.set(0, TABLE_Y + POT_HEIGHT / 2, TABLE_Z);
  pot.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.133, 0.012, 10, 40), potMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = POT_HEIGHT / 2;
  rim.castShadow = true;
  pot.add(rim); // filho do vaso: a mira/raio que acerta a borda acerta o vaso
  scene.add(pot);

  const saucer = new THREE.Mesh(
    new THREE.CylinderGeometry(SAUCER.radius, SAUCER.radius - 0.01, SAUCER.height, 32),
    new THREE.MeshStandardMaterial({ map: terracotta, color: 0xd6c3b8, roughness: 0.85 }),
  );
  saucer.position.set(0, TABLE_Y + SAUCER.height / 2, TABLE_Z);
  saucer.receiveShadow = true;
  scene.add(saucer);

  // ---------------------------------------------------------------------------
  // Terra, pedrinhas e água empoçada (excesso)
  // ---------------------------------------------------------------------------
  // Terra real (lama CC0); a cor vai de seca a molhada multiplicando a textura.
  const soilMat = new THREE.MeshStandardMaterial({
    color: SOIL_DRY,
    map: realMap('assets/textures/terra/color.jpg'),
    normalMap: realMap('assets/textures/terra/normal.jpg', { srgb: false }),
    roughness: 1,
  });
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.125, 32), soilMat);
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(0, SOIL_Y, TABLE_Z);
  soil.receiveShadow = true;
  scene.add(soil);

  const rnd = seeded(7);
  const pebbleGeos = [];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 40 && pebbleGeos.length < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.035 + rnd() * 0.075;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - 0.06, z - 0.06) < 0.03 || Math.hypot(x - 0.05, z - 0.05) < 0.03) continue; // lugar do sensor
    const s = 0.005 + rnd() * 0.006;
    const g = new THREE.DodecahedronGeometry(1, 0);
    g.applyMatrix4(m4.compose(
      new THREE.Vector3(x, SOIL_Y + s * 0.3, TABLE_Z + z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)),
      new THREE.Vector3(s, s * 0.6, s),
    ));
    pebbleGeos.push(g);
  }
  const pebbles = new THREE.Mesh(mergeGeometries(pebbleGeos), new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.8 }));
  scene.add(pebbles);

  const waterMat = () => new THREE.MeshStandardMaterial({
    color: 0x7cc4f0, transparent: true, opacity: 0, roughness: 0.05, metalness: 0.2, depthWrite: false,
  });
  const soilWater = new THREE.Mesh(new THREE.CircleGeometry(0.122, 32), waterMat());
  soilWater.rotation.x = -Math.PI / 2;
  soilWater.position.set(0, SOIL_Y + 0.003, TABLE_Z);
  soilWater.visible = false;
  const saucerWater = new THREE.Mesh(new THREE.RingGeometry(0.1, SAUCER.radius - 0.004, 32), waterMat());
  saucerWater.rotation.x = -Math.PI / 2;
  saucerWater.position.set(0, TABLE_Y + SAUCER.height - 0.002, TABLE_Z);
  saucerWater.visible = false;
  scene.add(soilWater, saucerWater);

  // ---------------------------------------------------------------------------
  // Planta: caule curvo, galhinhos com flores e folhas
  // ---------------------------------------------------------------------------
  const plant = new THREE.Group();
  plant.position.set(0, SOIL_Y, TABLE_Z);
  scene.add(plant);

  const flowerSpots = [
    [0.075, 0.31, 0.02], [-0.055, 0.335, 0.06], [-0.045, 0.3, -0.07], [0.03, 0.355, -0.05], [0.0, 0.375, 0.025],
  ];
  const stemGeos = [curveTube([[0, -0.03, 0], [0.004, 0.08, 0.002], [-0.006, 0.18, 0.004], [0.003, 0.28, -0.003]], 0.0055, 24)];
  flowerSpots.forEach(([x, y, z], i) => {
    const from = [0.0, 0.2 + i * 0.012, 0.0];
    const mid = [x * 0.5, (from[1] + y) / 2 + 0.03, z * 0.5];
    stemGeos.push(curveTube([from, mid, [x, y, z]], 0.0025, 10));
  });
  const stem = new THREE.Mesh(mergeGeometries(stemGeos), new THREE.MeshStandardMaterial({ color: 0x3d6b2a, roughness: 0.7 }));
  stem.castShadow = true;
  plant.add(stem);

  // Flores: 6 pétalas + miolo, todas numa malha só (pétalas) e outra (miolos).
  const petalGeos = [];
  const centerGeos = [];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const qp = new THREE.Quaternion();
  for (const [x, y, z] of flowerSpots) {
    const facing = new THREE.Vector3(x, 1.4, z).normalize(); // olha para cima e para fora
    q.setFromUnitVectors(up, facing);
    const at = new THREE.Vector3(x, y, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const local = new THREE.Vector3(Math.cos(a) * 0.014, 0.002, Math.sin(a) * 0.014).applyQuaternion(q);
      qp.setFromEuler(new THREE.Euler(0, -a, 0.25)).premultiply(q);
      const g = new THREE.SphereGeometry(1, 8, 6);
      g.applyMatrix4(m4.compose(at.clone().add(local), qp, new THREE.Vector3(0.016, 0.0035, 0.008)));
      petalGeos.push(g);
    }
    const c = new THREE.SphereGeometry(0.0065, 8, 6);
    c.applyMatrix4(m4.compose(at.clone().addScaledVector(facing, 0.003), q, new THREE.Vector3(1, 0.7, 1)));
    centerGeos.push(c);
  }
  const petalMat = new THREE.MeshStandardMaterial({ color: PETAL, roughness: 0.55, side: THREE.DoubleSide });
  const flowers = new THREE.Group();
  flowers.add(
    new THREE.Mesh(mergeGeometries(petalGeos), petalMat),
    new THREE.Mesh(mergeGeometries(centerGeos), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 })),
  );
  plant.add(flowers);

  // Folhas simples (até o glTF carregar, ou se ele faltar).
  const leafMat = new THREE.MeshStandardMaterial({ color: LEAF_HEALTHY, roughness: 0.6 });
  const leafGeo = new THREE.SphereGeometry(1, 16, 12);
  const simpleLeaves = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.scale.set(0.09, 0.02, 0.04);
    leaf.position.set(Math.cos(angle) * 0.07, 0.17 + (i % 3) * 0.04, Math.sin(angle) * 0.07);
    leaf.rotation.set(0, -angle, 0.3);
    leaf.castShadow = true;
    plant.add(leaf);
    simpleLeaves.push(leaf);
  }

  let plantTint = null;

  // Troca as formas simples por glTF, se existirem.
  // As folhas vêm da "Potted Plant 01" da Poly Haven na versão comprimida (Meshopt):
  // é leve, então carrega também no modo leve (Quest). Nesse arquivo o vaso, as
  // pedrinhas e o caule são uma malha só ("stem"/"base"); ela é descartada (senão
  // aparece um segundo vaso em cima do vaso da mesa) e o caule daqui fica no lugar.
  function loadModels() {
    tryLoadModel('assets/models/vaso.glb', { height: POT_HEIGHT }).then((m) => {
      if (!m) return;
      pot.visible = false;
      m.position.set(0, TABLE_Y, TABLE_Z);
      scene.add(m);
    });
    tryLoadModel('assets/models/polyhaven/potted_plant_01.glb').then((m) => {
      if (!m) return;
      const drop = [];
      m.traverse((o) => { if (o.isMesh && !/leaves/i.test(o.name)) drop.push(o); });
      drop.forEach((o) => o.removeFromParent());
      const box = new THREE.Box3().setFromObject(m);
      if (box.isEmpty()) return; // arquivo diferente do esperado: fica a planta simples
      const size = box.getSize(new THREE.Vector3());
      // Folhas de 0,31 m de altura, começando 3 cm acima da terra; as flores ficam por cima.
      const k = 0.31 / size.y;
      const center = box.getCenter(new THREE.Vector3());
      m.scale.setScalar(k);
      m.position.set(-center.x * k, 0.03 - box.min.y * k, -center.z * k);
      plant.add(m); // dentro do grupo da planta: murcha (escala Y) junto com o caule
      simpleLeaves.forEach((l) => { l.visible = false; });
      plantTint = makeTintable(m);
    });
  }

  /**
   * Solo escurece e brilha quando molhado; folhas amarelam e a planta murcha quando seco.
   * Acima de 85% (encharcado) a água empoça na terra e no pratinho e as folhas
   * amarelam um pouco: água demais também faz mal (a raiz fica sem ar).
   */
  function update(moisture) {
    const wetness = moisture / 100;
    soilMat.color.copy(SOIL_DRY).lerp(SOIL_WET, wetness);
    soilMat.roughness = THREE.MathUtils.lerp(1, 0.35, wetness); // terra molhada é mais brilhante

    const over = THREE.MathUtils.clamp((moisture - EXCESS_START) / (100 - EXCESS_START), 0, 1);
    soilWater.visible = saucerWater.visible = over > 0;
    soilWater.material.opacity = 0.55 * over;
    saucerWater.material.opacity = 0.8 * over;

    const health = THREE.MathUtils.clamp(moisture / DRY_LEAF_LEVEL, 0, 1);
    const yellow = Math.max(1 - health, 0.35 * over);
    if (plantTint) tint(plantTint, LEAF_DRY, yellow);
    else leafMat.color.copy(LEAF_HEALTHY).lerp(LEAF_DRY, yellow);
    petalMat.color.copy(PETAL).lerp(PETAL_DRY, yellow);
    plant.scale.y = 0.85 + 0.15 * health;
  }

  return { pot, saucer, loadModels, update };
}
