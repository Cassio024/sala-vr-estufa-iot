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
import { BENCH_TOP_Y, setScalePads } from './surfaces.js';

const TOP_Y = 0.8; // tampo das bancadas (ver environment.js > buildBenches)
const MAIN_Y = TOP_Y + 0.06; // cano principal, na borda de trás da bancada
const ELBOW_Y = TOP_Y + 0.38; // curva que leva a água por cima do vaso
// Balança de segurança embaixo de cada vaso: a válvula só abre com um vaso em cima dela.
export const SCALE_H = 0.024;
export const SCALE_TOP = BENCH_TOP_Y + SCALE_H; // onde a base dos vasos fica
const SCALE_HALF = 0.085;
const CABLE_Y = BENCH_TOP_Y + 0.005; // cabos deitados no tampo
const BOARD_Z = -3.33; // placa de relés na ponta da bancada (atrás do motor)
const POT_SOIL_Y = SCALE_TOP + 0.1; // onde as gotas somem quando há vaso embaixo do bico
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
  g.font = '23px sans-serif';
  g.fillText('BALANÇA DE SEGURANÇA embaixo de cada vaso: sem vaso em cima, a válvula não abre.', 40, 615);
  g.fillText('SENSOR DE UMIDADE espetado no vaso: o fio amarelo liga na balança e vai até a placa.', 40, 650);
  g.fillText('O motor bombeia a água da caixa d\'água (em cima dele) só com alguma válvula aberta.', 40, 685);

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
 * @param {THREE.Object3D[]} o.grabbables lista de objetos pegáveis (PC e VR): os vasos entram nela
 */
