// Testes do modo FPS: movimento com W A S D, colisão com móveis e paredes, porta e mira.
// Só a lógica (sem tela, sem mouse preso): o construtor, que cria a interface, é pulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { FirstPersonMode } = await import('../js/fps.js');

const WORLD = {
  half: 4,
  doorHalfWidth: 0.6,
  limit: 36,
  boxes: [{ x: 0, z: -1, hw: 0.7, hd: 0.35 }], // mesa
};

function player(x, z, yaw = 0) {
  const f = Object.create(FirstPersonMode.prototype);
  Object.assign(f, { keys: new Set(), yaw, pitch: 0, world: WORLD, camera: { position: new THREE.Vector3(x, 1.6, z) } });
  return f;
}

function walk(f, keys, seconds) {
  keys.forEach((k) => f.keys.add(k));
  for (let t = 0; t < seconds; t += 0.05) f._move(0.05);
  f.keys.clear();
}

test('W anda para a frente (para onde está olhando) e S para trás', () => {
  const f = player(0, 2, 0); // olhando para -z
  walk(f, ['KeyW'], 0.5);
  assert.ok(f.camera.position.z < 2 - 0.9, `z = ${f.camera.position.z}`);
  assert.ok(Math.abs(f.camera.position.x) < 1e-6);
  walk(f, ['KeyS'], 0.5);
  assert.ok(Math.abs(f.camera.position.z - 2) < 1e-6);
});

test('A e D andam de lado; Shift corre', () => {
  const f = player(0, 2, 0);
  walk(f, ['KeyD'], 0.5);
  assert.ok(f.camera.position.x > 1, 'D vai para a direita');
  const g = player(0, 2, 0);
  walk(g, ['KeyA', 'ShiftLeft'], 0.5);
  assert.ok(g.camera.position.x < -1.9, 'A + Shift vai mais longe para a esquerda');
});

test('não atravessa a mesa', () => {
  const f = player(0, 1, 0);
  walk(f, ['KeyW'], 3);
  assert.ok(f.camera.position.z > -1 + 0.35, `parou antes da mesa (z = ${f.camera.position.z.toFixed(2)})`);
});

test('não atravessa as paredes de vidro', () => {
  const f = player(3, 0, -Math.PI / 2); // olhando para +x (parede lateral)
  walk(f, ['KeyW'], 3);
  assert.ok(f.camera.position.x < 4, `x = ${f.camera.position.x.toFixed(2)}`);
  const g = player(2, 3, Math.PI); // olhando para +z, longe da porta
  walk(g, ['KeyW'], 3);
  assert.ok(g.camera.position.z < 4, 'parede da frente fora da porta bloqueia');
});

test('entra e sai pela porta', () => {
  const f = player(0, 8, 0); // do lado de fora, de frente para a porta
  walk(f, ['KeyW'], 3);
  assert.ok(f.camera.position.z < 3, `entrou (z = ${f.camera.position.z.toFixed(2)})`);
  walk(f, ['KeyS'], 3);
  assert.ok(f.camera.position.z > 4.5, 'saiu de novo');
});

test('lookAt vira a câmera para o alvo', () => {
  const f = player(0, 0, 0);
  f.lookAt(5, 1.6, 0); // alvo à direita (+x)
  assert.ok(Math.abs(f.yaw + Math.PI / 2) < 1e-6, `yaw = ${f.yaw}`);
  f.lookAt(0, 1.6, -5);
  assert.ok(Math.abs(f.yaw) < 1e-6);
});
