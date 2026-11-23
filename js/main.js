// Ponto de entrada: cria a cena a partir dos módulos e roda o loop principal.
//   scene/room.js     -> estufa, bancadas, luminária e mesa
//   scene/plant.js    -> vaso, solo e planta (murcha quando seca)
//   scene/devices.js  -> sensor, regador, bomba, reservatório, botão, proximidade
//   scene/water.js    -> gotas de água
//   ui/panel.js       -> painel de status
//   input.js          -> mouse e teclado (PC)  ·  interaction.js -> controles VR
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoilMoistureSensor, IrrigationController } from './sensors.js';
import { setupRenderer, setupEnvironment } from './environment.js';
import { SoundManager } from './audio.js';
import { XRInteraction, haptic } from './interaction.js';
import { quality, FpsMeter, checkXRSupport } from './quality.js';
import { buildRoom, GREENHOUSE_SIZE, TABLE_Z } from './scene/room.js';
import { createPlant } from './scene/plant.js';
import { createDevices, CAN_RATE } from './scene/devices.js';
import { surfaceHeight } from './scene/surfaces.js';
import { createWater } from './scene/water.js';
import { createPanel } from './ui/panel.js';
import { setupDesktopInput } from './input.js';

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
// ?camera=x,y,z muda a posição inicial no PC (usado para gerar os prints e o GIF do README).
const camParam = new URLSearchParams(window.location.search).get('camera');
const camXYZ = camParam ? camParam.split(',').map(Number) : [];
if (camXYZ.length === 3 && camXYZ.every(Number.isFinite)) camera.position.fromArray(camXYZ);
rig.add(camera);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.0, -1);
orbit.maxDistance = 6;
orbit.update();

// ---------------------------------------------------------------------------
// Cena: estufa, planta, dispositivos, água e painel
// ---------------------------------------------------------------------------
buildRoom(scene, { shadowMapSize: quality.shadowMapSize });
const plant = createPlant(scene);
const dev = createDevices(scene);
const water = createWater(scene);
const panel = createPanel(scene, new THREE.Vector3(0, 1.5, TABLE_Z - 0.55));

// Bomba e planta em glTF são pesadas (~326 mil triângulos juntas): no headset standalone ficam as formas simples.
plant.loadModels({ loadHeavy: quality.loadHeavyModels });
dev.loadModels({ loadHeavy: quality.loadHeavyModels });

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

// Gatilho do controle VR: perto do botão cinza troca o modo; perto da esfera azul rega.
function onSelect(controller) {
  sound.unlock();
  const p = controller.getWorldPosition(tmp);
  if (p.distanceTo(dev.MODE_BUTTON_POS) < 0.12) {
    toggleMode();
    haptic(controller, 0.6, 60);
  } else if (dev.proximity.isTriggered(p)) {
    irrigation.requestManualWater();
    haptic(controller, 0.8, 120);
  }
}

const interaction = new XRInteraction({
  renderer, scene, camera, rig,
  grabbables: [dev.can, dev.probe],
  surfaceHeight,
  onSelect,
  bounds: GREENHOUSE_SIZE / 2 - 0.4,
});

setupDesktopInput({
  renderer,
  camera,
  modeTargets: [dev.modeButton, dev.modeLed],
  waterTargets: [dev.proxCore, dev.proxHalo],
  onToggleMode: toggleMode,
  onWater: () => irrigation.requestManualWater(),
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Diagnóstico (?debug): ajuda a conferir o desempenho direto no headset.
// ---------------------------------------------------------------------------
const fpsMeter = new FpsMeter();
let debugText = '';
let xrInfo = null;
if (quality.debug) checkXRSupport().then((info) => { xrInfo = info; });

function updateDebugText(fps) {
  const r = renderer.info.render;
  const mode = renderer.xr.isPresenting ? 'VR' : 'PC';
  const xr = xrInfo
    ? `HTTPS:${xrInfo.secure ? 'sim' : 'NÃO'} WebXR:${xrInfo.webxr ? 'sim' : 'NÃO'} VR:${xrInfo.immersiveVR ? 'sim' : 'NÃO'}`
    : '';
  debugText = `${mode} ${fps} FPS · ${r.calls} draw calls · ${(r.triangles / 1000).toFixed(0)}k tri · ${quality.low ? 'leve' : 'completa'} · ${xr}`;
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
const emitters = [];

function render() {
  const dt = Math.min(clock.getDelta(), 0.1);

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

  renderer.render(scene, camera);
  const fps = fpsMeter.update(dt);
  if (quality.debug) updateDebugText(fps);
}

panel.draw({ moisture: soilSensor.read(), probeIn: true, pumpOn: false, mode: irrigation.mode, near: false, log: irrigation.log });
renderer.setAnimationLoop(render);