export function createBenchIrrigation(scene, spots, { sound, grabbables = [] }) {
  const sides = [-1, 1]
    .map((s) => ({ s, pots: spots.filter((p) => Math.sign(p.x) === s).sort((a, b) => a.z - b.z) }))
    .filter((side) => side.pots.length);
  const valvePos = []; // centro de cada válvula
  const nozzles = []; // bico de cada derivação (de onde cai a água)
  const groups = [];
  const slots = []; // lugar original de cada vaso (um por válvula)
  const pipeGeos = [];
  const cableGeos = []; // preto: relés -> válvulas
  const sensorGeos = []; // amarelo: sensores de umidade (pelas balanças) -> placa
  const scales = []; // centro de cada balança de segurança

  const motorMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, metalness: 0.6, roughness: 0.4 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x1d5fbf, roughness: 0.55 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6 });
  const relayMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 });
  const motors = [];
  // Por onde os fios da placa-mãe sobem em cada bancada (caminhos completos, do chão ao aparelho).
  const wiring = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  sides.forEach(({ s, pots }, sideIndex) => {
    const bx = pots[0].x;
    const xm = bx + s * 0.27; // cano principal, do lado da parede
    const xc = xm + s * 0.035; // cabo preto, junto do cano (lado da parede)
    const xy = xm + s * 0.055; // cabo amarelo, junto da borda
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
    motor.position.set(mx, BENCH_TOP_Y, MOTOR_Z);
    scene.add(motor);
    motors.push({ group: motor, led, hum: sound ? sound.create(motor, sound.buffers.hum, { loop: true, volume: 0.35, refDistance: 0.4 }) : null });

    // Placa ESP32 + relés na ponta da bancada, atrás do motor (sem etiqueta: a placa
    // explicativa perto da porta conta o que é cada peça).
    const boardX = bx - s * 0.15;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.08), boardMat);
    board.position.set(boardX, BENCH_TOP_Y + 0.01, BOARD_Z);
    const relays = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.05), relayMat);
    relays.position.set(boardX + s * 0.01, BENCH_TOP_Y + 0.032, BOARD_Z);
    board.castShadow = relays.castShadow = true;
    scene.add(board, relays);
    const boardWall = boardX + s * 0.06; // face da placa virada para a parede

    // Fios da placa-mãe: correm no chão até a perna de trás (lado do corredor), sobem
    // por ela, contornam a borda do tampo e chegam na placa e no motor.
    const legX = bx - s * 0.3;
    const legBackZ = -3.3 - 0.033; // face de trás da perna
    const climb = (dx, endPts) => [
      V(legX + dx, 0.02, legBackZ), // no chão, atrás da perna
      V(legX + dx, BENCH_TOP_Y - 0.06, legBackZ), // sobe pela perna
      V(legX + dx, BENCH_TOP_Y - 0.06, -3.42), // sai para fora da ponta do tampo
      V(legX + dx, CABLE_Y + 0.004, -3.42), // sobe pela borda
      V(legX + dx, CABLE_Y + 0.004, -3.39), // deita no tampo
      ...endPts,
    ];
    wiring.push({
      relay: climb(0, [V(boardX - s * 0.02, CABLE_Y + 0.004, -3.39), V(boardX - s * 0.02, BENCH_TOP_Y + 0.01, BOARD_Z - 0.04)]),
      power: climb(s * 0.014, [V(mx, CABLE_Y + 0.004, -3.39), V(mx, CABLE_Y + 0.004, MOTOR_Z - 0.11), V(mx, BENCH_TOP_Y + 0.04, MOTOR_Z - 0.11)]),
    });

    // Cano: saída do motor -> borda de trás da bancada -> ao longo dos vasos.
    pipeGeos.push(pipe([
      [mx, BENCH_TOP_Y + 0.075, MOTOR_Z + 0.11],
      [mx, BENCH_TOP_Y + 0.075, MOTOR_Z + 0.2],
      [xm, MAIN_Y, MOTOR_Z + 0.2],
      [xm, MAIN_Y, lastZ + 0.05],
    ], 0.013));
    // Cabos da placa: saem pela face da parede e seguem junto do cano até o último vaso.
    cableGeos.push(pipe([
      [boardWall, CABLE_Y, BOARD_Z + 0.02],
      [xc, CABLE_Y, BOARD_Z + 0.02],
      [xc, CABLE_Y, lastZ],
    ], 0.0035));
    sensorGeos.push(pipe([
      [boardWall, CABLE_Y, BOARD_Z - 0.02],
      [xy, CABLE_Y, BOARD_Z - 0.02],
      [xy, CABLE_Y, lastZ + 0.05],
    ], 0.0035));

    // Uma derivação por vaso, com a válvula na curva e a balança embaixo do vaso.
    for (const p of pots) {
      const nozX = p.x + s * 0.05;
      pipeGeos.push(pipe([
        [xm, MAIN_Y, p.z],
        [xm, ELBOW_Y, p.z],
        [nozX, ELBOW_Y, p.z],
        [nozX, ELBOW_Y - 0.06, p.z],
      ], 0.008));
      // Cabo preto colado no cano que sobe até a válvula.
      cableGeos.push(pipe([
        [xc, CABLE_Y, p.z],
        [xm + s * 0.016, CABLE_Y + 0.01, p.z],
        [xm + s * 0.016, ELBOW_Y - 0.095, p.z],
      ], 0.0035));
      // Cabo amarelo do cabo principal até a balança (o sensor do vaso liga nela).
      sensorGeos.push(pipe([
        [xy, CABLE_Y, p.z + 0.05],
        [p.x + s * SCALE_HALF, CABLE_Y, p.z + 0.05],
      ], 0.003));
      scales.push({ x: p.x, z: p.z, side: s });
      valvePos.push(new THREE.Vector3(xm, ELBOW_Y - 0.06, p.z));
      nozzles.push({ pos: new THREE.Vector3(nozX, ELBOW_Y - 0.07, p.z), side: s });
      groups.push(sideIndex);
      slots.push({ x: p.x, z: p.z, label: `${s < 0 ? 'E' : 'D'}${pots.indexOf(p) + 1}` });
    }
  });

  // Balanças de segurança: base escura + prato de inox + LED (verde = vaso em cima).
  const scaleBase = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SCALE_HALF * 2, 0.014, SCALE_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 }), scales.length);
  const scalePlate = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SCALE_HALF * 2 - 0.02, 0.01, SCALE_HALF * 2 - 0.02),
    new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.3 }), scales.length);
  const scaleLeds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), scales.length);
  {
    const d = new THREE.Object3D();
    scales.forEach((sc, i) => {
      d.position.set(sc.x, BENCH_TOP_Y + 0.007, sc.z);
      d.updateMatrix();
      scaleBase.setMatrixAt(i, d.matrix);
      d.position.set(sc.x, BENCH_TOP_Y + 0.019, sc.z);
      d.updateMatrix();
      scalePlate.setMatrixAt(i, d.matrix);
      d.position.set(sc.x - sc.side * (SCALE_HALF + 0.001), BENCH_TOP_Y + 0.007, sc.z + 0.05);
      d.updateMatrix();
      scaleLeds.setMatrixAt(i, d.matrix);
      scaleLeds.setColorAt(i, LED_RED_ON); // vermelho até o vaso pousar
    });
  }
  scaleBase.receiveShadow = scalePlate.receiveShadow = true;
  scene.add(scaleBase, scalePlate, scaleLeds);
  setScalePads(scales.map((sc) => ({ x: sc.x, z: sc.z, half: SCALE_HALF, y: SCALE_TOP })));

  const pipeMesh = new THREE.Mesh(mergeGeometries(pipeGeos), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.35, metalness: 0.1 }));
  pipeMesh.castShadow = true;
  const cableMesh = new THREE.Mesh(mergeGeometries(cableGeos), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
  const sensorMesh = new THREE.Mesh(mergeGeometries(sensorGeos), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.7 }));
  scene.add(pipeMesh, cableMesh, sensorMesh);

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

  // Tampos invisíveis das bancadas: só para a mira do modo FPS saber onde soltar objetos.
  const dropSurfaces = sides.map(({ pots }) => {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 6.8), new THREE.MeshBasicMaterial());
    top.visible = false;
    top.position.set(pots[0].x, BENCH_TOP_Y - 0.01, 0);
    scene.add(top);
    return top;
  });

  const tmpV = new THREE.Vector3();

  /** Modo completo: recebe os modelos das plantas (props.js) e torna cada um pegável. */
  function setPotObjects(objects) {
    objects.forEach((obj, i) => {
      if (!obj) return;
      obj.updateMatrixWorld(true);
      // Distância da origem do modelo até a base dele (para pousar certo na balança).
      const box = new THREE.Box3().setFromObject(obj);
      makeGrabbable(obj, obj.position.y - box.min.y);
      addPotSensor(obj, box, slots[i] ? Math.sign(slots[i].x) || 1 : 1);
    });
  }

  // Sensor de umidade do vaso: haste espetada na terra com um LED, e o fio amarelo
  // que passa por cima da borda, desce pelo lado de fora do vaso e encaixa na
  // balança (é por ela que a leitura chega na placa). Fica preso ao vaso: se o vaso
  // for pego, o sensor vai junto; fora da balança, a placa não recebe a leitura.
  const sensorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  function colored(geo, hex) {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) c.toArray(arr, k * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo.index ? geo.toNonIndexed() : geo;
  }
  function addPotSensor(obj, box, side) {
    const H = box.max.y - box.min.y;
    const base = box.min.y;
    // Proporções do modelo "Potted Plant 01": terra a ~40% da altura, boca do vaso ~17% de raio.
    const soilY = base + H * 0.4;
    const R = H * 0.17;
    const c = obj.getWorldPosition(new THREE.Vector3()); // centro do vaso (origem do modelo)
    const dir = new THREE.Vector3(-side * 0.8, 0, 0.6).normalize(); // virado para o corredor
    const at = (r, y) => new THREE.Vector3(c.x + dir.x * r, y, c.z + dir.z * r);
    const stickTop = at(R * 0.55, soilY + 0.06);
    const stick = new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6);
    stick.translate(stickTop.x, stickTop.y - 0.045, stickTop.z);
    const head = new THREE.BoxGeometry(0.014, 0.018, 0.014);
    head.translate(stickTop.x, stickTop.y, stickTop.z);
    const led = new THREE.SphereGeometry(0.004, 6, 4);
    led.translate(stickTop.x, stickTop.y + 0.011, stickTop.z);
    const wire = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      stickTop.clone().setY(stickTop.y + 0.005),
      at(R * 0.8, soilY + 0.05),
      at(R * 1.08, soilY + 0.02), // por cima da borda
      at(R * 1.04, soilY - 0.05),
      at(R * 0.8, base + 0.02), // desce pela parede de fora
      at(R * 0.86, base + 0.003), // encaixa na balança
    ]), 24, 0.0022, 5, false);
    const geo = mergeGeometries([
      colored(stick, 0x9ca3af), colored(head, 0x1f2937), colored(led, 0x22c55e), colored(wire, 0xfacc15),
    ]);
    const mesh = new THREE.Mesh(geo, sensorMat);
    mesh.castShadow = true;
    scene.add(mesh);
    obj.attach(mesh); // passa a ser filho do vaso (mantém a posição no mundo)
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
        if (Math.hypot(tmpV.x - slot.x, tmpV.z - slot.z) < SLOT_RADIUS && Math.abs(baseY - SCALE_TOP) < 0.03) found = j; // em cima da balança
      });
      if (network.valves[i].pot !== found) {
        network.setPot(i, found);
        scaleLeds.setColorAt(i, found === null ? LED_RED_ON : LED_GREEN_ON); // LED da balança
        scaleLeds.instanceColor.needsUpdate = true;
      }
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

  }

  return { network, slots, update, setPotObjects, dropSurfaces, wiring };
}
