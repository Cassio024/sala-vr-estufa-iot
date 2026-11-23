// Painel de controle das bancadas (na estufa, perto da porta, à direita).
//   Seleção: Todas / Esquerda / Direita
//   Modo da seleção: Automático / Manual
//   Regar agora (manual) · Liberar todos
//   Grade com os 16 vasos: umidade e estado; clique num vaso = bloquear/liberar a rega
// Funciona com o mouse (PC), com a mira do modo FPS e com o raio do controle VR:
// o ponto acertado na tela vira uma coordenada no canvas e acha o botão.
import * as THREE from 'three';

const W = 1024;
const H = 800;
const SELECTIONS = [
  { key: 'todas', label: 'Todas', groups: [0, 1] },
  { key: 'esq', label: 'Esquerda', groups: [0] },
  { key: 'dir', label: 'Direita', groups: [1] },
];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class ControlPanel {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../valves.js').ValveNetwork} network
   * @param {{label:string}[]} slots nome de cada vaso (E1..E8, D1..D8), na ordem das válvulas
   * @param {object} o
   * @param {THREE.Vector3} o.position
   * @param {number} o.rotY
   * @param {(msg: string) => void} [o.onEvent] mensagem para o log do painel principal
   * @param {() => void} [o.onClick] som de clique
   */
  constructor(scene, network, slots, { position, rotY = 0, onEvent = null, onClick = null }) {
    this.network = network;
    this.slots = slots;
    this.onEvent = onEvent;
    this.onClick = onClick;
    this.selection = SELECTIONS[0];
    this.buttons = [];
    this.flash = null; // botão recém-clicado (destaque rápido)

    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const w = 1.0;
    const h = w * (H / W);
    this.group = new THREE.Group();
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.screen.position.y = 1.4;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.4, roughness: 0.5 }),
    );
    frame.position.set(0, 1.4, -0.025);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 8), new THREE.MeshStandardMaterial({ color: 0x374151 }));
    post.position.set(0, 0.52, -0.06);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x374151 }));
    foot.position.set(0, 0.015, -0.06);
    this.group.add(this.screen, frame, post, foot);
    this.group.position.copy(position);
    this.group.rotation.y = rotY;
    scene.add(this.group);

    this.timer = 0;
    this.draw();
  }

  /** Objetos que a mira/raio podem acertar. */
  get targets() {
    return [this.screen];
  }

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------
  selectedGroups() {
    return this.selection.groups;
  }

  setMode(mode) {
    for (const g of this.selectedGroups()) this.network.setMode(g, mode);
    this.event(`Bancadas (${this.selection.label}): modo ${mode === 'auto' ? 'automático' : 'manual'}`);
  }

  waterNow() {
    let n = 0;
    for (const g of this.selectedGroups()) n += this.network.waterNow(g);
    const anyManual = this.selectedGroups().some((g) => this.network.modes[g] === 'manual');
    this.event(n ? `Bancadas (${this.selection.label}): regando ${n} vaso(s)`
      : anyManual ? 'Regar agora: nenhum vaso liberado em cima da balança'
      : 'Regar agora: mude a seleção para Manual');
  }

  releaseAll() {
    this.network.valves.forEach((v, i) => {
      if (this.selectedGroups().includes(v.group)) this.network.setEnabled(i, true);
    });
    this.event(`Bancadas (${this.selection.label}): todos os vasos liberados`);
  }

  togglePot(i) {
    const on = this.network.toggleEnabled(i);
    this.event(`Vaso ${this.slots[i].label}: ${on ? 'rega liberada' : 'NÃO regar (bloqueado)'}`);
  }

  event(msg) {
    if (this.onEvent) this.onEvent(msg);
  }

  /** Clique/gatilho com um raio. Retorna true se acertou o painel. */
  handleRay(raycaster) {
    const hit = raycaster.intersectObject(this.screen, false)[0];
    if (!hit || !hit.uv) return false;
    const x = hit.uv.x * W;
    const y = (1 - hit.uv.y) * H;
    const b = this.buttons.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (b) {
      b.action();
      this.flash = { id: b.id, t: 0.25 };
      if (this.onClick) this.onClick();
      this.draw();
    }
    return true; // acertou a tela (mesmo fora de um botão): não deixa o clique "vazar"
  }

  // -------------------------------------------------------------------------
  // Desenho
  // -------------------------------------------------------------------------
  button(id, x, y, w, h, label, { active = false, disabled = false, color = '#2563eb' } = {}, action = () => {}) {
    const g = this.g;
    const flashing = this.flash && this.flash.id === id;
    g.fillStyle = disabled ? '#1f2937' : active ? color : '#334155';
    if (flashing) g.fillStyle = '#f8fafc';
    roundRect(g, x, y, w, h, 12);
    g.fill();
    if (active && !flashing) {
      g.strokeStyle = '#f8fafc';
      g.lineWidth = 3;
      g.stroke();
    }
    g.fillStyle = flashing ? '#0f172a' : disabled ? '#64748b' : '#f8fafc';
    g.font = `bold ${Math.round(h * 0.42)}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, x + w / 2, y + h / 2 + 2);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    if (!disabled) this.buttons.push({ id, x, y, w, h, action });
  }

  draw() {
    const g = this.g;
    const net = this.network;
    this.buttons = [];
    g.fillStyle = '#0b1622';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#22c55e';
    g.fillRect(0, 0, W, 10);
    g.fillStyle = '#f8fafc';
    g.font = 'bold 46px sans-serif';
    g.fillText('Painel das bancadas', 36, 70);
    g.font = '24px sans-serif';
    g.fillStyle = '#94a3b8';
    g.fillText(`${net.openCount()} válvula(s) regando agora`, 600, 66);

    // Seleção
    g.fillStyle = '#cbd5e1';
    g.font = 'bold 26px sans-serif';
    g.fillText('Bancadas:', 36, 133);
    SELECTIONS.forEach((sel, i) => {
      this.button(`sel-${sel.key}`, 200 + i * 200, 100, 180, 52, sel.label, { active: this.selection === sel }, () => {
        this.selection = sel;
      });
    });

    // Modo da seleção (se as bancadas estiverem em modos diferentes, nenhum fica marcado)
    const modes = this.selectedGroups().map((gr) => net.modes[gr]);
    const allAuto = modes.every((m) => m === 'auto');
    const allManual = modes.every((m) => m === 'manual');
    g.fillStyle = '#cbd5e1';
    g.fillText('Modo:', 36, 203);
    this.button('auto', 200, 170, 280, 52, 'Automático', { active: allAuto, color: '#15803d' }, () => this.setMode('auto'));
    this.button('manual', 500, 170, 280, 52, 'Manual', { active: allManual, color: '#b45309' }, () => this.setMode('manual'));

    // Ações
    const anyManual = modes.some((m) => m === 'manual');
    this.button('regar', 200, 240, 280, 52, '💧 Regar agora', { disabled: !anyManual, color: '#0369a1', active: anyManual }, () => this.waterNow());
    this.button('liberar', 500, 240, 280, 52, 'Liberar todos', {}, () => this.releaseAll());
    g.font = '20px sans-serif';
    g.fillStyle = '#64748b';
    g.fillText(anyManual ? 'Regar agora abre as válvulas liberadas por alguns segundos.' : 'Para regar na hora, escolha o modo Manual.', 200, 322);

    // Grade dos vasos: duas fileiras (esquerda e direita)
    const rows = [0, 1].map((gr) => net.valves.map((v, i) => i).filter((i) => net.valves[i].group === gr));
    const cw = 104;
    const ch = 150;
    rows.forEach((idx, r) => {
      const y0 = 360 + r * (ch + 46);
      g.fillStyle = '#cbd5e1';
      g.font = 'bold 24px sans-serif';
      g.fillText(r === 0 ? `Bancada esquerda · ${net.modes[0] === 'auto' ? 'automático' : 'manual'}` : `Bancada direita · ${net.modes[1] === 'auto' ? 'automático' : 'manual'}`, 36, y0 - 10);
      idx.forEach((i, k) => {
        const v = net.valves[i];
        const x = 36 + k * (cw + 18);
        const m = net.moistureAt(i);
        const state = !v.enabled ? 'bloq' : v.open ? 'rega' : 'fechada';
        const colors = { bloq: '#334155', rega: '#166534', fechada: '#7f1d1d' };
        const id = `pot-${i}`;
        const flashing = this.flash && this.flash.id === id;
        g.fillStyle = flashing ? '#f8fafc' : colors[state];
        roundRect(g, x, y0, cw, ch, 12);
        g.fill();
        g.fillStyle = flashing ? '#0f172a' : '#f8fafc';
        g.textAlign = 'center';
        g.font = 'bold 30px sans-serif';
        g.fillText(this.slots[i].label, x + cw / 2, y0 + 40);
        g.font = 'bold 28px sans-serif';
        g.fillText(m === null ? 'vazio' : `${m.toFixed(0)}%`, x + cw / 2, y0 + 82);
        g.font = '20px sans-serif';
        g.fillText(state === 'bloq' ? 'NÃO regar' : state === 'rega' ? 'regando' : 'fechada', x + cw / 2, y0 + 118);
        // luzinha (como o LED da válvula)
        g.fillStyle = state === 'rega' ? '#22ff55' : state === 'fechada' ? '#ff3333' : '#64748b';
        g.beginPath();
        g.arc(x + cw - 16, y0 + 16, 8, 0, Math.PI * 2);
        g.fill();
        g.textAlign = 'left';
        this.buttons.push({ id, x, y: y0, w: cw, h: ch, action: () => this.togglePot(i) });
      });
    });

    g.font = '21px sans-serif';
    g.fillStyle = '#94a3b8';
    g.fillText('Clique num vaso para bloquear ("não regar") ou liberar a rega dele.', 36, H - 18);
    this.texture.needsUpdate = true;
  }

  update(dt) {
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25; // umidade e estado ao vivo, 4x por segundo
      this.draw();
    }
  }
}
