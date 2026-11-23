import * as THREE from 'three';
import { DOOR_W, DOOR_H, pbrMaterial } from './environment.js';
import { FENCE } from './scene/fence.js';

// Limite do mapa: um pouco antes da cerca em volta do jardim (scene/fence.js).
const MAP_BOUNDS = { x: FENCE.x - 0.4, z: FENCE.z - 0.4 };

// ---------------------------------------------------------------------------
// Caminho de entrada: o jogador começa do lado de fora, anda por um caminho
// de pedras, lê placas explicativas e entra pela porta da estufa.
// ---------------------------------------------------------------------------

export const START = { x: 0, z: 11 };          // onde o jogador começa
export const DOOR_Z = 4;                       // parede da frente da estufa
const INSIDE = { x: 0, z: 2.0, look: { x: 0, y: 1.0, z: -1 } };
const WALK_SPEED = 2.2;                        // m/s ao andar pelo computador
const NEAR = 2.2;                              // distância para destacar a placa

// Conteúdo das placas. "short" aparece na placa; "full" aparece ao clicar.
export const STATIONS = [
  {
    x: -1.25, z: 9.8,
    title: 'O projeto',
    short: 'Uma estufa virtual com irrigação IoT: ela mede a umidade da terra e rega sozinha.',
    full: [
      'Esta sala de realidade virtual mostra, em 3D, uma estufa com irrigação automática.',
      'O projeto junta um sensor de umidade, uma bomba d\'água e um painel de status. Cada objeto da sala tem um equivalente no mundo real.',
      'A ideia é entender como um sistema IoT lê o ambiente, decide e age sozinho, sem uma pessoa regando a planta.',
    ],
  },
  {
    x: 1.25, z: 8.4,
    title: 'Sensor de umidade',
    short: 'A haste no vaso mede a umidade da terra, de 0 a 100%.',
    full: [
      'O sensor fica enterrado no solo e envia a umidade a cada leitura.',
      'Quanto mais seca a terra, menor o valor. Por isso ele é a principal informação do sistema.',
      'Você pode pegar a haste com o gatilho lateral e espetá-la de novo no vaso. Fora da terra ele não lê nada e a bomba para.',
    ],
  },
  {
    x: -1.25, z: 7.0,
    title: 'Bomba automática',
    short: 'Liga abaixo de 35% de umidade e desliga ao chegar em 70%.',
    full: [
      'Quando a umidade cai abaixo de 35%, a bomba liga e começa a regar.',
      'Ela só desliga quando a terra chega a 70%. Esse intervalo se chama histerese e evita ligar e desligar o tempo todo.',
      'No modo manual a bomba não decide sozinha: você rega quando quiser.',
      'Se a terra passar de 90% (água em excesso), o sensor avisa e a rega fica bloqueada até secar abaixo de 85%.',
    ],
  },
  {
    x: 1.25, z: 5.6,
    title: 'Interagir na sala',
    short: 'Use o botão REGAR, o botão cinza e o regador.',
    full: [
      'Botão azul REGAR (ao lado da bomba): rega manual por alguns segundos.',
      'Esfera azul: sensor de proximidade. Detecta a mão; com o gatilho perto dela também rega.',
      'Botão cinza: troca entre modo automático e manual.',
      'Regador: pegue com o gatilho lateral e incline sobre o vaso para regar.',
      'Painel na parede: mostra umidade, bomba, modo e os últimos eventos.',
    ],
  },
];

// ---------------------------------------------------------------------------
// Texturas e desenho em canvas
// ---------------------------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

