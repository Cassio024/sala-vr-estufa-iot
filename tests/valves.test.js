// Testes da irrigação das bancadas: válvulas solenoides, modos, bloqueio e motor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValveNetwork, MANUAL_SECONDS, EVAPORATION_MIN } from '../js/valves.js';

// Gerador previsível: sempre o mesmo número.
const fixed = (v) => () => v;
const run = (net, seconds, dt = 0.1) => {
  let opened = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) opened += net.update(dt).length;
  return opened;
};

test('automático: válvula abre quando a terra seca (< 35%) e fecha ao chegar em 70%', () => {
  const net = new ValveNetwork([0], { random: fixed(0) }); // começa em 40%, seca 0,3%/s
  let openedAt = null;
  for (let i = 0; i < 400 && openedAt === null; i++) {
    if (net.update(0.1).includes(0)) openedAt = net.moistureAt(0);
  }
  assert.ok(openedAt !== null, 'abriu');
  assert.ok(openedAt < 36, `abriu com ${openedAt.toFixed(1)}%`);
  for (let i = 0; i < 200 && net.valves[0].open; i++) net.update(0.1);
  assert.equal(net.valves[0].open, false, 'fechou');
  assert.ok(net.moistureAt(0) >= 70);
});

test('bipe só no momento em que a válvula abre (não a cada quadro)', () => {
  const net = new ValveNetwork([0], { random: fixed(0) });
  assert.equal(run(net, 25), 1);
});

test('terra das bancadas seca devagar (0,3 a 0,6 %/s)', () => {
  const slow = new ValveNetwork([0], { random: fixed(0) });
  const fast = new ValveNetwork([0], { random: fixed(0.999) });
  assert.equal(slow.pots[0].sensor.evaporationPerSec, EVAPORATION_MIN);
  assert.ok(fast.pots[0].sensor.evaporationPerSec < EVAPORATION_MIN * 2 + 1e-9);
});

test('balança de segurança: sem vaso em cima, nem o "Regar agora" abre a válvula', () => {
  const net = new ValveNetwork([0, 0], { random: fixed(0.9) });
  net.setMode(0, 'manual');
  net.setPot(1, null); // vaso tirado da balança 1
  assert.equal(net.waterNow(0), 1, 'só a válvula com vaso');
  net.update(0.1);
  assert.deepEqual(net.valves.map((v) => v.open), [true, false]);
});

test('motor da bancada liga com qualquer válvula dela aberta, e só a da bancada certa', () => {
  const net = new ValveNetwork([0, 0, 1, 1], { random: fixed(0.9) });
  net.pots[1].sensor.value = 10; // vaso 1 (bancada 0) seco
  net.update(0.1);
  assert.deepEqual(net.motors, [true, false]);
  assert.equal(net.openCount(), 1);
});

test('vaso bloqueado nunca é regado, mesmo seco; ao liberar volta a regar', () => {
  const net = new ValveNetwork([0], { random: fixed(0) });
  net.pots[0].sensor.value = 5;
  net.setEnabled(0, false);
  assert.equal(run(net, 5), 0);
  assert.equal(net.valves[0].open, false);
  assert.equal(net.toggleEnabled(0), true);
  net.update(0.1);
  assert.equal(net.valves[0].open, true);
});

test('bloquear uma válvula aberta fecha na hora', () => {
  const net = new ValveNetwork([0], { random: fixed(0) });
  net.pots[0].sensor.value = 5;
  net.update(0.1);
  assert.equal(net.valves[0].open, true);
  net.setEnabled(0, false);
  net.update(0.1);
  assert.equal(net.valves[0].open, false);
  assert.deepEqual(net.motors, [false]);
});

test('manual: não rega sozinho; "Regar agora" abre as válvulas liberadas da bancada', () => {
  const net = new ValveNetwork([0, 0, 1], { random: fixed(0) });
  net.pots.forEach((p) => { p.sensor.value = 5; });
  net.setMode(0, 'manual');
  net.update(0.1);
  assert.deepEqual(net.valves.map((v) => v.open), [false, false, true], 'bancada 1 continua no automático');
  net.setEnabled(1, false);
  assert.equal(net.waterNow(0), 1, 'só a válvula liberada');
  net.update(0.1);
  assert.deepEqual(net.valves.map((v) => v.open), [true, false, true]);
  run(net, MANUAL_SECONDS + 0.5);
  assert.equal(net.valves[0].open, false, 'fecha sozinha depois do tempo');
});

test('"Regar agora" não faz nada no modo automático', () => {
  const net = new ValveNetwork([0], { random: fixed(0.9) });
  assert.equal(net.waterNow(0), 0);
});

test('sem vaso embaixo do bico, a válvula não abre no automático', () => {
  const net = new ValveNetwork([0, 0], { random: fixed(0) });
  net.pots[0].sensor.value = 5;
  net.setPot(0, null); // vaso tirado do lugar
  net.update(0.1);
  assert.equal(net.valves[0].open, false);
  net.setPot(1, 0); // vaso colocado embaixo da outra válvula
  net.update(0.1);
  assert.equal(net.valves[1].open, true, 'a outra válvula passa a cuidar dele');
});

test('umidade de cada vaso fica sempre entre 0 e 100%', () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const net = new ValveNetwork(Array.from({ length: 16 }, (_, i) => (i < 8 ? 0 : 1)), { random: rnd });
  net.setMode(1, 'manual');
  for (let i = 0; i < 3000; i++) { // 5 minutos
    if (i % 300 === 0) net.waterNow(1);
    net.update(0.1);
    for (const p of net.pots) {
      const m = p.sensor.read();
      assert.ok(m >= 0 && m <= 100);
    }
  }
});
