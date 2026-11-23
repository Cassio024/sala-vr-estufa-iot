// Testes da colisão compartilhada (modo FPS no PC e joystick na VR).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollider } from '../js/collision.js';

const WORLD = { half: 4, doorHalfWidth: 0.6, limit: 36, boxes: [{ x: 0, z: -1, hw: 0.7, hd: 0.35 }] };
const c = createCollider(WORLD);

test('móveis e paredes bloqueiam; espaço livre e porta não', () => {
  assert.equal(c.blocked(0, -1), true, 'mesa');
  assert.equal(c.blocked(4, 0), true, 'parede lateral');
  assert.equal(c.blocked(0, -4), true, 'parede do fundo');
  assert.equal(c.blocked(2, 4), true, 'parede da frente fora da porta');
  assert.equal(c.blocked(0, 4), false, 'porta');
  assert.equal(c.blocked(0, 1), false, 'chão livre');
});

test('passo grande não atravessa parede fina', () => {
  const p = { x: 3, z: 0 };
  c.tryMove(p, 3, 0); // tentaria pular de x=3 para x=6 de uma vez
  assert.ok(p.x < 4, `x = ${p.x}`);
});

test('desliza ao longo da parede em vez de travar', () => {
  const p = { x: 3.6, z: 0 };
  c.tryMove(p, 1, 1); // diagonal contra a parede lateral
  assert.ok(p.z > 0.9, 'continuou andando em z');
  assert.ok(p.x < 4, 'não atravessou em x');
});

test('respeita o limite do mundo', () => {
  const p = { x: 35.9, z: 10 };
  c.tryMove(p, 5, 0);
  assert.ok(p.x <= 36);
});
