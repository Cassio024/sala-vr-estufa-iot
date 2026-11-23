// Placa-mãe: LEDs acompanham as bombas e o fio do sensor de umidade acompanha o sensor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/three-loader.mjs', import.meta.url);
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= {};
globalThis.document.createElement = () => ({ getContext: () => ctx, width: 0, height: 0 });
const THREE = await import('three');
const { createMainboard } = await import('../js/scene/mainboard.js');

function setup() {
  const scene = new THREE.Scene();
  const probe = new THREE.Group();
  probe.position.set(0.06, 1.0, -0.94);
  scene.add(probe);
  const mb = createMainboard(scene, {
    wallZ: -4,
    benches: [
      { board: new THREE.Vector3(-3.1, 0.84, -3.17), motor: new THREE.Vector3(-3.4, 0.88, -3.23) },
      { board: new THREE.Vector3(3.1, 0.84, -3.17), motor: new THREE.Vector3(3.4, 0.88, -3.23) },
    ],
    pump: new THREE.Vector3(-0.5, 0.81, -1.07),
    proximity: new THREE.Vector3(0.35, 1.03, -1),
    probe,
    probeTop: 0.09,
    table: { y: 0.78, z: -1.35 },
  });
  const probeWire = scene.children.find((o) => o.isMesh && o.frustumCulled === false);
  return { scene, probe, mb, probeWire };
}

const ledColor = (mb, i) => mb.group.children.filter((o) => o.geometry && o.geometry.type === 'SphereGeometry')[i].material.color.getHex();

test('LED de cada bancada e da bomba da mesa acende só com a bomba ligada', () => {
  const { mb } = setup();
  const off = 0x1f2937;
  mb.update(0.016, { benchMotors: [false, false], pumping: false });
  assert.equal(ledColor(mb, 2), off);
  assert.equal(ledColor(mb, 4), off);
  mb.update(0.016, { benchMotors: [true, false], pumping: true });
  assert.notEqual(ledColor(mb, 2), off, 'bancada esquerda');
  assert.equal(ledColor(mb, 3), off, 'bancada direita continua apagada');
  assert.notEqual(ledColor(mb, 4), off, 'bomba da mesa');
});

test('fio do sensor de umidade termina no topo do sensor e o acompanha', () => {
  const { probe, mb, probeWire } = setup();
  const end = () => {
    const pos = probeWire.geometry.attributes.position;
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    return box;
  };
  assert.ok(end().containsPoint(new THREE.Vector3(0.06, 1.09, -0.94)), 'chega no topo do sensor');
  probe.position.set(1.5, 1.4, 0.5); // sensor pego e levado para longe
  mb.update(0.016, {});
  assert.ok(end().containsPoint(new THREE.Vector3(1.5, 1.49, 0.5)), 'fio refeito até a nova posição');
});
