import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { SoilMoistureSensor, ProximitySensor, IrrigationController } from './sensors.js';

// ---------------------------------------------------------------------------
// Renderer e WebXR
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);
document.getElementById('app').appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);

// "Corpo" do usuário dentro da sala (na VR o headset assume a posição da cabeça).
const dolly = new THREE.Group();
dolly.position.set(0, 0, 1.2);
scene.add(dolly);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0, 1.6, 0);
dolly.add(camera);

// ---------------------------------------------------------------------------
// Luz e sala
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(2, 4, 2);
sun.castShadow = true;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0x2b2b33 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const walls = new THREE.Mesh(
  new THREE.BoxGeometry(10, 3, 10),
  new THREE.MeshStandardMaterial({ color: 0x1d2330, side: THREE.BackSide })
);
walls.position.y = 1.5;
scene.add(walls);

// Mesa
const TABLE_Y = 0.78;   // altura da superfície da mesa
const TABLE_Z = -1;
const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
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

// ---------------------------------------------------------------------------
// Vaso, solo e planta
// ---------------------------------------------------------------------------
const POT_HEIGHT = 0.2;
const pot = new THREE.Mesh(
  new THREE.CylinderGeometry(0.13, 0.1, POT_HEIGHT, 32),
  new THREE.MeshStandardMaterial({ color: 0xb5562b })
);
pot.position.set(0, TABLE_Y + POT_HEIGHT / 2, TABLE_Z);
pot.castShadow = true;
scene.add(pot);

const SOIL_Y = TABLE_Y + POT_HEIGHT + 0.001;
const SOIL_DRY = new THREE.Color(0xc9a178);
const SOIL_WET = new THREE.Color(0x3b2415);
const soilMat = new THREE.MeshStandardMaterial({ color: SOIL_DRY });
const soil = new THREE.Mesh(new THREE.CircleGeometry(0.125, 32), soilMat);
soil.rotation.x = -Math.PI / 2;
soil.position.set(0, SOIL_Y, TABLE_Z);
scene.add(soil);

const LEAF_DRY = new THREE.Color(0xa3863a);
const LEAF_HEALTHY = new THREE.Color(0x3f9b48);
const leafMat = new THREE.MeshStandardMaterial({ color: LEAF_HEALTHY });
const plant = new THREE.Group();
plant.position.set(0, SOIL_Y, TABLE_Z);
scene.add(plant);

const stem = new THREE.Mesh(
  new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8),
  new THREE.MeshStandardMaterial({ color: 0x2f6b2f })
);
stem.position.y = 0.15;
plant.add(stem);

for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), leafMat);
  leaf.scale.set(0.11, 0.025, 0.05);
  leaf.position.set(Math.cos(angle) * 0.08, 0.22 + (i % 2) * 0.04, Math.sin(angle) * 0.08);
  leaf.rotation.y = -angle;
  leaf.castShadow = true;
  plant.add(leaf);
}

// ---------------------------------------------------------------------------
// Dispositivos IoT (visuais)
// ---------------------------------------------------------------------------
// Sensor de umidade enterrado no solo, com LED de status.
const probe = new THREE.Mesh(
  new THREE.BoxGeometry(0.02, 0.18, 0.02),
  new THREE.MeshStandardMaterial({ color: 0x9ca3af })
);
probe.position.set(0.18, SOIL_Y + 0.09, TABLE_Z + 0.05);
scene.add(probe);
const probeLed = new THREE.Mesh(
  new THREE.SphereGeometry(0.012, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x22c55e })
);
probeLed.position.set(0.18, SOIL_Y + 0.19, TABLE_Z + 0.05);
scene.add(probeLed);

// Bomba d'água, com LED e tubo até o vaso.
const PUMP_POS = new THREE.Vector3(-0.5, TABLE_Y + 0.07, TABLE_Z);
const pump = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.14, 0.12),
  new THREE.MeshStandardMaterial({ color: 0x374151 })
);
pump.position.copy(PUMP_POS);
pump.castShadow = true;
scene.add(pump);
const pumpLed = new THREE.Mesh(
  new THREE.SphereGeometry(0.012, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x1f2937 })
);
pumpLed.position.set(PUMP_POS.x, PUMP_POS.y + 0.04, PUMP_POS.z + 0.061);
scene.add(pumpLed);