function wrapText(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function stoneMap() {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = '#8f9399';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 10, 2 + Math.random() * 6, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#5f6368';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Fundo de holograma: painel translúcido em azul-ciano, grade e linhas de varredura.
function signBackground(g, w, h, accent = '#22d3ee') {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8, 47, 73, 0.55)';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(34, 211, 238, 0.14)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2); // linhas de varredura
  g.strokeStyle = accent;
  g.lineWidth = 4;
  g.shadowColor = accent;
  g.shadowBlur = 16;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.shadowBlur = 0;
}

function drawStationBoard(g, w, h, number, title, short) {
  signBackground(g, w, h);

  // Número em círculo com brilho.
  g.fillStyle = '#38bdf8';
  g.shadowColor = '#38bdf8';
  g.shadowBlur = 20;
  g.beginPath();
  g.arc(72, 96, 36, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#0b1220';
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.fillText(String(number), 72, 110);
  g.textAlign = 'left';

  g.fillStyle = '#e0f7ff';
  g.font = 'bold 40px sans-serif';
  g.shadowColor = '#22d3ee';
  g.shadowBlur = 12;
  g.fillText(title, 132, 110);
  g.shadowBlur = 0;

  g.fillStyle = '#bae6fd';
  g.font = '28px sans-serif';
  wrapText(g, short, w - 70).slice(0, 4).forEach((line, i) => g.fillText(line, 36, 185 + i * 38));

  g.fillStyle = '#67e8f9';
  g.font = 'bold 24px sans-serif';
  g.fillText('Clique para ler mais  ›', 36, h - 30);
}

function drawDetail(g, w, h, title, paragraphs) {
  signBackground(g, w, h);

  g.fillStyle = '#f8fafc';
  g.font = 'bold 56px sans-serif';
  g.fillText(title, 56, 116);
  g.fillStyle = '#38bdf8';
  g.fillRect(56, 140, 160, 5);

  let y = 200;
  g.fillStyle = '#e2e8f0';
  g.font = '32px sans-serif';
  for (const p of paragraphs) {
    const lines = wrapText(g, p, w - 112);
    for (const line of lines) {
      g.fillText(line, 56, y);
      y += 44;
    }
    y += 26;
  }

  g.fillStyle = '#64748b';
  g.font = '24px sans-serif';
  g.fillText('Clique em qualquer lugar para fechar', 56, h - 36);
}

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Construção da cena de entrada
// ---------------------------------------------------------------------------
export class Intro {
  // viewer: { head(), moveBy(dx, dz), lookAt(x, y, z), isXR() }
  constructor({ scene, camera, viewer, walkables, door = null }) {
    this.scene = scene;
    this.camera = camera;
    this.viewer = viewer;
    this.walkables = walkables;
    this.door = door;
    this.pickables = [];
    this.boards = [];
    this.walkTarget = null;

    this._buildPath(scene);
    this._buildStations(scene);
    this._buildEntrance(scene);
    this._buildDetail(scene);
  }

  // Caminho de pedras do portão até a porta.
  _buildPath(scene) {
    const slabGeo = new THREE.BoxGeometry(0.95, 0.03, 0.5);
    const mat = pbrMaterial('pedras', { repeat: [1, 1], color: 0x8f9399, roughness: 0.95 });
    const rows = [];
    for (let z = DOOR_Z + 0.35; z <= START.z + 0.6; z += 0.6) rows.push(z);
    const slabs = new THREE.InstancedMesh(slabGeo, mat, rows.length);
    const d = new THREE.Object3D();
    rows.forEach((z, i) => {
      d.position.set((Math.random() - 0.5) * 0.04, 0.015, z);
      d.rotation.set(0, (Math.random() - 0.5) * 0.06, 0);
      d.updateMatrix();
      slabs.setMatrixAt(i, d.matrix);
    });
    slabs.receiveShadow = true;
    scene.add(slabs);
  }

  _buildStations(scene) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.4, roughness: 0.5 });
    const postGeo = new THREE.BoxGeometry(0.05, 1.1, 0.05);

    STATIONS.forEach((station, i) => {
      const { c, g } = makeCanvas(512, 320);
      drawStationBoard(g, 512, 320, i + 1, station.title, station.short);
      // Holograma: translúcido e aditivo (a luz soma, como projeção).
      const boardMat = new THREE.MeshBasicMaterial({
        map: texture(c), side: THREE.DoubleSide, transparent: true, opacity: 0.9,
        depthWrite: false,
      });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5625), boardMat);
      board.position.set(0, 1.4, 0.03);
      board.userData.station = station;
      board.userData.boardMat = boardMat;

      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 0.55;

      const group = new THREE.Group();
      group.position.set(station.x, 0, station.z);
      // Placa sempre virada para o caminho.
      group.rotation.y = station.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(post, board);
      // Base de projeção: anel de luz no chão.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.14, 0.18, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.position.y = 0.012;
      group.add(ring);
      scene.add(group);

      this.pickables.push(board);
      this.boards.push({ group, boardMat, station, phase: i * 1.7 });
    });
  }

  _buildEntrance(scene) {
    const { c, g } = makeCanvas(512, 160);
    signBackground(g, 512, 160);
    g.fillStyle = '#e0f7ff';
    g.shadowColor = '#22d3ee';
    g.shadowBlur = 14;
    g.font = 'bold 52px sans-serif';
    g.textAlign = 'center';
    g.fillText('ENTRAR NA ESTUFA  →', 256, 100);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.28),
      new THREE.MeshBasicMaterial({
        map: texture(c), side: THREE.DoubleSide, transparent: true, opacity: 0.92,
        depthWrite: false,
      })
    );
    sign.position.set(0, DOOR_H + 0.25, DOOR_Z + 0.04);
    sign.userData.entrance = true;
    scene.add(sign);
    this.pickables.push(sign);
  }

  _buildDetail(scene) {
    const { c, g } = makeCanvas(1024, 768);
    this.detailCanvas = c;
    this.detailG = g;
    this.detailTex = texture(c);
    this.detail = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.825),
      new THREE.MeshBasicMaterial({ map: this.detailTex, transparent: true })
    );
    this.detail.visible = false;
    this.detail.renderOrder = 10;
    scene.add(this.detail);
  }

  // Mostra a explicação completa na frente do jogador.
  openDetail(station) {
    const { c, g } = { c: this.detailCanvas, g: this.detailG };
    g.clearRect(0, 0, c.width, c.height);
    drawDetail(g, c.width, c.height, station.title, station.full);
    this.detailTex.needsUpdate = true;

    const head = this.viewer.head();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    this.detail.position.copy(head).addScaledVector(dir, 1.3);
    this.detail.quaternion.copy(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    this.detail.visible = true;
  }

  closeDetail() {
    this.detail.visible = false;
  }

  walkTo(x, z, look = null) {
    if (this.viewer.isXR()) {
      // Na VR o jogador é teletransportado (andar longe não é confortável).
      const h = this.viewer.head();
      this.viewer.moveBy(x - h.x, z - h.z);
      if (look) this.viewer.lookAt(look.x, look.y, look.z);
      return;
    }
    this.walkTarget = { x, z, look };
  }

  // Clique do mouse ou gatilho do controle. Retorna true se tratou o clique.
  handleRay(raycaster, { canWalk = false } = {}) {
    if (this.detail.visible) {
      this.closeDetail();
      return true;
    }

    const hit = raycaster.intersectObjects(this.pickables, false)[0];
    if (hit) {
      if (hit.object.userData.station) {
        this.openDetail(hit.object.userData.station);
        return true;
      }
      if (hit.object.userData.entrance) {
        this.walkTo(INSIDE.x, INSIDE.z, INSIDE.look);
        return true;
      }
    }

    if (canWalk) {
      const ground = raycaster.intersectObjects(this.walkables, false)[0];
      if (ground) {
        // Não deixa andar para fora da cerca que cerca o mapa.
        const x = THREE.MathUtils.clamp(ground.point.x, -MAP_BOUNDS.x, MAP_BOUNDS.x);
        const z = THREE.MathUtils.clamp(ground.point.z, -MAP_BOUNDS.z, MAP_BOUNDS.z);
        this.walkTo(x, z);
        return true;
      }
    }
    return false;
  }

  // Coloca o jogador no início do caminho, olhando para a porta.
  start() {
    const h = this.viewer.head();
    this.viewer.moveBy(START.x - h.x, START.z - h.z);
    this.viewer.lookAt(0, 1.2, DOOR_Z);
  }

  update(dt) {
    this.time = (this.time || 0) + dt;
    if (this.walkTarget) {
      const h = this.viewer.head();
      const dx = this.walkTarget.x - h.x;
      const dz = this.walkTarget.z - h.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        const look = this.walkTarget.look;
        this.walkTarget = null;
        if (look) this.viewer.lookAt(look.x, look.y, look.z);
      } else {
        const step = Math.min(dist, WALK_SPEED * dt);
        this.viewer.moveBy((dx / dist) * step, (dz / dist) * step);
      }
    }

    const h = this.viewer.head();

    // Porta abre quando o jogador chega perto e fecha quando se afasta.
    if (this.door) {
      const nearDoor = Math.hypot(h.x, h.z - DOOR_Z) < 3;
      const target = nearDoor ? -Math.PI * 0.42 : 0;
      this.door.rotation.y += (target - this.door.rotation.y) * Math.min(1, dt * 4);
    }

    // Placas acendem quando o jogador chega perto.
    for (const b of this.boards) {
      const near = Math.hypot(h.x - b.group.position.x, h.z - b.group.position.z) < NEAR;
      b.boardMat.color.setScalar(near ? 1.25 : 1);
      // Holograma “vivo”: flutua devagar e a intensidade oscila levemente.
      b.group.position.y = Math.sin(this.time * 1.4 + b.phase) * 0.02;
      b.boardMat.opacity = 0.88 + Math.sin(this.time * 11 + b.phase) * 0.04;
    }
  }
}
