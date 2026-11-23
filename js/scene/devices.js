// Dispositivos IoT visíveis: sensor de umidade (pegável), regador (pegável),
// bomba com LED, tubos, reservatório, botão de modo e sensor de proximidade.
import * as THREE from 'three';
import { ProximitySensor } from '../sensors.js';
import { tryLoadModel } from '../models.js';
import { buildWaterPump, PUMP_PORTS } from './pump.js';
import { TABLE_Y, TABLE_Z } from './room.js';
import { SOIL_Y } from './plant.js';

export const CAN_RATE = 10; // % de umidade por segundo ao regar com o regador

export function createDevices(scene) {
  // Sensor de umidade: um objeto que dá para PEGAR (squeeze) e espetar no vaso.
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
  // Origem no centro do corpo (base em y = -0,06); o bico aponta para +x.
  const can = new THREE.Group();
  const canMat = new THREE.MeshStandardMaterial({ color: 0x2f9e5b, metalness: 0.35, roughness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1f6f3f, metalness: 0.4, roughness: 0.4 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.85, roughness: 0.3 });
  // Corpo torneado: base arredondada, barriga e ombro que fecha na boca.
  const profile = [
    [0, -0.06], [0.052, -0.06], [0.06, -0.054], [0.062, -0.03], [0.062, 0.02],
    [0.057, 0.045], [0.046, 0.058], [0.038, 0.062], [0.038, 0.066],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const canBody = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), canMat);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.005, 8, 24), trimMat);
  mouth.rotation.x = Math.PI / 2;
  mouth.position.y = 0.066;
  const mouthDark = new THREE.Mesh(new THREE.CircleGeometry(0.036, 20), new THREE.MeshStandardMaterial({ color: 0x0b1f14 }));
  mouthDark.rotation.x = -Math.PI / 2;
  mouthDark.position.y = 0.058;
  // Faixas decorativas.
  const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.0625, 0.003, 6, 28), trimMat);
  band1.rotation.x = Math.PI / 2;
  band1.position.y = -0.035;
  const band2 = band1.clone();
  band2.position.y = 0.015;
  // Alças: uma em cima (arco de frente para trás) e uma atrás (vertical).
  const topHandle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 8, 20, Math.PI), canMat);
  topHandle.position.set(-0.012, 0.058, 0);
  const backHandle = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 8, 16, Math.PI), canMat);
  backHandle.rotation.z = Math.PI / 2;
  backHandle.position.set(-0.062, 0.0, 0);
  // Bico comprido saindo de baixo, inclinado para cima, com o "chuveirinho" (crivo) de latão.
  const spoutStart = new THREE.Vector3(0.05, -0.035, 0);
  const spoutDir = new THREE.Vector3(0.11, 0.115, 0).normalize();
  const spoutLen = 0.16;
  const spoutQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spoutDir);
  const canSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.012, spoutLen, 12), canMat);
  canSpout.quaternion.copy(spoutQ);
  canSpout.position.copy(spoutStart).addScaledVector(spoutDir, spoutLen / 2);
  const roseC = document.createElement('canvas');
  roseC.width = roseC.height = 64;
  const rg = roseC.getContext('2d');
  rg.fillStyle = '#c8a24a';
  rg.fillRect(0, 0, 64, 64);
  rg.fillStyle = '#3b2a0a';
  for (let r = 0; r < 3; r++) {
    const n = r === 0 ? 1 : r * 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      rg.beginPath();
      rg.arc(32 + Math.cos(a) * r * 10, 32 + Math.sin(a) * r * 10, 2.2, 0, Math.PI * 2);
      rg.fill();
    }
  }
  const roseTex = new THREE.CanvasTexture(roseC);
  roseTex.colorSpace = THREE.SRGBColorSpace;
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.011, 0.024, 16, 1, true), brassMat);
  rose.quaternion.copy(spoutQ);
  rose.position.copy(spoutStart).addScaledVector(spoutDir, spoutLen + 0.01);
  const roseFace = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshStandardMaterial({ map: roseTex, metalness: 0.7, roughness: 0.35 }));
  roseFace.quaternion.copy(spoutQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
  roseFace.position.copy(spoutStart).addScaledVector(spoutDir, spoutLen + 0.022);
  const canTip = new THREE.Object3D();
  canTip.position.copy(spoutStart).addScaledVector(spoutDir, spoutLen + 0.024);
  can.add(canBody, mouth, mouthDark, band1, band2, topHandle, backHandle, canSpout, rose, roseFace, canTip);
  for (const m of [canBody, topHandle, backHandle, canSpout, rose]) m.castShadow = true;
  can.position.set(-0.2, TABLE_Y + 0.06, TABLE_Z + 0.22);
  can.userData = { baseOffset: 0.06, insertDepth: 0, falling: false, vy: 0, held: null };
  scene.add(can);

  const canPos = new THREE.Vector3();
  const tipPos = new THREE.Vector3(); // ponta do bico (de onde sai a água)

  function canIsPouring() {
    can.getWorldPosition(canPos);
    canTip.getWorldPosition(tipPos);
    const overPot = Math.hypot(tipPos.x, tipPos.z - TABLE_Z) < 0.13 && tipPos.y > SOIL_Y && tipPos.y < SOIL_Y + 0.6;
    return overPot && tipPos.y < canPos.y - 0.01; // ponta do bico abaixo do corpo = inclinado
  }

  // Bomba d'água feita por nós (scene/pump.js), com LED e tubo até o vaso.
  // No PC ela é trocada pelo modelo bomba.glb (ver loadModels); no headset fica esta.
  const PUMP_POS = new THREE.Vector3(-0.5, TABLE_Y + 0.07, TABLE_Z);
  const pumpModel = buildWaterPump();
  const pump = pumpModel.group;
  pump.position.set(PUMP_POS.x, TABLE_Y, PUMP_POS.z);
  scene.add(pump);
  let pumpLed = pumpModel.led;
  const portWorld = (p) => p.clone().add(pump.position); // a bomba não gira: só soma a posição
  const PUMP_INLET = portWorld(PUMP_PORTS.inlet);
  const PUMP_OUTLET = portWorld(PUMP_PORTS.outlet);

  // Botão REGAR (rega manual), na frente da bomba: base amarela, botão azul que afunda ao apertar.
  const WATER_BUTTON_POS = new THREE.Vector3(PUMP_POS.x, TABLE_Y, PUMP_POS.z + 0.17);
  const waterButton = new THREE.Group();
  const wbBase = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.08), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 }));
  wbBase.position.y = 0.015;
  const wbRing = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  wbRing.position.y = 0.034;
  const wbCapMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, emissive: 0x000000 });
  const wbCap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.018, 20), wbCapMat);
  wbCap.position.y = 0.046;
  const wbLabelC = document.createElement('canvas');
  wbLabelC.width = 256;
  wbLabelC.height = 64;
  const wl = wbLabelC.getContext('2d');
  wl.fillStyle = '#111827';
  wl.fillRect(0, 0, 256, 64);
  wl.fillStyle = '#facc15';
  wl.font = 'bold 44px sans-serif';
  wl.textAlign = 'center';
  wl.fillText('💧 REGAR', 128, 48);
  const wbLabelTex = new THREE.CanvasTexture(wbLabelC);
  wbLabelTex.colorSpace = THREE.SRGBColorSpace;
  const wbLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.02), new THREE.MeshBasicMaterial({ map: wbLabelTex }));
  wbLabel.position.set(0, 0.015, 0.0405);
  for (const m of [wbBase, wbCap]) m.castShadow = true;
  waterButton.add(wbBase, wbRing, wbCap, wbLabel);
  waterButton.position.copy(WATER_BUTTON_POS);
  scene.add(waterButton);
  let pressTimer = 0;
  /** Animação do botão afundando (chamar ao apertar). */
  function pressWaterButton() {
    pressTimer = 0.18;
  }

  const SPOUT = new THREE.Vector3(-0.06, TABLE_Y + 0.33, TABLE_Z);
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5 });
  const tubeCurve = new THREE.CatmullRomCurve3([
    PUMP_OUTLET,
    PUMP_OUTLET.clone().setY(PUMP_OUTLET.y + 0.06), // sai da bomba para cima
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
    new THREE.Vector3(-0.68, TABLE_Y + 0.1, TABLE_Z),
    PUMP_INLET.clone().setX(PUMP_INLET.x - 0.03), // chega reto na entrada da bomba
    PUMP_INLET,
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

  // Bomba em glTF (~150 mil triângulos): só carrega no modo completo (PC).
  // No modo leve (headset) fica a bomba feita por nós.
  function loadModels({ loadHeavy }) {
    if (!loadHeavy) return;
    tryLoadModel('assets/models/bomba.glb', { height: 0.14 }).then((m) => {
      if (!m) return;
      pump.visible = false;
      m.position.set(PUMP_POS.x, TABLE_Y, PUMP_POS.z);
      scene.add(m);
      // LED solto na frente do modelo (o da nossa bomba some junto com ela).
      pumpLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1f2937 }));
      pumpLed.position.set(PUMP_POS.x, PUMP_POS.y + 0.04, PUMP_POS.z + 0.061);
      scene.add(pumpLed);
    });
  }

  // Cores dos LEDs e do halo de acordo com o estado dos dispositivos.
  let blink = 0;
  function updateLeds({ probeIn, moisture, lowThreshold, pumping, mode, near, excess = false, dt = 0 }) {
    blink += dt;
    // LED do sensor: cinza = fora do solo, vermelho = seco, verde = ok,
    // azul piscando = água em excesso (encharcado).
    const excessOn = blink % 0.5 < 0.25;
    probeLed.material.color.set(!probeIn ? 0x6b7280 : excess ? (excessOn ? 0x3b82f6 : 0x0b1a3a) : moisture < lowThreshold ? 0xef4444 : 0x22c55e);
    // Botão REGAR: afunda quando apertado, acende enquanto rega e fica cinza se bloqueado.
    if (pressTimer > 0) pressTimer -= dt;
    wbCap.position.y = pressTimer > 0 ? 0.04 : 0.046;
    wbCapMat.color.set(excess ? 0x64748b : 0x2563eb);
    wbCapMat.emissive.set(pumping ? 0x1d4ed8 : 0x000000);
    pumpLed.material.color.set(pumping ? 0x38bdf8 : 0x1f2937);
    if (pump.visible) pumpModel.update(dt, pumping); // vibra e gira o eixo quando ligada
    modeLed.material.color.set(mode === 'auto' ? 0x22c55e : 0xfacc15);
    proxHalo.material.opacity = near ? 0.35 : 0.1;
  }

  return {
    probe, probeInSoil,
    can, canIsPouring, tipPos,
    pump, SPOUT, PUMP_POWER: portWorld(PUMP_PORTS.power),
    modeButton, modeLed, MODE_BUTTON_POS,
    waterButton, WATER_BUTTON_POS, pressWaterButton,
    proximity, proxCore, proxHalo,
    loadModels, updateLeds,
  };
}