const SPOUT = new THREE.Vector3(-0.06, TABLE_Y + 0.33, TABLE_Z);
const tubeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(PUMP_POS.x, PUMP_POS.y + 0.07, PUMP_POS.z),
  new THREE.Vector3(-0.35, TABLE_Y + 0.28, TABLE_Z),
  new THREE.Vector3(-0.18, TABLE_Y + 0.34, TABLE_Z),
  SPOUT,
]);
const tube = new THREE.Mesh(
  new THREE.TubeGeometry(tubeCurve, 32, 0.012, 8, false),
  new THREE.MeshStandardMaterial({ color: 0x6b7280 })
);
scene.add(tube);

// Botão de modo (auto/manual) — apertar com o controle perto dele.
const MODE_BUTTON_POS = new THREE.Vector3(0.55, TABLE_Y + 0.02, TABLE_Z);
const modeButton = new THREE.Mesh(
  new THREE.BoxGeometry(0.1, 0.04, 0.1),
  new THREE.MeshStandardMaterial({ color: 0x4b5563 })
);
modeButton.position.copy(MODE_BUTTON_POS);
scene.add(modeButton);
const modeLed = new THREE.Mesh(
  new THREE.SphereGeometry(0.012, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x22c55e })
);
modeLed.position.set(MODE_BUTTON_POS.x, MODE_BUTTON_POS.y + 0.03, MODE_BUTTON_POS.z);
scene.add(modeLed);

// Sensor de proximidade — a área azul mostra o raio de detecção.
const PROX_POS = new THREE.Vector3(0.35, TABLE_Y + 0.25, TABLE_Z);
const proximity = new ProximitySensor(PROX_POS, 0.22);
const proxCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.025, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x22d3ee })
);
proxCore.position.copy(PROX_POS);
scene.add(proxCore);
const proxHalo = new THREE.Mesh(
  new THREE.SphereGeometry(proximity.range, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.1, depthWrite: false })
);
proxHalo.position.copy(PROX_POS);
scene.add(proxHalo);

// Gotas de água (pool reutilizável).
const dropGeo = new THREE.SphereGeometry(0.008, 8, 6);
const dropMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
const drops = [];
for (let i = 0; i < 30; i++) {
  const mesh = new THREE.Mesh(dropGeo, dropMat);
  mesh.visible = false;
  scene.add(mesh);
  drops.push({ mesh, vy: 0, alive: false });
}
let spawnTimer = 0;

function updateDrops(dt, pumping) {
  if (pumping) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 0.06;
      const drop = drops.find((d) => !d.alive);
      if (drop) {
        drop.alive = true;
        drop.vy = 0;
        drop.mesh.visible = true;
        drop.mesh.position.copy(SPOUT);
      }
    }
  }
  for (const drop of drops) {
    if (!drop.alive) continue;
    drop.vy -= 4 * dt;
    drop.mesh.position.y += drop.vy * dt;
    if (drop.mesh.position.y <= SOIL_Y) {
      drop.alive = false;
      drop.mesh.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Painel de status (canvas como textura)
// ---------------------------------------------------------------------------
const panelCanvas = document.createElement('canvas');
panelCanvas.width = 1024;
panelCanvas.height = 640;
const pctx = panelCanvas.getContext('2d');
const panelTexture = new THREE.CanvasTexture(panelCanvas);
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.2, 0.75),
  new THREE.MeshBasicMaterial({ map: panelTexture })
);
panel.position.set(0, 1.5, TABLE_Z - 0.55);
scene.add(panel);

