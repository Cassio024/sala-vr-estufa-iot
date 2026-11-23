// Testes do andar com o analógico esquerdo na VR (sem headset: simulamos o gamepad).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { XRInteraction } = await import('../js/interaction.js');
const { createCollider } = await import('../js/collision.js');

const WORLD = { half: 4, doorHalfWidth: 0.6, limit: 36, boxes: [{ x: 0, z: -1, hw: 0.7, hd: 0.35 }] };

// Jogador em (x, z) olhando na direção `yaw` (0 = para -z), com um controle esquerdo.
function setup(x, z, yaw = 0) {
  const rig = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.rotation.y = yaw;
  rig.add(camera);
  rig.position.set(x, 0, z);
  rig.updateMatrixWorld(true);
  const xr = Object.create(XRInteraction.prototype);
  Object.assign(xr, { rig, camera, collider: createCollider(WORLD), bounds: 3.6, marker: { visible: false } });
  const gamepad = { axes: [0, 0, 0, 0] };
  const left = { userData: { gamepad, handedness: 'left', index: 0 } };
  const push = (sx, sy, seconds) => {
    gamepad.axes[2] = sx;
    gamepad.axes[3] = sy;
    for (let i = 0; i < Math.round(seconds / 0.05); i++) {
      xr._locomotion(left, 0.05);
      rig.updateMatrixWorld(true);
    }
  };
  return { rig, push };
}

test('analógico esquerdo para cima anda para a frente', () => {
  const { rig, push } = setup(0, 2);
  push(0, -1, 0.5); // 0,5 s a 1,6 m/s
  assert.ok(Math.abs(rig.position.z - (2 - 0.8)) < 0.05, `z = ${rig.position.z.toFixed(2)}`);
  assert.ok(Math.abs(rig.position.x) < 1e-6);
});

test('analógico para o lado anda de lado (relativo à cabeça)', () => {
  const { rig, push } = setup(0, 2, -Math.PI / 2); // olhando para +x
  push(0, -1, 0.5);
  assert.ok(rig.position.x > 0.7, 'frente agora é +x');
  const s = setup(0, 2);
  s.push(1, 0, 0.5);
  assert.ok(s.rig.position.x > 0.7, 'direita é +x olhando para -z');
});

test('zona morta: analógico quase parado não move', () => {
  const { rig, push } = setup(0, 2);
  push(0.1, -0.1, 1);
  assert.equal(rig.position.z, 2);
});

test('não atravessa a mesa nem a parede', () => {
  const { rig, push } = setup(0, 1);
  push(0, -1, 3);
  assert.ok(rig.position.z > -1 + 0.35, `parou antes da mesa (z = ${rig.position.z.toFixed(2)})`);
  const w = setup(3, 0, -Math.PI / 2);
  w.push(0, -1, 3);
  assert.ok(w.rig.position.x < 4, 'parede lateral');
});
