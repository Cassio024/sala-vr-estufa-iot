// Ponto de entrada: cria a cena a partir dos módulos e roda o loop principal.
//   scene/room.js     -> estufa, bancadas, luminária, mesa e cenário externo
//   scene/plant.js    -> vaso, solo e planta (murcha quando seca)
//   scene/devices.js  -> sensor, regador, bomba, reservatório, botão, proximidade
//   scene/water.js    -> gotas de água
//   intro.js          -> caminho de entrada com placas, porta e caminhada
//   props.js          -> flores, arbustos, grama, cerca, vasos e plantas reais
//   effects.js        -> sombras de contato, nuvens e poeira no ar
//   postfx.js         -> brilho e vinheta (só no PC)
//   ui/panel.js       -> painel de status
//   input.js          -> mouse e teclado (PC)  ·  interaction.js -> controles VR
//   fps.js            -> modo FPS no PC (W A S D + mouse, tecla F)
//   scene/bench-irrigation.js -> motores, caixas d'água, canos e válvulas solenoides das bancadas
//   ui/control-panel.js -> painel de controle das bancadas (modo, regar agora, bloquear vaso)
//   scene/analysis.js -> fitas que prendem o vaso principal ("planta em análise")
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoilMoistureSensor, IrrigationController } from './sensors.js';
import { setupRenderer, setupEnvironment } from './environment.js';
import { SoundManager } from './audio.js';
import { XRInteraction, haptic } from './interaction.js';
import { quality, FpsMeter, checkXRSupport } from './quality.js';
import { buildRoom, GREENHOUSE_SIZE, TABLE_Y, TABLE_Z } from './scene/room.js';
import { createPlant } from './scene/plant.js';
import { createDevices, CAN_RATE } from './scene/devices.js';
import { surfaceHeight } from './scene/surfaces.js';
import { createWater } from './scene/water.js';
import { createPanel } from './ui/panel.js';
import { setupDesktopInput } from './input.js';
import { Intro } from './intro.js';
import { buildGarden, buildGreenhousePlants } from './props.js';
import { buildContactShadows, buildClouds, buildDust } from './effects.js';
import { createPost } from './postfx.js';
import { FirstPersonMode } from './fps.js';
import { createCollider } from './collision.js';
import { createClickWalkOption } from './ui/options.js';
import { createBenchIrrigation } from './scene/bench-irrigation.js';
import { ControlPanel } from './ui/control-panel.js';
import { buildAnalysisStraps } from './scene/analysis.js';
import { SOIL_Y } from './scene/plant.js';

// ---------------------------------------------------------------------------
// Renderer, cena e "rig" (o rig permite teletransportar o jogador na VR)
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(quality.pixelRatio); // limitado (1,5 no PC, 1 no headset)
renderer.setSize(window.innerWidth, window.innerHeight);
setupRenderer(renderer);
// O sol não se move: o mapa de sombra é recalculado só de tempos em tempos (ver shadowTimer no loop).
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.xr.enabled = true;
renderer.xr.setFoveation(1); // renderização foveada: menos pixels na borda da lente = mais FPS
document.getElementById('app').appendChild(renderer.domElement);
document.getElementById('app').appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc5e8);
scene.fog = new THREE.Fog(0x9fc5e8, 20, 60);
setupEnvironment(renderer, scene); // céu 3D; o HDRI fica só para reflexos

const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 80);
camera.position.set(0.6, 1.5, 0.8);
// ?camera=x,y,z muda a posição inicial no PC (usado para gerar os prints e o GIF do README).
const camParam = new URLSearchParams(window.location.search).get('camera');
const camXYZ = camParam ? camParam.split(',').map(Number) : [];
const customCamera = camXYZ.length === 3 && camXYZ.every(Number.isFinite);
if (customCamera) camera.position.fromArray(camXYZ);
rig.add(camera);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.0, -1);
// ?alvo=x,y,z: para onde a câmera olha (junto com ?camera, para prints).
const alvo = (new URLSearchParams(window.location.search).get('alvo') || '').split(',').map(Number);
if (alvo.length === 3 && alvo.every(Number.isFinite)) orbit.target.fromArray(alvo);
orbit.maxDistance = 12;
orbit.update();

