// Irrigação das bancadas laterais:
//   motor + caixa d'água em cima, placa ESP32 + relés, cano principal ao longo da
//   bancada e uma derivação para cada vaso. Em cada curva, uma VÁLVULA SOLENOIDE
//   com duas luzes (vermelha = fechada, verde = regando) e um bipe ao abrir.
//   Uma placa perto da bancada esquerda explica válvula -> relé -> placa.
//
// Desempenho (Quest): canos, cabos, válvulas, LEDs e gotas são agrupados
// (geometria mesclada e InstancedMesh), então tudo custa poucos draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ValveNetwork } from '../valves.js';
import { BENCH_TOP_Y } from './surfaces.js';

const TOP_Y = 0.8; // tampo das bancadas (ver environment.js > buildBenches)
const MAIN_Y = TOP_Y + 0.06; // cano principal, na borda de trás da bancada
const ELBOW_Y = TOP_Y + 0.32; // curva que leva a água por cima do vaso
const POT_SOIL_Y = BENCH_TOP_Y + 0.1; // onde as gotas somem quando há vaso embaixo do bico
const SLOT_RADIUS = 0.12; // vaso a até 12 cm do lugar dele ainda recebe a água do bico
const MOTOR_Z = -3.12; // motor na ponta da bancada (o primeiro vaso fica em z = -2,6)

const LED_RED_ON = new THREE.Color(0xff2222);
const LED_RED_OFF = new THREE.Color(0x3a0b0b);
const LED_GREEN_ON = new THREE.Color(0x22ff55);
const LED_GREEN_OFF = new THREE.Color(0x0b2a14);

/** Cano reto em segmentos (cantos vivos, como conexões em L). */
function pipe(points, radius) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) {
    path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i + 1])));
  }
  return new THREE.TubeGeometry(path, points.length * 6, radius, 8, false);
}

function labelTexture(text, w = 256, h = 64, bg = '#0f3d2e', fg = '#d1fae5') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${Math.round(h * 0.45)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Placa explicativa: válvula solenoide -> relé -> placa (ESP32).
function buildSign(scene, x, z, rotY) {
  const W = 1024;
  const H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1622';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#22c55e';
  g.fillRect(0, 0, W, 12);
  g.fillStyle = '#f8fafc';
  g.font = 'bold 50px sans-serif';
  g.fillText('Irrigação das bancadas', 40, 80);
  g.font = '29px sans-serif';
  g.fillStyle = '#cbd5e1';
  const lines = [
    'Cada vaso tem uma VÁLVULA SOLENOIDE: a caixinha na curva do cano.',
    'Ela é uma torneira elétrica. Com energia, a bobina vira um ímã,',
    'puxa o êmbolo e a água passa. Sem energia, uma mola fecha a passagem.',
    'A válvula é ligada a um RELÉ, um interruptor que a placa-mãe do',
    'sistema (ESP32) liga e desliga conforme a umidade de cada vaso.',
  ];
  lines.forEach((t, i) => g.fillText(t, 40, 140 + i * 42));
  g.font = 'bold 29px sans-serif';
  g.fillStyle = '#4ade80';
  g.fillText('Terra seca  → relé liga  → válvula abre  → luz VERDE + bipe', 40, 375);
  g.fillStyle = '#f87171';
  g.fillText('Terra úmida → relé desliga → válvula fecha → luz VERMELHA', 40, 420);

  // Diagrama: ESP32 -> RELÉ -> VÁLVULA -> VASO
  const boxes = ['ESP32', 'RELÉ', 'VÁLVULA', 'VASO'];
  const bw = 190;
  const gap = (W - 80 - boxes.length * bw) / (boxes.length - 1);
  boxes.forEach((label, i) => {
    const bx = 40 + i * (bw + gap);
    g.fillStyle = ['#1d4ed8', '#7c3aed', '#0f766e', '#a16207'][i];
    g.fillRect(bx, 480, bw, 90);
    g.fillStyle = '#fff';
    g.font = 'bold 32px sans-serif';
    g.textAlign = 'center';
    g.fillText(label, bx + bw / 2, 537);
    g.textAlign = 'left';
    if (i < boxes.length - 1) {
      g.fillStyle = '#e2e8f0';
      const ax = bx + bw + 10;
      g.fillRect(ax, 521, gap - 34, 8);
      g.beginPath();
      g.moveTo(ax + gap - 34, 509);
      g.lineTo(ax + gap - 18, 525);
      g.lineTo(ax + gap - 34, 541);
      g.fill();
    }
  });
  g.font = '25px sans-serif';
  g.fillStyle = '#94a3b8';
  g.fillText('O motor bombeia a água da caixa d\'água (em cima dele) para o cano.', 40, 625);
  g.fillText('Ele só liga quando alguma válvula da bancada está aberta.', 40, 662);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95 * (H / W)), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  board.position.y = 1.45;
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.95 * (H / W) + 0.05, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 }),
  );
  back.position.set(0, 1.45, -0.02);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x374151 }));
  post.position.set(0, 0.6, -0.06); // atrás da placa, para não cobrir o texto
  group.add(board, back, post);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

