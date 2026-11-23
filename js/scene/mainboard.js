// Placa-mãe da estufa: caixa no fundo (parede de trás) que recebe todos os fios.
//   preto    = sinal dos relés (placas de relés das bancadas)
//   vermelho = força das bombas (motores das bancadas e bomba da mesa)
//   amarelo  = sensores (sensor de umidade da mesa e sensor de proximidade)
// Os fios descem da caixa, correm numa canaleta no chão junto da parede e sobem
// até cada aparelho. O fio do sensor de umidade acompanha o sensor quando ele é
// pego (a geometria é refeita só quando ele se mexe).
//
// Desempenho: os fios fixos de cada cor são uma malha só (geometria mesclada).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FLOOR_Y = 0.012;
const DUCT_Y = 0.02; // altura dos fios dentro da canaleta

const COLORS = { relay: 0x111111, power: 0xdc2626, sensor: 0xfacc15 };

/** Fio reto em segmentos (cantos vivos). */
function wire(points, radius = 0.006) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) {
    path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  }
  return new THREE.TubeGeometry(path, (points.length - 1) * 2, radius, 6, false);
}

function frontTexture() {
  const W = 512;
  const H = 384;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#d1d5db';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1f2937';
  g.font = 'bold 40px sans-serif';
  g.fillText('FIOS', 48, 84);
  // Legenda das cores dos fios.
  const rows = [
    ['#111111', 'preto: sinal dos relés'],
    ['#dc2626', 'vermelho: força das bombas'],
    ['#facc15', 'amarelo: sensores'],
  ];
  g.textAlign = 'left';
  g.font = '28px sans-serif';
  rows.forEach(([col, txt], i) => {
    const y = 160 + i * 70;
    g.fillStyle = col;
    g.fillRect(48, y - 14, 80, 18);
    g.fillStyle = '#1f2937';
    g.fillText(txt, 150, y + 4);
  });
  // Etiqueta de alerta elétrico.
  g.fillStyle = '#facc15';
  g.beginPath();
  g.moveTo(W - 70, H - 30);
  g.lineTo(W - 30, H - 30);
  g.lineTo(W - 50, H - 66);
  g.closePath();
  g.fill();
  g.fillStyle = '#111';
  g.font = 'bold 26px sans-serif';
  g.fillText('!', W - 55, H - 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {THREE.Scene} scene
 * @param {object} o
 * @param {number} o.wallZ z da parede de trás (a caixa encosta nela)
 * @param {{relay: THREE.Vector3[], power: THREE.Vector3[]}[]} o.benches caminho de cada fio na bancada, do chão (1º ponto) até o aparelho
 * @param {THREE.Vector3} o.pump bomba da mesa (ponto de ligação, atrás dela)
 * @param {THREE.Vector3} o.proximity sensor de proximidade (centro)
 * @param {THREE.Object3D} o.probe sensor de umidade (pode ser pego)
 * @param {number} o.probeTop distância do centro do sensor até o topo dele
 * @param {{z:number, y:number, legX:number, legZ:number}} o.table borda de trás da mesa (z), altura do tampo (y) e pernas de trás (±legX, legZ)
 * @param {{x:number, z:number, rimY:number, radius:number}} o.pot vaso principal: o fio do sensor passa por cima da borda
 */
export function createMainboard(scene, { wallZ, benches, pump, proximity, probe, probeTop, table, pot }) {
  const group = new THREE.Group();
  const BOX = { w: 0.5, h: 0.4, d: 0.14, y: 1.25 };
  const boxZ = wallZ + 0.02 + BOX.d / 2;
  group.position.set(0, BOX.y, boxZ);
  group.userData.fpsTip = 'Placa-mãe (ESP32): recebe os fios dos relés, das bombas e dos sensores';
  scene.add(group);

  const metal = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.5, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d), metal);
  body.castShadow = true;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(BOX.w - 0.04, BOX.h - 0.04), new THREE.MeshStandardMaterial({ map: frontTexture(), roughness: 0.6 }));
  front.position.z = BOX.d / 2 + 0.001;
  // Prensa-cabos embaixo, por onde saem os fios.
  const gland = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: 0x374151 }));
  gland.position.set(0, -BOX.h / 2 - 0.015, 0);
  group.add(body, front, gland);

  // LEDs de estado na lateral de cima da frente: energia, "batimento" (programa
  // rodando), bancada esquerda, bancada direita e bomba da mesa.
  const ledDefs = [
    { key: 'power', color: 0x22c55e },
    { key: 'beat', color: 0x38bdf8 },
    { key: 'bench0', color: 0xf97316 },
    { key: 'bench1', color: 0xf97316 },
    { key: 'pump', color: 0xf97316 },
  ];
  const leds = {};
  const ledGeo = new THREE.SphereGeometry(0.009, 8, 6);
  ledDefs.forEach((d, i) => {
    const m = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0x1f2937, toneMapped: false }));
    m.position.set(-0.16 + i * 0.08, BOX.h / 2 - 0.012, BOX.d / 2 + 0.006);
    group.add(m);
    leds[d.key] = { mesh: m, on: new THREE.Color(d.color), off: new THREE.Color(0x1f2937) };
  });

  // ---------------------------------------------------------------------------
  // Fios fixos
  // ---------------------------------------------------------------------------
  const geos = { relay: [], power: [], sensor: [] };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const outY = BOX.y - BOX.h / 2 - 0.03; // saída do prensa-cabos
  const ductZ = wallZ + 0.06;
  // Cada fio sai num x diferente do prensa-cabos e desce até a canaleta.
  let slot = 0;
  const leave = (side) => {
    const x = side * (0.02 + 0.025 * slot++);
    return [v(x, outY, boxZ), v(x, DUCT_Y, boxZ), v(x, DUCT_Y, ductZ)];
  };
  // Da canaleta vai pelo chão até o pé da bancada e segue o caminho que a bancada informou
  // (sobe pela perna, contorna a borda do tampo e chega na placa de relés / motor).
  const benchRun = (path) => {
    const start = path[0];
    return [...leave(Math.sign(start.x) || 1), v(start.x, DUCT_Y, ductZ), ...path];
  };
  for (const { relay, power } of benches) {
    geos.relay.push(wire(benchRun(relay)));
    geos.power.push(wire(benchRun(power)));
  }

  // Mesa do meio: os fios vão pelo chão até a perna de trás, sobem por ela, contornam a
  // borda do tampo e correm junto da borda de trás até o aparelho (sem atravessar a mesa).
  // lane = distância da borda de trás em que o fio corre no tampo (fios lado a lado).
  const tableRun = (side, dx, lane, target) => {
    const x = side * table.legX + dx;
    const legBack = table.legZ - 0.035;
    const onTop = table.y + 0.006;
    return [
      ...leave(side),
      v(x, DUCT_Y, ductZ),
      v(x, DUCT_Y, legBack),
      v(x, table.y - 0.08, legBack), // sobe pela perna
      v(x, table.y - 0.08, table.z - 0.025), // sai para fora da borda
      v(x, onTop, table.z - 0.025), // sobe pela borda
      v(x, onTop, table.z + lane), // deita no tampo
      v(target.x, onTop, table.z + lane), // corre junto da borda de trás
      v(target.x, onTop, target.z),
      target,
    ];
  };
  geos.power.push(wire(tableRun(Math.sign(pump.x) || -1, 0, 0.025, pump)));

  // Sensor de proximidade: uma base pequena no tampo, embaixo da "bolinha".
  const proxBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.03), new THREE.MeshStandardMaterial({ color: 0x1e3a8a }));
  proxBase.position.set(proximity.x, table.y + 0.0125, proximity.z);
  scene.add(proxBase);
  geos.sensor.push(wire(tableRun(1, 0, 0.025, v(proximity.x, table.y + 0.006, proximity.z - 0.015))));

  // Conector do sensor de umidade na borda de trás da mesa (o fio móvel parte daqui).
  const probeX = 0.2;
  const connector = v(probeX, table.y + 0.012, table.z + 0.05);
  geos.sensor.push(wire(tableRun(1, -0.014, 0.04, v(probeX, table.y + 0.006, table.z + 0.05))));
  const plug = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  plug.position.copy(connector).setY(table.y + 0.01);
  scene.add(plug);

  // Canaleta cinza no chão, junto da parede, cobrindo os fios.
  const xs = benches.map((b) => Math.max(Math.abs(b.relay[0].x), Math.abs(b.power[0].x)));
  const half = (xs.length ? Math.max(...xs) : 1) + 0.05;
  const duct = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.035, 0.07), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7 }));
  duct.position.set(0, FLOOR_Y + 0.012, ductZ);
  duct.receiveShadow = true;
  scene.add(duct);

  for (const [kind, list] of Object.entries(geos)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.7 }));
    scene.add(mesh);
  }

  // ---------------------------------------------------------------------------
  // Fio móvel do sensor de umidade (curva com "barriga", refeita quando o sensor se mexe)
  // ---------------------------------------------------------------------------
  const probeWire = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: COLORS.sensor, roughness: 0.7 }));
  probeWire.frustumCulled = false;
  scene.add(probeWire);
  const lastTop = new THREE.Vector3(Infinity, 0, 0);
  const top = new THREE.Vector3();
  const toConn = new THREE.Vector3(connector.x - pot.x, 0, connector.z - pot.z).normalize();
  const rimAt = (r, y) => v(pot.x + toConn.x * r, y, pot.z + toConn.z * r);

  function updateProbeWire() {
    probe.updateWorldMatrix(true, false);
    top.set(0, probeTop, 0).applyMatrix4(probe.matrixWorld);
    if (top.distanceToSquared(lastTop) < 1e-6) return;
    lastTop.copy(top);
    const pts = [connector.clone(), connector.clone().setY(connector.y + 0.02)];
    const inPot = Math.hypot(top.x - pot.x, top.z - pot.z) < pot.radius + 0.03 && top.y > pot.rimY - 0.15;
    if (inPot) {
      // Sensor no vaso: o fio sobe por fora, passa por cima da borda e desce até o sensor.
      pts.push(rimAt(pot.radius + 0.03, pot.rimY - 0.02), rimAt(pot.radius + 0.005, pot.rimY + 0.03));
      pts.push(top.clone().setY(Math.max(top.y, pot.rimY) + 0.045));
    } else {
      // Fora do vaso (na mão ou na mesa): curva com "barriga".
      const len = connector.distanceTo(top);
      const mid = new THREE.Vector3().lerpVectors(connector, top, 0.5);
      mid.y = Math.max(table.y + 0.01, Math.min(connector.y, top.y) + 0.02 - len * 0.15);
      pts.push(mid, top.clone().setY(top.y + 0.04));
    }
    pts.push(top.clone());
    probeWire.geometry.dispose();
    probeWire.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.0035, 5, false);
  }
  updateProbeWire();

  let t = 0;
  /**
   * @param {number} dt
   * @param {object} s
   * @param {boolean[]} s.benchMotors motor de cada bancada ligado?
   * @param {boolean} s.pumping bomba da mesa ligada?
   */
  function update(dt, { benchMotors = [], pumping = false } = {}) {
    t += dt;
    const set = (key, on) => leds[key] && leds[key].mesh.material.color.copy(on ? leds[key].on : leds[key].off);
    set('power', true);
    set('beat', t % 1 < 0.15); // pisca 1x por segundo: o programa está rodando
    set('bench0', Boolean(benchMotors[0]));
    set('bench1', Boolean(benchMotors[1]));
    set('pump', pumping);
    updateProbeWire();
  }

  return { group, targets: [body, front], update };
}
