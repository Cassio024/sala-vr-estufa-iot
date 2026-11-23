import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoilMoistureSensor, ProximitySensor, IrrigationController } from './sensors.js';
import { setupRenderer, setupEnvironment, pbrMaterial, buildGreenhouse, buildBenches, buildLamp, buildOutdoorScenery } from './environment.js';
import { tryLoadModel, makeTintable, tint } from './models.js';
import { SoundManager } from './audio.js';
import { XRInteraction, haptic } from './interaction.js';
import { Intro } from './intro.js';
import { createPost } from './postfx.js';
import { buildContactShadows, buildClouds, buildDust } from './effects.js';
import { terracottaTextures, leafTextures, soilTexture } from './textures.js';
import { buildGarden, buildGreenhousePlants } from './props.js';

// ---------------------------------------------------------------------------
// Renderer, cena e "rig" (o rig permite teletransportar o jogador na VR)
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Resolução limitada a 1.5: acima disso o custo sobe rápido e a diferença visual é pequena.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
setupRenderer(renderer);
// O sol não se move, então o mapa de sombra é recalculado só de tempos em tempos
// (ver shadowTimer no loop). Isso economiza uma passagem de sombra por quadro.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.xr.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);
// Só mostra o botão "Enter VR" se o navegador/headset suportar; sem isso o
// VRButton aparece como "VR NOT SUPPORTED" no computador.
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (ok) document.getElementById('app').appendChild(VRButton.createButton(renderer));
  });
}

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
orbit.maxDistance = 12;
orbit.update();

// Quem anda pela cena: no computador move a câmera; na VR move o "rig"
// (o headset continua dando a posição da cabeça dentro dele).
const _head = new THREE.Vector3();
const viewer = {
  head() {
    return camera.getWorldPosition(_head.clone());
  },
  isXR() {
    return renderer.xr.isPresenting;
  },
  moveBy(dx, dz) {
    if (renderer.xr.isPresenting) {
      rig.position.x += dx;
      rig.position.z += dz;
    } else {
      camera.position.x += dx;
      camera.position.z += dz;
      orbit.target.x += dx;
      orbit.target.z += dz;
      orbit.update();
    }
  },
  lookAt(x, y, z) {
    if (renderer.xr.isPresenting) return;
    orbit.target.set(x, y, z);
    orbit.update();
  },
};

// Ao entrar na VR, a posição atual do computador vira a posição do rig;
// ao sair, a câmera volta para onde o rig estava.
renderer.xr.addEventListener('sessionstart', () => {
  rig.position.x += camera.position.x;
  rig.position.z += camera.position.z;
  camera.position.x = 0;
  camera.position.z = 0;
});
renderer.xr.addEventListener('sessionend', () => {
  const x = rig.position.x;
  const z = rig.position.z;
  rig.position.set(0, 0, 0);
  camera.position.x = x;
  camera.position.z = z;
  orbit.target.set(x, 1.2, z - 3);
  orbit.update();
});

// ---------------------------------------------------------------------------
// Estufa, bancadas e mesa
// ---------------------------------------------------------------------------
const GREENHOUSE_SIZE = 8;
const greenhouse = buildGreenhouse(scene, { size: GREENHOUSE_SIZE, height: 3 });
const benchSpots = buildBenches(scene, GREENHOUSE_SIZE);
const treeSpots = buildOutdoorScenery(scene);

// Caminho de entrada com placas explicativas (fora da estufa).
const intro = new Intro({
  scene,
  camera,
  viewer,
  walkables: [greenhouse.ground, greenhouse.floor],
  door: greenhouse.door,
});
intro.start();

// Pós-processamento (bloom e vinheta) para o modo computador.
const post = createPost(renderer, scene, camera);

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
  new THREE.MeshStandardMaterial({ map: terracottaTextures().map, roughness: 0.85 })
);
pot.position.set(0, TABLE_Y + POT_HEIGHT / 2, TABLE_Z);
pot.castShadow = true;
scene.add(pot);

const SOIL_Y = TABLE_Y + POT_HEIGHT + 0.001;
const SOIL_DRY = new THREE.Color(0xc9a178);
const SOIL_WET = new THREE.Color(0x3b2415);
const soilMat = new THREE.MeshStandardMaterial({ color: SOIL_DRY, map: soilTexture().map, roughness: 1 });
const soil = new THREE.Mesh(new THREE.CircleGeometry(0.125, 32), soilMat);
soil.rotation.x = -Math.PI / 2;
soil.position.set(0, SOIL_Y, TABLE_Z);
soil.receiveShadow = true;
scene.add(soil);