/**
 * @param {THREE.Scene} scene
 * @param {{x:number,z:number}[]} spots posições dos vasos das bancadas (room.benchSpots)
 * @param {object} o
 * @param {import('../audio.js').SoundManager} o.sound
 * @param {boolean} o.low modo leve: sem modelos de planta nas bancadas, então põe vasos simples
 * @param {THREE.Object3D[]} o.grabbables lista de objetos pegáveis (PC e VR): os vasos entram nela
 */
export function createBenchIrrigation(scene, spots, { sound, low = false, grabbables = [] }) {
  const sides = [-1, 1]
    .map((s) => ({ s, pots: spots.filter((p) => Math.sign(p.x) === s).sort((a, b) => a.z - b.z) }))
    .filter((side) => side.pots.length);
  const valvePos = []; // centro de cada válvula
  const nozzles = []; // bico de cada derivação (de onde cai a água)
  const groups = [];
  const slots = []; // lugar original de cada vaso (um por válvula)
  const pipeGeos = [];
  const cableGeos = [];

  const motorMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, metalness: 0.6, roughness: 0.4 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x1d5fbf, roughness: 0.55 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 });
  const motors = [];

  sides.forEach(({ s, pots }, sideIndex) => {
    const bx = pots[0].x;
    const xm = bx + s * 0.27; // cano principal, do lado da parede
    const mx = bx + s * 0.1; // motor
    const lastZ = pots[pots.length - 1].z;

    // Motor (bomba) com a caixa d'água em cima.
    const motor = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.22), motorMat);
    body.position.y = 0.065;
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 16), motorMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(-s * 0.04, 0.09, 0);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.24, 24), tankMat);
    tank.position.y = 0.13 + 0.12;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 24), lidMat);
    lid.position.y = 0.13 + 0.24 + 0.012;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1f2937, toneMapped: false }));
    led.position.set(-s * 0.101, 0.09, 0.07);
    for (const m of [body, coil, tank, lid]) {
      m.castShadow = true;
      motor.add(m);
    }
    motor.add(led);
    const tankLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.045),
      new THREE.MeshBasicMaterial({ map: labelTexture("CAIXA D'ÁGUA", 256, 64, '#0c3a7a', '#e0f2fe') }),
    );
    tankLabel.position.set(-s * 0.137, 0.27, 0);
    tankLabel.rotation.y = -s * Math.PI / 2;
    motor.add(tankLabel);
    motor.position.set(mx, TOP_Y + 0.025, MOTOR_Z);
    scene.add(motor);
    motors.push({ group: motor, led, hum: sound ? sound.create(motor, sound.buffers.hum, { loop: true, volume: 0.35, refDistance: 0.4 }) : null });

    // Placa ESP32 + relés, perto do motor (no lado do corredor).
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.03, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6 }),
    );
    board.position.set(bx - s * 0.2, TOP_Y + 0.04, MOTOR_Z);
    const boardLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.04),
      new THREE.MeshBasicMaterial({ map: labelTexture('ESP32 + RELÉS') }),
    );
    boardLabel.rotation.x = -Math.PI / 2;
    boardLabel.position.set(bx - s * 0.2, TOP_Y + 0.056, MOTOR_Z);
    scene.add(board, boardLabel);

    // Cano: saída do motor -> borda de trás da bancada -> ao longo dos vasos.
    pipeGeos.push(pipe([
      [mx, TOP_Y + 0.1, MOTOR_Z + 0.11],
      [mx, TOP_Y + 0.1, MOTOR_Z + 0.2],
      [xm, MAIN_Y, MOTOR_Z + 0.2],
      [xm, MAIN_Y, lastZ + 0.05],
    ], 0.013));
    // Cabo da placa até as válvulas (corre junto do cano).
    cableGeos.push(pipe([
      [bx - s * 0.2, TOP_Y + 0.05, MOTOR_Z + 0.05],
      [bx - s * 0.2, TOP_Y + 0.03, MOTOR_Z + 0.3],
      [xm - s * 0.03, TOP_Y + 0.03, MOTOR_Z + 0.3],
      [xm - s * 0.03, TOP_Y + 0.03, lastZ],
    ], 0.004));

    // Uma derivação por vaso, com a válvula na curva.
    for (const p of pots) {
      const nozX = p.x + s * 0.05;
      pipeGeos.push(pipe([
        [xm, MAIN_Y, p.z],
        [xm, ELBOW_Y, p.z],
        [nozX, ELBOW_Y, p.z],
        [nozX, ELBOW_Y - 0.06, p.z],
      ], 0.008));
      cableGeos.push(pipe([
        [xm - s * 0.03, TOP_Y + 0.03, p.z],
        [xm - s * 0.03, ELBOW_Y - 0.09, p.z],
      ], 0.004));
      valvePos.push(new THREE.Vector3(xm, ELBOW_Y - 0.06, p.z));
      nozzles.push({ pos: new THREE.Vector3(nozX, ELBOW_Y - 0.07, p.z), side: s });
      groups.push(sideIndex);
      slots.push({ x: p.x, z: p.z, label: `${s < 0 ? 'E' : 'D'}${pots.indexOf(p) + 1}` });
    }
  });

  const pipeMesh = new THREE.Mesh(mergeGeometries(pipeGeos), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.35, metalness: 0.1 }));
  pipeMesh.castShadow = true;
  const cableMesh = new THREE.Mesh(mergeGeometries(cableGeos), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
  scene.add(pipeMesh, cableMesh);

  // Válvulas solenoides (caixinhas) e LEDs: InstancedMesh.
  const n = valvePos.length;
  const valveMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.4, roughness: 0.5 }),
    n,
  );
  const ledMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), n * 2);
  const d = new THREE.Object3D();
  valvePos.forEach((v, i) => {
    d.position.copy(v);
    d.updateMatrix();
    valveMesh.setMatrixAt(i, d.matrix);
    // LEDs na face virada para o corredor: vermelho à esquerda, verde à direita.
    const s = nozzles[i].side;
    const faceX = v.x - s * 0.036;
    d.position.set(faceX, v.y + 0.015, v.z - s * 0.016);
    d.updateMatrix();
    ledMesh.setMatrixAt(i * 2, d.matrix);
    d.position.set(faceX, v.y + 0.015, v.z + s * 0.016);
    d.updateMatrix();
    ledMesh.setMatrixAt(i * 2 + 1, d.matrix);
    ledMesh.setColorAt(i * 2, LED_RED_ON);
    ledMesh.setColorAt(i * 2 + 1, LED_GREEN_OFF);
  });
  valveMesh.castShadow = true;
  scene.add(valveMesh, ledMesh);

  // Bipe de cada válvula (som posicional: vem da válvula que abriu).
  const beeps = valvePos.map((v) => {
    if (!sound) return null;
    const anchor = new THREE.Object3D();
    anchor.position.copy(v);
    scene.add(anchor);
    return sound.create(anchor, sound.buffers.beep, { volume: 0.6, refDistance: 0.5 });
  });

  // ---------------------------------------------------------------------------
  // Vasos das bancadas como objetos com "física" simples: podem ser pegos
  // (PC: modo FPS; VR: gatilho lateral), caem e pousam na bancada, mesa ou chão.
  // ---------------------------------------------------------------------------
  const potObjects = []; // índice = número do vaso na ValveNetwork
  const makeGrabbable = (obj, baseOffset) => {
    obj.userData = { ...obj.userData, baseOffset, insertDepth: 0, falling: false, vy: 0, held: null, benchPot: potObjects.length };
    potObjects.push(obj);
    grabbables.push(obj);
  };

  // Modo leve: as plantas das bancadas não são carregadas, então cada vaso é um
  // "proxy" invisível (para pegar e cair) desenhado por um único InstancedMesh.
  let potInstances = null;
  if (low) {
    potInstances = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.05, 0.12, 16),
      new THREE.MeshStandardMaterial({ color: 0xb5562b, roughness: 0.85 }),
      slots.length,
    );
    potInstances.frustumCulled = false;
    const hitGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.14, 8);
    hitGeo.translate(0, 0.07, 0);
    for (const slot of slots) {
      const proxy = new THREE.Group();
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial());
      hit.visible = false; // só para a mira/raio acertar o vaso
      proxy.add(hit);
      proxy.position.set(slot.x, BENCH_TOP_Y, slot.z);
      scene.add(proxy);
      makeGrabbable(proxy, 0);
    }
    scene.add(potInstances);
  }
  // Tampos invisíveis das bancadas: só para a mira do modo FPS saber onde soltar objetos.
  const dropSurfaces = sides.map(({ pots }) => {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 6.8), new THREE.MeshBasicMaterial());
    top.visible = false;
    top.position.set(pots[0].x, BENCH_TOP_Y - 0.01, 0);
    scene.add(top);
    return top;
  });

  const potOffset = new THREE.Matrix4().makeTranslation(0, 0.06, 0);
  const tmpM = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();

  /** Modo completo: recebe os modelos das plantas (props.js) e torna cada um pegável. */
  function setPotObjects(objects) {
    if (low) return;
    objects.forEach((obj) => {
      if (!obj) return;
      obj.updateMatrixWorld(true);
      // Distância da origem do modelo até a base dele (para pousar certo na bancada).
      const minY = new THREE.Box3().setFromObject(obj).min.y;
      makeGrabbable(obj, obj.position.y - minY);
    });
  }

  // Gotas (InstancedMesh com pool fixo).
  const MAX_DROPS = 160;
  const dropMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.006, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    MAX_DROPS,
  );
  dropMesh.frustumCulled = false;
  const drops = Array.from({ length: MAX_DROPS }, () => ({ alive: false, p: new THREE.Vector3(), vy: 0, floor: 0 }));
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_DROPS; i++) dropMesh.setMatrixAt(i, hidden);
  scene.add(dropMesh);
  const spawnTimers = new Array(n).fill(0);

  // Placa explicativa perto da ponta da bancada esquerda, virada para o corredor
  // (dá para ler de dentro da estufa e também de quem entra pela porta).
  buildSign(scene, -2.4, 3.2, Math.atan2(1, -0.35));

  const network = new ValveNetwork(groups);

  // Qual vaso está embaixo de cada bico (se tirar o vaso do lugar, a válvula fica sem ele).
  function assignPots() {
    slots.forEach((slot, i) => {
      let found = null;
      potObjects.forEach((obj, j) => {
        const u = obj.userData;
        if (found !== null || u.held || u.falling) return;
        obj.getWorldPosition(tmpV);
        const baseY = tmpV.y - u.baseOffset;
        if (Math.hypot(tmpV.x - slot.x, tmpV.z - slot.z) < SLOT_RADIUS && Math.abs(baseY - BENCH_TOP_Y) < 0.08) found = j;
      });
      if (network.valves[i].pot !== found) network.setPot(i, found);
    });
  }

  function update(dt) {
    assignPots();
    const opened = network.update(dt);
    if (sound) for (const i of opened) if (beeps[i]) sound.playOnce(beeps[i]);

    // LEDs: vermelho = fechada, verde = regando.
    let ledsChanged = false;
    network.valves.forEach((v, i) => {
      if (v.open === v.shownOpen) return;
      v.shownOpen = v.open;
      ledMesh.setColorAt(i * 2, v.open ? LED_RED_OFF : LED_RED_ON);
      ledMesh.setColorAt(i * 2 + 1, v.open ? LED_GREEN_ON : LED_GREEN_OFF);
      ledsChanged = true;
    });
    if (ledsChanged) ledMesh.instanceColor.needsUpdate = true;

    // Motores: ligam quando alguma válvula da bancada está aberta.
    network.motors.forEach((on, k) => {
      const m = motors[k];
      m.led.material.color.setHex(on ? 0x38bdf8 : 0x1f2937);
      if (m.hum) sound.setPlaying(m.hum, on);
    });

    // Gotas saindo dos bicos das válvulas abertas.
    network.valves.forEach((v, i) => {
      if (!v.open) return;
      spawnTimers[i] -= dt;
      if (spawnTimers[i] > 0) return;
      spawnTimers[i] = 0.07;
      const drop = drops.find((x) => !x.alive);
      if (!drop) return;
      drop.alive = true;
      drop.vy = 0;
      drop.p.copy(nozzles[i].pos);
      drop.floor = v.pot === null ? BENCH_TOP_Y : POT_SOIL_Y; // sem vaso, a água cai na bancada
    });
    drops.forEach((drop, i) => {
      if (!drop.alive) return;
      drop.vy -= 6 * dt;
      drop.p.y += drop.vy * dt;
      if (drop.p.y <= drop.floor) {
        drop.alive = false;
        dropMesh.setMatrixAt(i, hidden);
        return;
      }
      d.position.copy(drop.p);
      d.updateMatrix();
      dropMesh.setMatrixAt(i, d.matrix);
    });
    dropMesh.instanceMatrix.needsUpdate = true;

    // Modo leve: desenha cada vaso onde o proxy dele está (inclusive na mão do jogador).
    if (potInstances) {
      potObjects.forEach((obj, j) => {
        obj.updateWorldMatrix(true, false);
        potInstances.setMatrixAt(j, tmpM.multiplyMatrices(obj.matrixWorld, potOffset));
      });
      potInstances.instanceMatrix.needsUpdate = true;
    }
  }

  return { network, slots, update, setPotObjects, dropSurfaces };
}