// Quem anda pela cena: no PC move a câmera; na VR move o "rig"
// (o headset continua dando a posição da cabeça dentro dele).
const _head = new THREE.Vector3();
let fps = null; // modo FPS (criado mais abaixo, depois dos dispositivos)
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
    if (fps && fps.active) {
      fps.lookAt(x, y, z);
      return;
    }
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
// Cena: estufa, planta, dispositivos, água e painel
// ---------------------------------------------------------------------------
const room = buildRoom(scene, { shadowMapSize: quality.shadowMapSize, low: quality.low });
const plant = createPlant(scene);
// Vaso principal preso à mesa com fitas: planta em análise (não pode ser pego).
const analysisTargets = buildAnalysisStraps(scene, {
  base: new THREE.Vector3(0, TABLE_Y, TABLE_Z), height: 0.2, topRadius: 0.13, bottomRadius: 0.1,
});
const dev = createDevices(scene);
const water = createWater(scene);
const panel = createPanel(scene, new THREE.Vector3(0, 1.5, TABLE_Z - 0.55));

// Bomba e planta em glTF são pesadas (~326 mil triângulos juntas): no headset standalone ficam as formas simples.
plant.loadModels();
dev.loadModels({ loadHeavy: quality.loadHeavyModels });

// Caminho de entrada com placas explicativas (fora da estufa).
const intro = new Intro({
  scene,
  camera,
  viewer,
  walkables: [room.greenhouse.ground, room.greenhouse.floor],
  door: room.greenhouse.door,
});
if (!customCamera) intro.start(); // ?camera=x,y,z mantém a posição escolhida (prints do README)

// Sombras de contato (vasos, mesa, árvores), nuvens e poeira no ar.
buildContactShadows(scene, [
  ...room.benchSpots,
  ...(room.outdoor ? room.outdoor.spots : []),
  { x: 0, y: TABLE_Y, z: TABLE_Z, r: 0.5 },   // sombra da mesa
  { x: 0, y: TABLE_Y, z: TABLE_Z, r: 0.16 },  // sombra do vaso
]);
const clouds = quality.low ? null : buildClouds(scene);
const dust = quality.low ? null : buildDust(scene);

// Jardim, árvores reais e plantas nas bancadas: só no PC (no modo leve ficam de fora).
if (!quality.low) {
  buildGarden(scene).catch((err) => console.error('[jardim] falha ao carregar modelos:', err));
  // Os vasos das bancadas viram objetos pegáveis quando os modelos terminam de carregar.
  buildGreenhousePlants(scene, room.benchSpots)
    .then((objs) => benchIrrigation.setPotObjects(objs))
    .catch((err) => console.error('[estufa] falha ao carregar plantas:', err));
}

// Pós-processamento (brilho e vinheta): só no PC.
const post = quality.low ? null : createPost(renderer, scene, camera);

// ---------------------------------------------------------------------------
// Lógica IoT, som e interação
// ---------------------------------------------------------------------------
const soilSensor = new SoilMoistureSensor({ initial: 55 });
const irrigation = new IrrigationController();

const sound = new SoundManager(camera);
const pumpHum = sound.create(dev.pump, sound.buffers.hum, { loop: true, volume: 0.6 });
const waterSfx = sound.create(plant.pot, sound.buffers.water, { loop: true, volume: 0.8 });
const alertSfx = sound.create(dev.probe, sound.buffers.alert, { volume: 0.7, refDistance: 0.6 });
const clickSfx = sound.create(dev.modeButton, sound.buffers.click, { volume: 0.8 });

// Irrigação das bancadas laterais: uma válvula solenoide (com relé) por vaso.
// Objetos que dá para pegar (PC: modo FPS; VR: gatilho lateral). Os vasos das bancadas entram aqui.
const grabbables = [dev.can, dev.probe];
const benchIrrigation = createBenchIrrigation(scene, room.benchSpots, { sound, low: quality.low, grabbables });

// Painel de controle das bancadas: perto da porta, à direita, virado para o corredor.
const controlPanel = new ControlPanel(scene, benchIrrigation.network, benchIrrigation.slots, {
  position: new THREE.Vector3(2.4, 0, 3.2),
  rotY: Math.atan2(-1, -0.35),
  onEvent: (msg) => irrigation.event(msg),
  onClick: () => sound.playOnce(panelClick),
});
const panelClick = sound.create(controlPanel.group, sound.buffers.click, { volume: 0.8 });

// Clique/gatilho em "interfaces": painel das bancadas, depois placas e porta da entrada.
function uiRay(ray, opts) {
  return controlPanel.handleRay(ray) || intro.handleRay(ray, opts);
}

// O navegador só libera áudio depois de um gesto (clique, tecla ou entrar na VR).
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => sound.unlock()));
renderer.xr.addEventListener('sessionstart', () => sound.unlock());

const tmp = new THREE.Vector3();