const LEAF_DRY = new THREE.Color(0xa3863a);
const LEAF_HEALTHY = new THREE.Color(0x3f9b48);
const leafMat = new THREE.MeshStandardMaterial({ color: LEAF_HEALTHY, map: leafTextures().map, roughness: 0.6 });
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
tryLoadModel('assets/models/planta.glb', { height: 0.35 }).then((m) => {
  if (!m) return;
  plant.visible = false;
  m.position.set(0, SOIL_Y, TABLE_Z);
  scene.add(m);
  plantModel = m;
  plantTint = makeTintable(m);
});
tryLoadModel('assets/models/bomba.glb', { height: 0.14 }).then((m) => {
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
const PANEL_W = 1024;
const PANEL_H = 720;
const panelCanvas = document.createElement('canvas');
panelCanvas.width = PANEL_W;
panelCanvas.height = PANEL_H;
const pctx = panelCanvas.getContext('2d');
const panelTexture = new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.2, 1.2 * (PANEL_H / PANEL_W)),
  new THREE.MeshBasicMaterial({ map: panelTexture, transparent: true })
);
panel.position.set(0, 1.5, TABLE_Z - 0.55);
scene.add(panel);

function roundRect(x, y, w, h, r) {
  pctx.beginPath();
  pctx.moveTo(x + r, y);
  pctx.arcTo(x + w, y, x + w, y + h, r);
  pctx.arcTo(x + w, y + h, x, y + h, r);
  pctx.arcTo(x, y + h, x, y, r);
  pctx.arcTo(x, y, x + w, y, r);
  pctx.closePath();
}

// Cartão de status: rótulo pequeno em cima, valor em destaque embaixo.
function drawPill(x, y, label, value, bg, fg) {
  pctx.fillStyle = bg;
  roundRect(x, y, 290, 96, 24);
  pctx.fill();
  pctx.fillStyle = fg;
  pctx.font = '26px sans-serif';
  pctx.fillText(label, x + 24, y + 36);
  pctx.font = 'bold 34px sans-serif';
  pctx.fillText(value, x + 24, y + 78);
}

