// Regador novo: inclinado sobre o vaso (como o modo FPS faz) ele rega; em pé, não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/three-loader.mjs', import.meta.url);
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= {};
globalThis.document.createElement = () => ({ getContext: () => ctx, width: 0, height: 0, style: {} });
globalThis.self ??= globalThis;
const THREE = await import('three');
const { createDevices } = await import('../js/scene/devices.js');
const { SOIL_Y } = await import('../js/scene/plant.js');
const { TABLE_Z } = await import('../js/scene/room.js');

test('regador inclinado -1 rad sobre o vaso rega; em pé na mesa não rega', () => {
  const dev = createDevices(new THREE.Scene());
  assert.equal(dev.canIsPouring(), false, 'em pé na mesa');
  dev.can.position.set(-0.18, SOIL_Y + 0.2, TABLE_Z); // posição usada pelo modo FPS
  dev.can.rotation.set(0, 0, -1.0);
  dev.can.updateMatrixWorld(true);
  assert.equal(dev.canIsPouring(), true, 'inclinado sobre o vaso');
});
