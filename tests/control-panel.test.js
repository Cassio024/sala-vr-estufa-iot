// Cliques no painel de controle das bancadas (sem tela: o canvas é falso e o
// "raio" devolve direto a coordenada da tela que foi acertada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/three-loader.mjs', import.meta.url);
// Canvas 2D falso: aceita qualquer desenho sem fazer nada.
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= {};
globalThis.document.createElement = () => ({ getContext: () => ctx, width: 0, height: 0 });
const THREE = await import('three');
const { ControlPanel } = await import('../js/ui/control-panel.js');
const { ValveNetwork, MANUAL_SECONDS } = await import('../js/valves.js');

const W = 1024;
const H = 800;
function setup() {
  const groups = Array.from({ length: 16 }, (_, i) => (i < 8 ? 0 : 1));
  const net = new ValveNetwork(groups, { random: () => 0.9 }); // todos úmidos: nada abre sozinho
  const slots = groups.map((g, i) => ({ label: `${g ? 'D' : 'E'}${(i % 8) + 1}` }));
  const events = [];
  const panel = new ControlPanel(new THREE.Scene(), net, slots, { position: new THREE.Vector3(), onEvent: (m) => events.push(m) });
  // Clique no pixel (x, y) da tela do painel.
  const click = (x, y) => panel.handleRay({ intersectObject: () => [{ uv: new THREE.Vector2(x / W, 1 - y / H) }] });
  const center = (id) => {
    const b = panel.buttons.find((r) => r.id === id);
    assert.ok(b, `botão ${id} existe`);
    return [b.x + b.w / 2, b.y + b.h / 2];
  };
  return { net, panel, events, click, center };
}

test('Manual muda o modo das bancadas selecionadas (Todas)', () => {
  const { net, click, center } = setup();
  click(...center('manual'));
  assert.deepEqual(net.modes, ['manual', 'manual']);
  click(...center('auto'));
  assert.deepEqual(net.modes, ['auto', 'auto']);
});

test('selecionar só a Direita muda só a bancada direita', () => {
  const { net, click, center } = setup();
  click(...center('sel-dir'));
  click(...center('manual'));
  assert.deepEqual(net.modes, ['auto', 'manual']);
});

test('Regar agora abre as válvulas (no manual) e fecham depois de alguns segundos', () => {
  const { net, panel, click, center } = setup();
  click(...center('sel-esq'));
  click(...center('manual'));
  panel.draw(); // o botão "Regar agora" só fica ativo no manual
  click(...center('regar'));
  net.update(0.1);
  assert.equal(net.openCount(), 8, 'as 8 da esquerda');
  for (let i = 0; i < (MANUAL_SECONDS + 1) * 10; i++) net.update(0.1);
  assert.equal(net.openCount(), 0);
});

test('clicar num vaso bloqueia ("não regar") e clicar de novo libera', () => {
  const { net, click, center, events } = setup();
  click(...center('pot-3'));
  assert.equal(net.valves[3].enabled, false);
  assert.match(events.at(-1), /E4.*NÃO regar/);
  click(...center('pot-3'));
  assert.equal(net.valves[3].enabled, true);
});

test('Liberar todos desbloqueia os vasos da seleção', () => {
  const { net, click, center } = setup();
  click(...center('pot-0'));
  click(...center('pot-9'));
  click(...center('liberar'));
  assert.ok(net.valves.every((v) => v.enabled));
});

test('clique fora dos botões não faz nada, mas não "vaza" para o que está atrás', () => {
  const { net, click } = setup();
  assert.equal(click(5, 5), true);
  assert.deepEqual(net.modes, ['auto', 'auto']);
});