function drawPanel(moisture, pumpOn, mode, near, log) {
  pctx.fillStyle = '#111827';
  pctx.fillRect(0, 0, panelCanvas.width, panelCanvas.height);

  pctx.fillStyle = '#e5e7eb';
  pctx.font = 'bold 56px sans-serif';
  pctx.fillText('Estufa IoT - Sala VR', 40, 70);

  pctx.font = '46px sans-serif';
  pctx.fillStyle = moisture < 35 ? '#f87171' : '#34d399';
  pctx.fillText(`Umidade do solo: ${moisture.toFixed(0)}%`, 40, 150);

  pctx.fillStyle = '#e5e7eb';
  pctx.fillText(`Bomba: ${pumpOn ? 'LIGADA' : 'desligada'}`, 40, 210);
  pctx.fillText(`Modo: ${mode === 'auto' ? 'automático' : 'manual'}`, 40, 270);
  pctx.fillText(`Proximidade: ${near ? 'mão detectada' : 'livre'}`, 40, 330);

  pctx.font = '32px sans-serif';
  pctx.fillStyle = '#9ca3af';
  log.forEach((line, i) => pctx.fillText(`• ${line}`, 40, 390 + i * 40));

  pctx.font = '28px sans-serif';
  pctx.fillStyle = '#6b7280';
  pctx.fillText('Gatilho perto do sensor azul = rega manual · gatilho no botão = modo', 40, 610);

  panelTexture.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Controles (VR) e teclado (computador)
// ---------------------------------------------------------------------------
const soilSensor = new SoilMoistureSensor({ initial: 55 });
const irrigation = new IrrigationController();

const pointerGeo = new THREE.SphereGeometry(0.012, 12, 8);
const pointerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const controllers = [];

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  controller.add(new THREE.Mesh(pointerGeo, pointerMat));
  controller.addEventListener('selectstart', () => onSelect(controller));
  scene.add(controller);
  controllers.push(controller);
}

const tmp = new THREE.Vector3();

function onSelect(controller) {
  const p = controller.getWorldPosition(tmp);
  if (p.distanceTo(MODE_BUTTON_POS) < 0.12) {
    irrigation.toggleMode();
  } else if (proximity.isTriggered(p)) {
    irrigation.requestManualWater();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') irrigation.requestManualWater();
  if (e.code === 'KeyM') irrigation.toggleMode();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let panelTimer = 0;

const DRY_LEAF_LEVEL = 40; // abaixo disso a planta começa a murchar

function render() {
  const dt = Math.min(clock.getDelta(), 0.1);

  // 1) Sensor: a terra seca com o tempo.
  soilSensor.update(dt);

  // 2) Atuador: a bomba adiciona água conforme o modo.
  const water = irrigation.update(dt, soilSensor.read());
  if (water > 0) soilSensor.addWater(water);
  const pumping = irrigation.pumpOn;

  // 3) Proximidade: alguma mão/controle perto do sensor?
  let near = false;
  for (const c of controllers) {
    if (proximity.isTriggered(c.getWorldPosition(tmp))) near = true;
  }

  // 4) Atualiza visual de acordo com o estado dos "dispositivos".
  const moisture = soilSensor.read();
  const wetness = moisture / 100;
  soilMat.color.copy(SOIL_DRY).lerp(SOIL_WET, wetness);

  const health = THREE.MathUtils.clamp(moisture / DRY_LEAF_LEVEL, 0, 1);
  leafMat.color.copy(LEAF_DRY).lerp(LEAF_HEALTHY, health);
  plant.scale.y = 0.85 + 0.15 * health;

  probeLed.material.color.set(moisture < irrigation.lowThreshold ? 0xef4444 : 0x22c55e);
  pumpLed.material.color.set(pumping ? 0x38bdf8 : 0x1f2937);
  modeLed.material.color.set(irrigation.mode === 'auto' ? 0x22c55e : 0xfacc15);
  proxHalo.material.opacity = near ? 0.35 : 0.1;

  updateDrops(dt, pumping);

  panelTimer -= dt;
  if (panelTimer <= 0) {
    panelTimer = 0.2;
    drawPanel(moisture, pumping, irrigation.mode, near, irrigation.log);
  }

  renderer.render(scene, camera);
}

drawPanel(soilSensor.read(), false, irrigation.mode, false, irrigation.log);
renderer.setAnimationLoop(render);
