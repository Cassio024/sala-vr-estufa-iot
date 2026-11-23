import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoilMoistureSensor, ProximitySensor, IrrigationController } from './sensors.js';
import { setupRenderer, setupEnvironment, pbrMaterial, buildGreenhouse, buildBenches, buildLamp } from './environment.js';
import { tryLoadModel, makeTintable, tint } from './models.js';
import { SoundManager } from './audio.js';
import { XRInteraction, haptic } from './interaction.js';
import { quality, FpsMeter, checkXRSupport } from './quality.js';

// ---------------------------------------------------------------------------
// Renderer, cena e "rig" (o rig permite teletransportar o jogador na VR)
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(quality.pixelRatio); // limitado (1,5 no PC, 1 no headset)
renderer.setSize(window.innerWidth, window.innerHeight);
setupRenderer(renderer);
renderer.xr.enabled = true;
renderer.xr.setFoveation(1); // renderização foveada: menos pixels na borda da lente = mais FPS
document.getElementById('app').appendChild(renderer.domElement);
document.getElementById('app').appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc5e8);
scene.fog = new THREE.Fog(0x9fc5e8, 20, 60);
setupEnvironment(renderer, scene);

const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 80);
camera.position.set(0.6, 1.5, 0.8);
rig.add(camera);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.0, -1);
orbit.maxDistance = 6;
orbit.update();

// ---------------------------------------------------------------------------
// Estufa, bancadas e mesa
// ---------------------------------------------------------------------------
const GREENHOUSE_SIZE = 8;
const greenhouse = buildGreenhouse(scene, { size: GREENHOUSE_SIZE, height: 3, shadowMapSize: quality.shadowMapSize });
buildBenches(scene, GREENHOUSE_SIZE);

const TABLE_Y = 0.78;   // altura da superfície da mesa
const TABLE_Z = -1;
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

// ---------------------------------------------------------------------------
// Vaso, solo e planta (formas simples; trocadas por glTF se existirem em assets/models)
// ---------------------------------------------------------------------------
const POT_HEIGHT = 0.2;
const pot = new THREE.Mesh(
  new THREE.CylinderGeometry(0.13, 0.1, POT_HEIGHT, 32),
  new THREE.MeshStandardMaterial({ color: 0xb5562b, roughness: 0.85 })
);
pot.position.set(0, TABLE_Y + POT_HEIGHT / 2, TABLE_Z);
pot.castShadow = true;
scene.add(pot);

const SOIL_Y = TABLE_Y + POT_HEIGHT + 0.001;
const SOIL_DRY = new THREE.Color(0xc9a178);
const SOIL_WET = new THREE.Color(0x3b2415);
const soilMat = new THREE.MeshStandardMaterial({ color: SOIL_DRY, roughness: 1 });
const soil = new THREE.Mesh(new THREE.CircleGeometry(0.125, 32), soilMat);
soil.rotation.x = -Math.PI / 2;
soil.position.set(0, SOIL_Y, TABLE_Z);
soil.receiveShadow = true;
scene.add(soil);

const LEAF_DRY = new THREE.Color(0xa3863a);
const LEAF_HEALTHY = new THREE.Color(0x3f9b48);
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
// Sensor de umidade: agora é um objeto que dá para PEGAR (squeeze) e espetar no vaso.
const PROBE_HALF = 0.09;
const PROBE_INSERT = 0.08; // quanto da ponta entra na terra
const probe = new THREE.Group();
const probeBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.02, 0.18, 0.02),
  new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.5, roughness: 0.4 })
);
probeBody.castShadow = true;
const probeLed = new THREE.Mesh(
  new THREE.SphereGeometry(0.012, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x22c55e })
);
probeLed.position.y = 0.1;
probe.add(probeBody, probeLed);
probe.position.set(0.06, SOIL_Y + PROBE_HALF - PROBE_INSERT, TABLE_Z + 0.06);
probe.userData = { baseOffset: PROBE_HALF, insertDepth: PROBE_INSERT, falling: false, vy: 0, held: null };
scene.add(probe);