function toggleMode() {
  irrigation.toggleMode();
  sound.playOnce(clickSfx);
}

// Gatilho do controle VR: primeiro placas/porta/chão; depois botão cinza (modo) e esfera azul (rega).
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _rayQuat = new THREE.Quaternion();
const _ray = new THREE.Raycaster();
function onSelect(controller) {
  sound.unlock();
  controller.getWorldPosition(_rayOrigin);
  _rayDir.set(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(_rayQuat));
  _ray.set(_rayOrigin, _rayDir);
  if (uiRay(_ray, { canWalk: false })) {
    haptic(controller, 0.5, 60);
    return;
  }
  const p = controller.getWorldPosition(tmp);
  if (p.distanceTo(dev.MODE_BUTTON_POS) < 0.12) {
    toggleMode();
    haptic(controller, 0.6, 60);
  } else if (dev.proximity.isTriggered(p)) {
    irrigation.requestManualWater();
    haptic(controller, 0.8, 120);
  }
}

// Sensor solto PERTO do vaso (até 20 cm do centro, acima da terra): encaixa no meio da terra,
// para não precisar acertar o centro exato com a mão (VR) ou com a mira (PC).
function snapProbeToPot(obj) {
  if (obj !== dev.probe) return;
  const p = obj.position;
  if (Math.hypot(p.x, p.z - TABLE_Z) < 0.2 && p.y > SOIL_Y - 0.05) {
    p.x = 0.05;
    p.z = TABLE_Z + 0.05;
  }
}

// Mundo para colisão (modo FPS no PC e andar com joystick na VR):
// paredes de vidro (só passa pela porta) e móveis que bloqueiam a passagem.
const WORLD = {
  half: GREENHOUSE_SIZE / 2,
  doorHalfWidth: 0.6,
  limit: 36,
  boxes: [
    { x: 0, z: TABLE_Z, hw: 0.7, hd: 0.35 }, // mesa
    { x: -1.15, z: TABLE_Z, hw: 0.22, hd: 0.22 }, // reservatório
    { x: -(GREENHOUSE_SIZE / 2 - 0.7), z: 0, hw: 0.35, hd: (GREENHOUSE_SIZE - 1.2) / 2 }, // bancada esquerda
    { x: GREENHOUSE_SIZE / 2 - 0.7, z: 0, hw: 0.35, hd: (GREENHOUSE_SIZE - 1.2) / 2 }, // bancada direita
    { x: 2.4, z: 3.2, hw: 0.2, hd: 0.2 }, // painel de controle das bancadas
    { x: -2.4, z: 3.2, hw: 0.12, hd: 0.12 }, // placa explicativa das válvulas
  ],
};

const interaction = new XRInteraction({
  renderer, scene, camera, rig,
  grabbables,
  surfaceHeight,
  onSelect,
  collider: createCollider(WORLD), // analógico esquerdo anda sem atravessar paredes e móveis
  onRelease: snapProbeToPot,
});

// Opção "andar ao clicar no chão" (PC). Começa desligada; o botão/tecla C liga.
const clickWalk = createClickWalkOption();

setupDesktopInput({
  renderer,
  camera,
  modeTargets: [dev.modeButton, dev.modeLed],
  waterTargets: [dev.proxCore, dev.proxHalo],
  onToggleMode: toggleMode,
  onWater: () => irrigation.requestManualWater(),
  // Clique no PC: placas e porta vêm antes dos botões; andar pelo chão só se a opção estiver ligada.
  onPick: (ray) => uiRay(ray, { canWalk: clickWalk.enabled }),
  isBusy: () => Boolean(fps && fps.active),
});

