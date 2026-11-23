// Sensor de umidade solto sobre o vaso: tem que ficar espetado na terra
// (bug antigo: ele afundava através do vaso até a mesa).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/three-loader.mjs', import.meta.url);
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { XRInteraction } = await import('../js/interaction.js');
const { surfaceHeight } = await import('../js/scene/surfaces.js');
const { SOIL_Y } = await import('../js/scene/plant.js');
const { TABLE_Y, TABLE_Z } = await import('../js/scene/room.js');

const PROBE = { baseOffset: 0.09, insertDepth: 0.08 }; // mesmos valores de scene/devices.js

function drop(x, z, fromY) {
  const obj = new THREE.Group();
  obj.position.set(x, fromY, z);
  obj.userData = { ...PROBE, falling: true, vy: 0, held: null };
  const xr = Object.create(XRInteraction.prototype);
  Object.assign(xr, { grabbables: [obj], surfaceHeight });
  for (let i = 0; i < 200 && obj.userData.falling; i++) xr._fall(1 / 72);
  return obj;
}

test('solto sobre a terra do vaso, fica espetado 8 cm no solo (não afunda até a mesa)', () => {
  for (const h of [0.1, 0.25, 0.6]) {
    const probe = drop(0.05, TABLE_Z + 0.05, SOIL_Y + h);
    const bottom = probe.position.y - PROBE.baseOffset;
    assert.ok(Math.abs(bottom - (SOIL_Y - PROBE.insertDepth)) < 1e-6, `soltando de +${h} m: base em ${bottom.toFixed(3)}, terra em ${SOIL_Y.toFixed(3)}`);
    assert.ok(bottom > TABLE_Y + 0.05, 'não chegou na mesa');
  }
});

test('solto fora do vaso, para em cima da mesa (sem entrar nela)', () => {
  const probe = drop(0.4, TABLE_Z, TABLE_Y + 0.3);
  assert.ok(Math.abs(probe.position.y - PROBE.baseOffset - TABLE_Y) < 1e-6);
});

test('regador (sem ponta para espetar) continua parando em cima da mesa', () => {
  const can = new THREE.Group();
  can.position.set(-0.3, TABLE_Y + 0.4, TABLE_Z);
  can.userData = { baseOffset: 0.06, insertDepth: 0, falling: true, vy: 0, held: null };
  const xr = Object.create(XRInteraction.prototype);
  Object.assign(xr, { grabbables: [can], surfaceHeight });
  for (let i = 0; i < 200; i++) xr._fall(1 / 72);
  assert.ok(Math.abs(can.position.y - 0.06 - TABLE_Y) < 1e-6);
});