function probeInSoil() {
  return (
    Math.hypot(probe.position.x, probe.position.z - TABLE_Z) < 0.115 &&
    probe.position.y - PROBE_HALF < SOIL_Y - 0.02
  );
}

// Regador: pegue com o gatilho lateral e incline sobre o vaso para regar.
const can = new THREE.Group();
const canMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.3, roughness: 0.5 });
const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 20), canMat);
const canSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.16, 10), canMat);
canSpout.position.set(0.117, 0.047, 0);
canSpout.rotation.z = -Math.PI / 4;
const canHandle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16, Math.PI), canMat);
canHandle.position.set(-0.06, 0.02, 0);
canHandle.rotation.z = Math.PI / 2;
const canTip = new THREE.Object3D();
canTip.position.set(0.173, 0.103, 0);
can.add(canBody, canSpout, canHandle, canTip);
canBody.castShadow = canSpout.castShadow = true;
can.position.set(-0.2, TABLE_Y + 0.06, TABLE_Z + 0.22);
can.userData = { baseOffset: 0.06, insertDepth: 0, falling: false, vy: 0, held: null };
scene.add(can);

const CAN_RATE = 10; // % de umidade por segundo ao regar com o regador
const canPos = new THREE.Vector3();
const tipPos = new THREE.Vector3();

function canIsPouring() {
  can.getWorldPosition(canPos);
  canTip.getWorldPosition(tipPos);
  const overPot = Math.hypot(tipPos.x, tipPos.z - TABLE_Z) < 0.13 && tipPos.y > SOIL_Y && tipPos.y < SOIL_Y + 0.6;
  return overPot && tipPos.y < canPos.y - 0.01; // ponta do bico abaixo do corpo = inclinado
}

// Bomba d'água, com LED e tubo até o vaso.
const PUMP_POS = new THREE.Vector3(-0.5, TABLE_Y + 0.07, TABLE_Z);
const pump = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.14, 0.12),
  new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.4, roughness: 0.5 })
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
const tubeMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5 });
const tubeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(PUMP_POS.x, PUMP_POS.y + 0.07, PUMP_POS.z),
  new THREE.Vector3(-0.35, TABLE_Y + 0.28, TABLE_Z),
  new THREE.Vector3(-0.18, TABLE_Y + 0.34, TABLE_Z),
  SPOUT,
]);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 32, 0.012, 8, false), tubeMat));

// Reservatório de água ligado à bomba.
const TANK_X = -1.15;
const tank = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.22, 0.6, 32),
  new THREE.MeshStandardMaterial({ color: 0xbfdbfe, transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false })
);
tank.position.set(TANK_X, 0.3, TABLE_Z);
const tankWater = new THREE.Mesh(
  new THREE.CylinderGeometry(0.2, 0.2, 0.45, 32),
  new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75, roughness: 0.2 })
);
tankWater.position.set(TANK_X, 0.245, TABLE_Z);
scene.add(tank, tankWater);
const inletCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(TANK_X, 0.5, TABLE_Z),
  new THREE.Vector3(TANK_X, 0.95, TABLE_Z),
  new THREE.Vector3(-0.85, 0.98, TABLE_Z),
  new THREE.Vector3(-0.62, TABLE_Y + 0.13, TABLE_Z),
  new THREE.Vector3(PUMP_POS.x - 0.09, TABLE_Y + 0.1, TABLE_Z),
]);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(inletCurve, 48, 0.012, 8, false), tubeMat));

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

// ---------------------------------------------------------------------------
// Modelos glTF opcionais (assets/models/vaso.glb, planta.glb, bomba.glb)
// ---------------------------------------------------------------------------
let plantModel = null;
let plantTint = null;

