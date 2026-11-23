// Testes da lógica da estufa (sem three.js e sem dependências).
// Rodar: npm test   (ou: node --test tests/*.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoilMoistureSensor, ProximitySensor, IrrigationController } from '../js/sensors.js';

// Vetor mínimo, no lugar do THREE.Vector3.
const vec = (x, y, z) => ({
  x, y, z,
  clone() { return vec(this.x, this.y, this.z); },
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); },
});

test('sensor de umidade: seca com o tempo e nunca passa de 0–100%', () => {
  const s = new SoilMoistureSensor({ initial: 5, evaporationPerSec: 2 });
  s.update(1);
  assert.equal(s.read(), 3);
  s.update(10);
  assert.equal(s.read(), 0);
  s.addWater(250);
  assert.equal(s.read(), 100);
});

test('bomba automática: liga abaixo de 35% e desliga ao chegar em 70% (histerese)', () => {
  const c = new IrrigationController();
  c.update(0.1, 40);
  assert.equal(c.pumpOn, false, 'acima de 35% não liga');
  c.update(0.1, 34);
  assert.equal(c.pumpOn, true, 'abaixo de 35% liga');
  c.update(0.1, 50);
  assert.equal(c.pumpOn, true, 'entre os limites continua ligada');
  c.update(0.1, 70);
  assert.equal(c.pumpOn, false, 'em 70% desliga');
  c.update(0.1, 50);
  assert.equal(c.pumpOn, false, 'entre os limites continua desligada');
});

test('bomba ligada devolve a água adicionada no frame', () => {
  const c = new IrrigationController({ pumpRatePerSec: 10 });
  assert.equal(c.update(0.5, 20), 5);
  assert.equal(c.update(0.5, 90), 0);
});

test('simulação completa: a umidade nunca sai de 0–100% e oscila entre os limites', () => {
  const s = new SoilMoistureSensor({ initial: 55 });
  const c = new IrrigationController();
  let min = 100;
  let max = 0;
  for (let i = 0; i < 6000; i++) { // 10 minutos a 10 passos/s
    s.update(0.1);
    s.addWater(c.update(0.1, s.read()));
    if (i > 600) { min = Math.min(min, s.read()); max = Math.max(max, s.read()); }
  }
  assert.ok(min >= 0 && max <= 100);
  assert.ok(min > 30 && min <= 36, `mínimo perto de 35% (foi ${min.toFixed(1)})`);
  assert.ok(max >= 70 && max < 75, `máximo perto de 70% (foi ${max.toFixed(1)})`);
});

test('sensor fora do solo (null) desliga a bomba no modo automático', () => {
  const c = new IrrigationController();
  c.update(0.1, 10);
  assert.equal(c.pumpOn, true);
  assert.equal(c.update(0.1, null), 0);
  assert.equal(c.pumpOn, false);
  assert.match(c.log[0], /fora do solo/);
});

test('modo manual: rega pelo tempo configurado e não liga sozinha', () => {
  const c = new IrrigationController({ manualDurationSec: 1 });
  c.toggleMode();
  assert.equal(c.mode, 'manual');
  c.update(0.1, 5);
  assert.equal(c.pumpOn, false, 'solo seco não liga no manual');
  c.requestManualWater();
  c.update(0.5, 60);
  assert.equal(c.pumpOn, true);
  c.update(0.5, 60);
  c.update(0.1, 60);
  assert.equal(c.pumpOn, false, 'desliga depois de 1 s');
});

test('botão REGAR também funciona no automático e depois volta ao controle automático', () => {
  const c = new IrrigationController({ manualDurationSec: 1 });
  c.update(0.1, 60); // 60%: o automático não liga
  assert.equal(c.pumpOn, false);
  assert.equal(c.requestManualWater(), true);
  assert.ok(c.update(0.5, 60) > 0, 'regando');
  c.update(0.6, 60);
  c.update(0.1, 60);
  assert.equal(c.pumpOn, false, 'terminou o tempo: o automático (60% > 35%) não religa');
});

test('água em excesso: a partir de 90% bloqueia bomba e botão; libera abaixo de 85%', () => {
  const c = new IrrigationController({ manualDurationSec: 5 });
  c.requestManualWater();
  c.update(0.1, 80);
  assert.equal(c.pumpOn, true);
  assert.equal(c.update(0.1, 92), 0, 'encharcou: para de regar na hora');
  assert.equal(c.pumpOn, false);
  assert.equal(c.excess, true);
  assert.match(c.log[0], /excesso/);
  assert.equal(c.requestManualWater(), false, 'botão bloqueado');
  assert.match(c.log[0], /bloqueada/);
  c.update(0.1, 87);
  assert.equal(c.excess, true, 'histerese: 87% ainda é excesso');
  c.update(0.1, 84);
  assert.equal(c.excess, false);
  assert.equal(c.requestManualWater(), true);
});

test('sensor fora do solo não acusa excesso', () => {
  const c = new IrrigationController();
  c.update(0.1, null);
  assert.equal(c.excess, false);
});

test('trocar de modo desliga a bomba e registra o evento', () => {
  const c = new IrrigationController();
  c.update(0.1, 10);
  c.toggleMode();
  assert.equal(c.pumpOn, false);
  assert.match(c.log[0], /manual/);
});

test('log guarda só os 4 últimos eventos', () => {
  const c = new IrrigationController();
  for (let i = 0; i < 10; i++) c.event(`e${i}`);
  assert.deepEqual(c.log, ['e9', 'e8', 'e7', 'e6']);
});

test('sensor de proximidade dispara dentro do raio', () => {
  const p = new ProximitySensor(vec(0, 1, 0), 0.22);
  assert.equal(p.isTriggered(vec(0, 1.2, 0)), true);
  assert.equal(p.isTriggered(vec(0.3, 1, 0)), false);
});