// Modo FPS (tecla F ou botão no canto): andar com W A S D e usar o mouse como num jogo.
fps = new FirstPersonMode({
  renderer,
  camera,
  scene,
  orbit,
  onIntroRay: (ray) => uiRay(ray, { canWalk: false }),
  uiTargets: controlPanel.targets,
  lockedTargets: [plant.pot, ...analysisTargets],
  onDrop: snapProbeToPot,
  modeTargets: [dev.modeButton, dev.modeLed],
  waterTargets: [dev.proxCore, dev.proxHalo],
  grabbables,
  can: dev.can,
  potCenter: { x: 0, y: SOIL_Y, z: TABLE_Z },
  onToggleMode: toggleMode,
  onWater: () => irrigation.requestManualWater(),
  world: {
    ...WORLD,
    // Onde dá para soltar objetos.
    dropSurfaces: [room.tableTop, plant.pot, ...benchIrrigation.dropSurfaces, room.greenhouse.floor, room.greenhouse.ground],
  },
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (post) post.resize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Diagnóstico (?debug): ajuda a conferir o desempenho direto no headset.
// ---------------------------------------------------------------------------
const fpsMeter = new FpsMeter();
let debugText = '';
let xrInfo = null;
if (quality.debug) checkXRSupport().then((info) => { xrInfo = info; });

function updateDebugText(framesPerSec) {
  const r = renderer.info.render;
  const mode = renderer.xr.isPresenting ? 'VR' : 'PC';
  const xr = xrInfo
    ? `HTTPS:${xrInfo.secure ? 'sim' : 'NÃO'} WebXR:${xrInfo.webxr ? 'sim' : 'NÃO'} VR:${xrInfo.immersiveVR ? 'sim' : 'NÃO'}`
    : '';
  debugText = `${mode} ${framesPerSec} FPS · ${r.calls} draw calls · ${(r.triangles / 1000).toFixed(0)}k tri · ${quality.low ? 'leve' : 'completa'} · ${xr}`;
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let panelTimer = 0;
let alertTimer = 0;
let hapticTimer = 0;
let wasPumping = false;
let wasPouring = false;
let time = 0; // segundos desde o início (vento, poeira, nuvens)
let shadowTimer = 0;
const emitters = [];

function render() {
  const dt = Math.min(clock.getDelta(), 0.1);
  time += dt;

  // 0) Cenário vivo: caminhada, porta, vento, nuvens e poeira.
  intro.update(dt);
  fps.update(dt);
  benchIrrigation.update(dt);
  controlPanel.update(dt);
  if (room.outdoor) room.outdoor.update(time);
  if (clouds) clouds.update(dt);
  if (dust) dust.update(time);
  if (time - shadowTimer > 0.5) {
    renderer.shadowMap.needsUpdate = true;
    shadowTimer = time;
  }

  // 1) Sensor: a terra seca com o tempo; objetos soltos caem.
  soilSensor.update(dt);
  interaction.update(dt);

  // 2) Regador: inclinado sobre o vaso, adiciona água ao solo.
  const pouring = dev.canIsPouring();
  if (pouring) {
    soilSensor.addWater(CAN_RATE * dt);
    if (!wasPouring) irrigation.event('Regador: regando manualmente');
    hapticTimer -= dt;
    if (hapticTimer <= 0 && dev.can.userData.held) {
      haptic(dev.can.userData.held, 0.15, 60);
      hapticTimer = 0.15;
    }
  }
  wasPouring = pouring;

  // 3) Atuador: a bomba adiciona água conforme o modo (só lê se o sensor estiver no solo).
  const probeIn = dev.probeInSoil();
  const added = irrigation.update(dt, probeIn ? soilSensor.read() : null);
  if (added > 0) soilSensor.addWater(added);
  const pumping = irrigation.pumpOn;
  if (pumping && !wasPumping) interaction.pulseAll(0.25, 100);
  wasPumping = pumping;

  // 4) Proximidade: alguma mão/controle perto do sensor?
  let near = false;
  for (const c of interaction.controllers) {
    const isNear = dev.proximity.isTriggered(c.getWorldPosition(tmp));
    if (isNear && !c.userData.wasNear) haptic(c, 0.3, 40);
    c.userData.wasNear = isNear;
    if (isNear) near = true;
  }

  // 5) Visual de acordo com o estado dos "dispositivos".
  const moisture = soilSensor.read();
  plant.update(moisture);
  dev.updateLeds({ probeIn, moisture, lowThreshold: irrigation.lowThreshold, pumping, mode: irrigation.mode, near });

  // 6) Água e som.
  emitters.length = 0;
  if (pumping) emitters.push(dev.SPOUT);
  if (pouring) emitters.push(dev.tipPos);
  water.update(dt, emitters);

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
    panel.draw({ moisture, probeIn, pumpOn: pumping, mode: irrigation.mode, near, log: irrigation.log, debugText });
  }

  // Zera o contador uma vez por quadro: assim o ?debug soma todas as etapas do
  // pós-processamento (bloom/vinheta), e não só a última.
  renderer.info.autoReset = false;
  renderer.info.reset();
  if (post) post.render(dt);
  else renderer.render(scene, camera);
  const framesPerSec = fpsMeter.update(dt);
  if (quality.debug) updateDebugText(framesPerSec);
}

panel.draw({ moisture: soilSensor.read(), probeIn: true, pumpOn: false, mode: irrigation.mode, near: false, log: irrigation.log });
renderer.setAnimationLoop(render);