tryLoadModel('assets/models/vaso.glb', { height: POT_HEIGHT }).then((m) => {
  if (!m) return;
  pot.visible = false;
  m.position.set(0, TABLE_Y, TABLE_Z);
  scene.add(m);
});
// Bomba e planta em glTF são pesadas (~326 mil triângulos juntas): no headset standalone ficam as formas simples.
if (quality.loadHeavyModels) tryLoadModel('assets/models/planta.glb', { height: 0.35 }).then((m) => {
  if (!m) return;
  plant.visible = false;
  m.position.set(0, SOIL_Y, TABLE_Z);
  scene.add(m);
  plantModel = m;
  plantTint = makeTintable(m);
});
if (quality.loadHeavyModels) tryLoadModel('assets/models/bomba.glb', { height: 0.14 }).then((m) => {
  if (!m) return;
  pump.visible = false;
  m.position.set(PUMP_POS.x, TABLE_Y, PUMP_POS.z);
  scene.add(m);
});

// ---------------------------------------------------------------------------
// Superfícies (onde os objetos soltos e as gotas pousam)
// ---------------------------------------------------------------------------
function surfaceHeight(x, z, y) {
  let best = { y: 0, soil: false };
  if (Math.abs(x) < 0.7 && Math.abs(z - TABLE_Z) < 0.35 && TABLE_Y <= y + 0.05) best = { y: TABLE_Y, soil: false };
  if (Math.hypot(x, z - TABLE_Z) < 0.12 && SOIL_Y <= y + 0.05) best = { y: SOIL_Y, soil: true };
  return best;
}

// ---------------------------------------------------------------------------
// Gotas de água (pool reutilizável)
// ---------------------------------------------------------------------------
const dropGeo = new THREE.SphereGeometry(0.008, 8, 6);
const dropMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
const drops = [];
for (let i = 0; i < 60; i++) {
  const mesh = new THREE.Mesh(dropGeo, dropMat);
  mesh.visible = false;
  scene.add(mesh);
  drops.push({ mesh, vy: 0, alive: false });
}
let spawnTimer = 0;

// emitters: lista de posições de onde a água está saindo neste frame.
function updateDrops(dt, emitters) {
  if (emitters.length) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 0.06;
      for (const origin of emitters) {
        const drop = drops.find((d) => !d.alive);
        if (!drop) break;
        drop.alive = true;
        drop.vy = 0;
        drop.mesh.visible = true;
        drop.mesh.position.copy(origin);
      }
    }
  }
  for (const drop of drops) {
    if (!drop.alive) continue;
    drop.vy -= 4 * dt;
    const p = drop.mesh.position;
    p.y += drop.vy * dt;
    if (p.y <= surfaceHeight(p.x, p.z, p.y - drop.vy * dt).y) {
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
panelTexture.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.2, 0.75),
  new THREE.MeshBasicMaterial({ map: panelTexture })
);
panel.position.set(0, 1.5, TABLE_Z - 0.55);
scene.add(panel);