function drawPanel(moisture, probeIn, pumpOn, mode, near, log) {
  pctx.clearRect(0, 0, PANEL_W, PANEL_H);

  // Fundo em cartão arredondado.
  pctx.fillStyle = '#0f172a';
  roundRect(4, 4, PANEL_W - 8, PANEL_H - 8, 36);
  pctx.fill();
  pctx.strokeStyle = '#334155';
  pctx.lineWidth = 6;
  pctx.stroke();

  // Título.
  pctx.textAlign = 'left';
  pctx.fillStyle = '#f1f5f9';
  pctx.font = 'bold 64px sans-serif';
  pctx.fillText('Estufa IoT', 48, 100);
  pctx.textAlign = 'right';
  pctx.fillStyle = '#64748b';
  pctx.font = '36px sans-serif';
  pctx.fillText('Sala VR', PANEL_W - 48, 100);
  pctx.textAlign = 'left';

  // Umidade: valor grande e barra de progresso com as marcas de 35% e 70%.
  const level = probeIn ? moisture : 0;
  const valueColor = !probeIn ? '#64748b' : moisture < 35 ? '#f87171' : '#34d399';
  pctx.fillStyle = '#94a3b8';
  pctx.font = '34px sans-serif';
  pctx.fillText('Umidade do solo', 48, 175);
  pctx.fillStyle = valueColor;
  pctx.font = 'bold 110px sans-serif';
  pctx.fillText(probeIn ? `${moisture.toFixed(0)}%` : 'sem sensor', 48, 290);

  const barX = 48, barY = 318, barW = PANEL_W - 96, barH = 30;
  pctx.fillStyle = '#1e293b';
  roundRect(barX, barY, barW, barH, 15);
  pctx.fill();
  pctx.fillStyle = valueColor;
  roundRect(barX, barY, Math.max(barH, barW * (level / 100)), barH, 15);
  pctx.fill();
  pctx.fillStyle = '#facc15';
  for (const mark of [35, 70]) {
    pctx.fillRect(barX + barW * (mark / 100) - 2, barY - 8, 4, barH + 16);
  }

  // Estados: bomba, modo e proximidade.
  drawPill(48, 380, 'Bomba', pumpOn ? 'LIGADA' : 'desligada',
    pumpOn ? '#38bdf8' : '#1e293b', pumpOn ? '#0f172a' : '#e2e8f0');
  drawPill(367, 380, 'Modo', mode === 'auto' ? 'automático' : 'manual',
    mode === 'auto' ? '#a3e635' : '#facc15', '#0f172a');
  drawPill(686, 380, 'Proximidade', near ? 'mão perto' : 'livre',
    near ? '#fbbf24' : '#1e293b', near ? '#0f172a' : '#e2e8f0');

  // Eventos recentes.
  pctx.fillStyle = '#94a3b8';
  pctx.font = '30px sans-serif';
  pctx.fillText('Últimos eventos', 48, 530);
  pctx.fillStyle = '#cbd5e1';
  pctx.font = '30px sans-serif';
  log.slice(0, 3).forEach((line, i) => pctx.fillText(`• ${line}`, 48, 572 + i * 36));

  // Dica de controles.
  pctx.fillStyle = '#64748b';
  pctx.font = '26px sans-serif';
  pctx.fillText('Esfera azul: rega · botão cinza: modo · gatilho lateral: pegar', 48, 690);

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
renderer.xr.addEventListener('sessionstart', () => sound.unlock());

const tmp = new THREE.Vector3();

function toggleMode() {
  irrigation.toggleMode();
  sound.playOnce(clickSfx);
}

const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _rayQuat = new THREE.Quaternion();
function onSelect(controller) {
  sound.unlock();
  // Raio do controle: placas, porta e botão de entrada.
  controller.getWorldPosition(_rayOrigin);
  _rayDir.set(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(_rayQuat));
  raycaster.set(_rayOrigin, _rayDir);
  if (intro.handleRay(raycaster, { canWalk: false })) {
    haptic(controller, 0.5, 60);
    return;
  }
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
  if (intro.handleRay(raycaster, { canWalk: true })) return;
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
  post.resize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let panelTimer = 0;
let time = 0; // segundos desde o início (para vento, poeira e nuvens)
let shadowTimer = 0;

// Contador de FPS: aperte F para mostrar/esconder (FPS, draw calls, triângulos).
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;top:8px;left:8px;padding:6px 10px;background:rgba(0,0,0,.6);color:#34d399;font:13px monospace;border-radius:6px;display:none;z-index:5;pointer-events:none';
document.body.appendChild(hud);
let showHud = false;
let fpsAcc = 0;
let fpsFrames = 0;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') {
    showHud = !showHud;
    hud.style.display = showHud ? 'block' : 'none';
  }
});
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
  intro.update(dt);

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
  proxHalo.material.opacity = near ? 0.5 : 0.2;

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

  time += dt;
  if (time - shadowTimer > 0.5) {
    renderer.shadowMap.needsUpdate = true;
    shadowTimer = time;
  }
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    if (showHud) {
      const info = renderer.info.render;
      hud.textContent = `${(fpsFrames / fpsAcc).toFixed(0)} FPS · ${info.calls} draw calls · ${info.triangles.toLocaleString('pt-BR')} triângulos`;
    }
    fpsAcc = 0;
    fpsFrames = 0;
  }
  clouds.update(dt);
  treeSpots.update(time);
  dust.update(time);
  post.render(dt);
}

drawPanel(soilSensor.read(), true, false, irrigation.mode, false, irrigation.log);
// Sombras de contato (vasos, mesa, árvores), poça no caminho e nuvens.
buildContactShadows(scene, [
  ...benchSpots,
  ...treeSpots.spots,
  { x: 0, y: TABLE_Y, z: TABLE_Z, r: 0.5 },   // sombra da mesa
  { x: 0, y: TABLE_Y, z: TABLE_Z, r: 0.16 },  // sombra do vaso
]);
const clouds = buildClouds(scene);
const dust = buildDust(scene);
// Jardim com modelos reais (flores, grama, arbustos, cerca). Carrega em segundo plano.
buildGarden(scene).catch((err) => console.error('[jardim] falha ao carregar modelos:', err));
// Plantas reais nas bancadas da estufa.
buildGreenhousePlants(scene, benchSpots).catch((err) => console.error('[estufa] falha ao carregar plantas:', err));

renderer.setAnimationLoop(render);
