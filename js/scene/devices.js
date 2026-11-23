// Dispositivos IoT visíveis: sensor de umidade (pegável), regador (pegável),
// bomba com LED, tubos, reservatório, botão de modo e sensor de proximidade.
import * as THREE from 'three';
import { ProximitySensor } from '../sensors.js';
import { tryLoadModel } from '../models.js';
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

  const canPos = new THREE.Vector3();
  const tipPos = new THREE.Vector3(); // ponta do bico (de onde sai a água)

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

  // Bomba em glTF (~150 mil triângulos): só carrega no modo completo.
  function loadModels({ loadHeavy }) {
    if (!loadHeavy) return;
    tryLoadModel('assets/models/bomba.glb', { height: 0.14 }).then((m) => {
      if (!m) return;
      pump.visible = false;
      m.position.set(PUMP_POS.x, TABLE_Y, PUMP_POS.z);
      scene.add(m);
    });
  }

  // Cores dos LEDs e do halo de acordo com o estado dos dispositivos.
  function updateLeds({ probeIn, moisture, lowThreshold, pumping, mode, near }) {
    probeLed.material.color.set(!probeIn ? 0x6b7280 : moisture < lowThreshold ? 0xef4444 : 0x22c55e);
    pumpLed.material.color.set(pumping ? 0x38bdf8 : 0x1f2937);
    modeLed.material.color.set(mode === 'auto' ? 0x22c55e : 0xfacc15);
    proxHalo.material.opacity = near ? 0.35 : 0.1;
  }

  return {
    probe, probeInSoil,
    can, canIsPouring, tipPos,
    pump, SPOUT,
    modeButton, modeLed, MODE_BUTTON_POS,
    proximity, proxCore, proxHalo,
    loadModels, updateLeds,
  };
}