function drawPanel(moisture, probeIn, pumpOn, mode, near, log) {
  pctx.fillStyle = '#111827';
  pctx.fillRect(0, 0, panelCanvas.width, panelCanvas.height);

  pctx.fillStyle = '#e5e7eb';
  pctx.font = 'bold 56px sans-serif';
  pctx.fillText('Estufa IoT - Sala VR', 40, 70);

  pctx.font = '46px sans-serif';
  if (probeIn) {
    pctx.fillStyle = moisture < 35 ? '#f87171' : '#34d399';
    pctx.fillText(`Umidade do solo: ${moisture.toFixed(0)}%`, 40, 150);
  } else {
    pctx.fillStyle = '#9ca3af';
    pctx.fillText('Sensor fora do solo (espete no vaso)', 40, 150);
  }

  pctx.fillStyle = '#e5e7eb';
  pctx.fillText(`Bomba: ${pumpOn ? 'LIGADA' : 'desligada'}`, 40, 210);
  pctx.fillText(`Modo: ${mode === 'auto' ? 'automático' : 'manual'}`, 40, 270);
  pctx.fillText(`Proximidade: ${near ? 'mão detectada' : 'livre'}`, 40, 330);

  pctx.font = '32px sans-serif';
  pctx.fillStyle = '#9ca3af';
  log.forEach((line, i) => pctx.fillText(`• ${line}`, 40, 390 + i * 40));

  if (quality.debug) {
    pctx.font = '24px sans-serif';
    pctx.fillStyle = '#fbbf24';
    pctx.fillText(debugText, 40, 570);
  }

  pctx.font = '24px sans-serif';
  pctx.fillStyle = '#6b7280';
  pctx.fillText('Gatilho: esfera azul = rega · botão cinza = modo · lateral: pegar · analógico: andar', 40, 610);

  panelTexture.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Lógica IoT, som e interação
// ---------------------------------------------------------------------------
const soilSensor = new SoilMoistureSensor({ initial: 55 });
const irrigation = new IrrigationController();

const sound = new SoundManager(camera);
const pumpHum = sound.create(pump, sound.buffers.hum, { loop: true, volume: 0.6 });
const waterSfx = sound.create(pot, sound.buffers.water, { loop: true, volume: 0.8 });
const alertSfx = sound.create(probe, sound.buffers.alert, { volume: 0.7, refDistance: 0.6 });
const clickSfx = sound.create(modeButton, sound.buffers.click, { volume: 0.8 });

// O navegador só libera áudio depois de um gesto (clique, tecla ou entrar na VR).
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => sound.unlock()));
renderer.xr.addEventListener('sessionstart', () => {
  sound.unlock();
  renderer.xr.setFoveation(1);
});

const tmp = new THREE.Vector3();

function toggleMode() {
  irrigation.toggleMode();
  sound.playOnce(clickSfx);
}

function onSelect(controller) {
  sound.unlock();
  const p = controller.getWorldPosition(tmp);
  if (p.distanceTo(MODE_BUTTON_POS) < 0.12) {
    toggleMode();
    haptic(controller, 0.6, 60);
  } else if (proximity.isTriggered(p)) {
    irrigation.requestManualWater();
    haptic(controller, 0.8, 120);
  }
}

const interaction = new XRInteraction({
  renderer, scene, camera, rig,
  grabbables: [can, probe],
  surfaceHeight,
  onSelect,
  bounds: GREENHOUSE_SIZE / 2 - 0.4,
});

// Mouse (sem headset): clicar no botão cinza troca o modo; clicar na esfera azul rega.
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let downX = 0;
let downY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  // Ignora arrastos (girar a câmera).
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects([modeButton, modeLed, proxCore, proxHalo], false)[0];
  if (!hit) return;
  if (hit.object === modeButton || hit.object === modeLed) toggleMode();
  else irrigation.requestManualWater();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') irrigation.requestManualWater();
  if (e.code === 'KeyM') toggleMode();
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
const fpsMeter = new FpsMeter();
let debugText = '';
let xrInfo = null;
if (quality.debug) checkXRSupport().then((info) => { xrInfo = info; });

// Linha de diagnóstico (?debug): ajuda a conferir o desempenho direto no headset.
function updateDebugText(fps) {
  const r = renderer.info.render;
  const mode = renderer.xr.isPresenting ? 'VR' : 'PC';
  const xr = xrInfo
    ? `HTTPS:${xrInfo.secure ? 'sim' : 'NÃO'} WebXR:${xrInfo.webxr ? 'sim' : 'NÃO'} VR:${xrInfo.immersiveVR ? 'sim' : 'NÃO'}`
    : '';
  debugText = `${mode} ${fps} FPS · ${r.calls} draw calls · ${(r.triangles / 1000).toFixed(0)}k tri · ${quality.low ? 'leve' : 'completa'} · ${xr}`;
}
let panelTimer = 0;
let alertTimer = 0;
let hapticTimer = 0;
let wasPumping = false;
let wasPouring = false;
const emitters = [];

