// Vaso, solo e planta (formas simples; trocadas por glTF se existirem em assets/models).
import * as THREE from 'three';
import { tryLoadModel, makeTintable, tint } from '../models.js';
import { TABLE_Y, TABLE_Z } from './room.js';

export const POT_HEIGHT = 0.2;
export const SOIL_Y = TABLE_Y + POT_HEIGHT + 0.001;

const SOIL_DRY = new THREE.Color(0xc9a178);
const SOIL_WET = new THREE.Color(0x3b2415);
const LEAF_DRY = new THREE.Color(0xa3863a);
const LEAF_HEALTHY = new THREE.Color(0x3f9b48);
const DRY_LEAF_LEVEL = 40; // abaixo disso a planta começa a murchar

export function createPlant(scene) {
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.1, POT_HEIGHT, 32),
    new THREE.MeshStandardMaterial({ color: 0xb5562b, roughness: 0.85 })
  );
  pot.position.set(0, TABLE_Y + POT_HEIGHT / 2, TABLE_Z);
  pot.castShadow = true;
  scene.add(pot);

  const soilMat = new THREE.MeshStandardMaterial({ color: SOIL_DRY, roughness: 1 });
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.125, 32), soilMat);
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(0, SOIL_Y, TABLE_Z);
  soil.receiveShadow = true;
  scene.add(soil);

  const leafMat = new THREE.MeshStandardMaterial({ color: LEAF_HEALTHY, roughness: 0.6 });
  const plant = new THREE.Group();
  plant.position.set(0, SOIL_Y, TABLE_Z);
  scene.add(plant);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f6b2f })
  );
  stem.position.y = 0.15;
  plant.add(stem);

  const simpleLeaves = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), leafMat);
    leaf.scale.set(0.11, 0.025, 0.05);
    leaf.position.set(Math.cos(angle) * 0.08, 0.22 + (i % 2) * 0.04, Math.sin(angle) * 0.08);
    leaf.rotation.y = -angle;
    leaf.castShadow = true;
    plant.add(leaf);
    simpleLeaves.push(leaf);
  }

  let plantTint = null;

  // Troca as formas simples por glTF, se existirem.
  // As folhas vêm da "Potted Plant 01" da Poly Haven na versão comprimida (Meshopt,
  // ~600 KB, ~6,5 mil triângulos de folhas): é leve, então carrega também no modo
  // leve (Quest). Nesse arquivo o vaso, as pedrinhas e o caule são uma malha só
  // ("base"); ela é descartada (senão aparece um segundo vaso em cima do vaso da
  // mesa) e o caule simples continua no lugar.
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
      // Folhas de 0,33 m de altura, começando 2 cm acima da terra (topo ~0,35 m).
      const k = 0.33 / size.y;
      const center = box.getCenter(new THREE.Vector3());
      m.scale.setScalar(k);
      m.position.set(-center.x * k, 0.02 - box.min.y * k, -center.z * k);
      plant.add(m); // dentro do grupo da planta: murcha (escala Y) junto com o caule
      simpleLeaves.forEach((l) => { l.visible = false; });
      plantTint = makeTintable(m);
    });
  }

  // Solo escurece e brilha quando molhado; folhas amarelam e a planta murcha quando seco.
  function update(moisture) {
    const wetness = moisture / 100;
    soilMat.color.copy(SOIL_DRY).lerp(SOIL_WET, wetness);
    soilMat.roughness = THREE.MathUtils.lerp(1, 0.35, wetness); // terra molhada é mais brilhante

    const health = THREE.MathUtils.clamp(moisture / DRY_LEAF_LEVEL, 0, 1);
    if (plantTint) tint(plantTint, LEAF_DRY, 1 - health);
    else leafMat.color.copy(LEAF_DRY).lerp(LEAF_HEALTHY, health);
    plant.scale.y = 0.85 + 0.15 * health;
  }

  return { pot, loadModels, update };
}
