// Bomba d'água feita por nós (formas simples, leve para o Quest).
// No PC o modelo bomba.glb (~150 mil triângulos) toma o lugar dela; no modo leve
// (headset) é esta que aparece, em vez de uma caixa.
//
//   [entrada] ─ cabeçote (voluta) ─ motor com aletas ─ tampa do ventilador
//                    │ saída (para cima)
//   Em cima do motor fica a caixa de ligação (onde chega o fio vermelho) com o LED.
//   Ligada, a bomba vibra um pouco e o eixo aparente gira.
//
// Desempenho: as peças de cada material são mescladas (5 malhas, ~1.350 triângulos).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Medidas em metros, origem no centro da base (em cima da mesa).
const MOTOR = { x: 0.035, y: 0.062, r: 0.042, len: 0.1 };
const HEAD = { x: -0.04, r: 0.05, len: 0.045 };
export const PUMP_PORTS = {
  inlet: new THREE.Vector3(HEAD.x - HEAD.len / 2 - 0.03, MOTOR.y, 0), // entrada axial (lado da caixa d'água)
  outlet: new THREE.Vector3(HEAD.x, MOTOR.y + HEAD.r + 0.03, 0), // saída para cima (tubo até o vaso)
  power: new THREE.Vector3(MOTOR.x, MOTOR.y + MOTOR.r + 0.012, -0.022), // caixa de ligação (fio vermelho)
};

/** Cilindro deitado no eixo X. */
function cylX(r1, r2, len, x, y, z = 0, seg = 18) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function box(w, h, d, x, y, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function buildWaterPump() {
  const blue = [];
  const steel = [];
  const dark = [];

  // Base e pés.
  dark.push(box(0.2, 0.012, 0.1, 0.0, 0.006));
  for (const x of [-0.05, 0.06]) dark.push(box(0.03, 0.016, 0.085, x, 0.02));

  // Motor: corpo azul com aletas de refrigeração e tampa do ventilador.
  blue.push(cylX(MOTOR.r, MOTOR.r, MOTOR.len, MOTOR.x, MOTOR.y));
  for (let i = 0; i < 7; i++) {
    blue.push(cylX(MOTOR.r + 0.005, MOTOR.r + 0.005, 0.004, MOTOR.x - MOTOR.len / 2 + 0.012 + i * 0.013, MOTOR.y));
  }
  dark.push(cylX(MOTOR.r - 0.004, MOTOR.r + 0.002, 0.024, MOTOR.x + MOTOR.len / 2 + 0.012, MOTOR.y));
  // Grade da tampa (barrinhas).
  for (let i = -2; i <= 2; i++) steel.push(box(0.003, 0.06, 0.004, MOTOR.x + MOTOR.len / 2 + 0.025, MOTOR.y, i * 0.012));
  // Caixa de ligação em cima do motor.
  blue.push(box(0.045, 0.024, 0.042, MOTOR.x, MOTOR.y + MOTOR.r + 0.008));
  dark.push(box(0.012, 0.012, 0.012, MOTOR.x, MOTOR.y + MOTOR.r + 0.012, -0.026)); // prensa-cabo

  // Cabeçote da bomba (voluta) com flange, entrada axial e saída para cima.
  steel.push(cylX(HEAD.r, HEAD.r, HEAD.len, HEAD.x, MOTOR.y, 0, 22));
  steel.push(cylX(HEAD.r - 0.012, HEAD.r - 0.004, 0.012, HEAD.x + HEAD.len / 2 + 0.006, MOTOR.y)); // flange
  dark.push(cylX(0.016, 0.016, 0.03, HEAD.x - HEAD.len / 2 - 0.015, MOTOR.y, 0, 14)); // entrada
  const out = new THREE.CylinderGeometry(0.014, 0.014, 0.035, 14);
  out.translate(HEAD.x, MOTOR.y + HEAD.r + 0.012, 0);
  dark.push(out);
  // Parafusos da voluta.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    steel.push(cylX(0.004, 0.004, 0.006, HEAD.x - HEAD.len / 2 - 0.002, MOTOR.y + Math.sin(a) * 0.038, Math.cos(a) * 0.038, 6));
  }

  const group = new THREE.Group();
  const body = new THREE.Group(); // o que vibra quando a bomba está ligada
  const mats = {
    blue: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.55, roughness: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.3, roughness: 0.6 }),
  };
  for (const [key, list] of [['blue', blue], ['steel', steel], ['dark', dark]]) {
    const m = new THREE.Mesh(mergeGeometries(list), mats[key]);
    m.castShadow = true;
    m.receiveShadow = true;
    body.add(m);
  }

  // Eixo aparente entre o motor e o cabeçote (gira quando liga).
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.014, 6).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.3 }),
  );
  shaft.position.set(HEAD.x + HEAD.len / 2 + 0.018, MOTOR.y, 0);
  body.add(shaft);

  // LED na frente da caixa de ligação.
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1f2937, toneMapped: false }));
  led.position.set(MOTOR.x, MOTOR.y + MOTOR.r + 0.008, 0.022);
  body.add(led);

  group.add(body);
  let t = 0;
  /** Vibração e eixo girando enquanto a bomba está ligada. */
  function update(dt, on) {
    t += dt;
    if (on) {
      shaft.rotation.x += dt * 40;
      body.position.set(Math.sin(t * 90) * 0.0006, Math.abs(Math.sin(t * 70)) * 0.0004, 0);
    } else if (body.position.lengthSq() > 0) {
      body.position.set(0, 0, 0);
    }
  }

  return { group, led, update };
}