const DRY_LEAF_LEVEL = 40; // abaixo disso a planta começa a murchar

function render() {
  const dt = Math.min(clock.getDelta(), 0.1);

  // 1) Sensor: a terra seca com o tempo; objetos soltos caem.
  soilSensor.update(dt);
  interaction.update(dt);

  // 2) Regador: inclinado sobre o vaso, adiciona água ao solo.
  const pouring = canIsPouring();
  if (pouring) {
    soilSensor.addWater(CAN_RATE * dt);
    if (!wasPouring) irrigation.event('Regador: regando manualmente');
    hapticTimer -= dt;
    if (hapticTimer <= 0 && can.userData.held) {
      haptic(can.userData.held, 0.15, 60);
      hapticTimer = 0.15;
    }
  }
  wasPouring = pouring;

  // 3) Atuador: a bomba adiciona água conforme o modo (só lê se o sensor estiver no solo).
  const probeIn = probeInSoil();
  const water = irrigation.update(dt, probeIn ? soilSensor.read() : null);
  if (water > 0) soilSensor.addWater(water);
  const pumping = irrigation.pumpOn;
  if (pumping && !wasPumping) interaction.pulseAll(0.25, 100);
  wasPumping = pumping;

  // 4) Proximidade: alguma mão/controle perto do sensor?
  let near = false;
  for (const c of interaction.controllers) {
    const isNear = proximity.isTriggered(c.getWorldPosition(tmp));
    if (isNear && !c.userData.wasNear) haptic(c, 0.3, 40);
    c.userData.wasNear = isNear;
    if (isNear) near = true;
  }

  // 5) Visual de acordo com o estado dos "dispositivos".
  const moisture = soilSensor.read();
  const wetness = moisture / 100;
  soilMat.color.copy(SOIL_DRY).lerp(SOIL_WET, wetness);
  soilMat.roughness = THREE.MathUtils.lerp(1, 0.35, wetness); // terra molhada é mais brilhante

  const health = THREE.MathUtils.clamp(moisture / DRY_LEAF_LEVEL, 0, 1);
  if (plantTint) tint(plantTint, LEAF_DRY, 1 - health);
  else leafMat.color.copy(LEAF_DRY).lerp(LEAF_HEALTHY, health);
  (plantModel || plant).scale.y = 0.85 + 0.15 * health;

  probeLed.material.color.set(!probeIn ? 0x6b7280 : moisture < irrigation.lowThreshold ? 0xef4444 : 0x22c55e);
  pumpLed.material.color.set(pumping ? 0x38bdf8 : 0x1f2937);
  modeLed.material.color.set(irrigation.mode === 'auto' ? 0x22c55e : 0xfacc15);
  proxHalo.material.opacity = near ? 0.35 : 0.1;

  // 6) Água e som.
  emitters.length = 0;
  if (pumping) emitters.push(SPOUT);
  if (pouring) emitters.push(tipPos);
  updateDrops(dt, emitters);

  sound.setPlaying(pumpHum, pumping);
  sound.setPlaying(waterSfx, pumping || pouring);
  alertTimer -= dt;
  if (probeIn && moisture < irrigation.lowThreshold && !pumping && alertTimer <= 0) {
    sound.playOnce(alertSfx); // alerta de solo seco
    alertTimer = 4;
  }

  panelTimer -= dt;
  if (panelTimer <= 0) {
    panelTimer = 0.2;
    drawPanel(moisture, probeIn, pumping, irrigation.mode, near, irrigation.log);
  }

  renderer.render(scene, camera);
  const fps = fpsMeter.update(dt);
  if (quality.debug) updateDebugText(fps);
}

drawPanel(soilSensor.read(), true, false, irrigation.mode, false, irrigation.log);
renderer.setAnimationLoop(render);
