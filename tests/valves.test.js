// Testes da irrigação das bancadas: válvulas solenoides por vaso e motor por bancada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValveNetwork } from '../js/valves.js';

// Gerador previsível: sempre o mesmo número.
const fixed = (v) => () => v;

test('válvula abre quando a terra seca (< 35%) e fecha ao chegar em 70%', () => {
  const net = new ValveNetwork([0], { random: fixed(0) }); // começa em 40%, seca 0,8%/s
  let openedAt = null;
  for (let i = 0; i < 200 && openedAt === null; i++) {
    if (net.update(0.1).includes(0)) openedAt = net.valves[0].sensor.read();
  }
  assert.ok(openedAt !== null, 'abriu');
  assert.ok(openedAt < 36, `abriu com ${openedAt.toFixed(1)}%`);
  assert.equal(net.valves[0].open, true);
  for (let i = 0; i < 200 && net.valves[0].open; i++) net.update(0.1);
  assert.equal(net.valves[0].open, false, 'fechou');
  assert.ok(net.valves[0].sensor.read() >= 70);
});

test('bipe só no momento em que a válvula abre (não a cada quadro)', () => {
  const net = new ValveNetwork([0], { random: fixed(0) });
  let beeps = 0;
  for (let i = 0; i < 150; i++) beeps += net.update(0.1).length; // 15 s: abre uma vez
  assert.equal(beeps, 1);
});

test('motor da bancada liga com qualquer válvula dela aberta, e só a da bancada certa', () => {
  const net = new ValveNetwork([0, 0, 1, 1], { random: fixed(0.9) });
  net.valves[1].sensor.value = 10; // vaso 1 (bancada 0) seco
  net.update(0.1);
  assert.deepEqual(net.motors, [true, false]);
  assert.equal(net.openCount(), 1);
});

test('umidade de cada vaso fica sempre entre 0 e 100%', () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const net = new ValveNetwork(Array.from({ length: 16 }, (_, i) => (i < 8 ? 0 : 1)), { random: rnd });
  for (let i = 0; i < 3000; i++) { // 5 minutos
    net.update(0.1);
    for (const v of net.valves) {
      const m = v.sensor.read();
      assert.ok(m >= 0 && m <= 100);
    }
  }
});
