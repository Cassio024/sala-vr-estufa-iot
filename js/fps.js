// Modo FPS (primeira pessoa) no computador, como um jogo:
//   F ou botão "Modo FPS" -> entra · Esc -> sai (volta para a câmera orbital)
//   W A S D / setas -> andar · Shift -> correr · mouse -> olhar
//   clique esquerdo -> usar o que está na mira (botão, esfera, placa, porta),
//                      pegar o regador/sensor e soltar onde estiver mirando
//   botão direito (segurando o regador e mirando o vaso) -> regar
// O mouse fica "preso" na tela (Pointer Lock), como nos jogos.
import * as THREE from 'three';
import { createCollider } from './collision.js';

const EYE_HEIGHT = 1.6;
const WALK_SPEED = 2.2; // m/s
const RUN_SPEED = 4.2;
const REACH = 3; // alcance da mão (m)
const LOOK_SPEED = 0.0022;

export class FirstPersonMode {
  /**
   * @param {object} o
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {THREE.PerspectiveCamera} o.camera
   * @param {THREE.Scene} o.scene
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} o.orbit
   * @param {(raycaster: THREE.Raycaster) => boolean} o.onIntroRay placas e porta
   * @param {THREE.Object3D[]} o.modeTargets botão de modo
   * @param {THREE.Object3D[]} o.waterTargets esfera azul
   * @param {THREE.Object3D[]} o.grabbables regador e sensor
   * @param {THREE.Object3D} o.can regador (para regar com o botão direito)
   * @param {{x:number,y:number,z:number}} o.potCenter centro do vaso (no nível do solo)
   * @param {() => void} o.onToggleMode
   * @param {() => void} o.onWater
   * @param {object} o.world limites para colisão (ver collision.js) e dropSurfaces
   */
  constructor(o) {
    Object.assign(this, o);
    this.collider = createCollider(o.world); // paredes, porta e móveis (compartilhado com a VR)
    this.active = false;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.held = null; // objeto na mão
    // "Mão" do jogador: tem o mesmo formato de um controle VR para o resto do código
    // (sem gamepad, então a vibração simplesmente não acontece).
    this.hand = { userData: { gamepad: null }, isFpsHand: true };
    this.pouring = false; // botão direito pressionado
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = REACH;
    this.hoverKind = null;
    this._v = new THREE.Vector3();
    this._center = new THREE.Vector2(0, 0);

    this._buildHud();
    this._bindEvents();
  }

  // -------------------------------------------------------------------------
  // Interface (mira, ajuda e botão)
  // -------------------------------------------------------------------------
  _buildHud() {
    const css = document.createElement('style');
    css.textContent = `
      #fps-btn { position: absolute; left: 16px; bottom: 20px; padding: 10px 16px; border: 1px solid #fff;
        border-radius: 6px; background: rgba(0,0,0,0.6); color: #fff; font: 15px sans-serif; cursor: pointer; z-index: 10; }
      #fps-btn:hover { background: rgba(34,197,94,0.7); }
      #fps-cross { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px;
        border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 3px #000; pointer-events: none; display: none; z-index: 10; }
      #fps-cross.alvo { border-color: #22d3ee; transform: scale(1.6); }
      #fps-help { position: absolute; left: 16px; top: 16px; padding: 10px 14px; border-radius: 6px;
        background: rgba(0,0,0,0.55); color: #e5e7eb; font: 13px/1.6 sans-serif; pointer-events: none; display: none; z-index: 10; }
      #fps-help b { color: #fff; }
      #fps-tip { position: absolute; left: 50%; top: calc(50% + 24px); transform: translateX(-50%); padding: 4px 10px;
        border-radius: 4px; background: rgba(0,0,0,0.6); color: #fff; font: 14px sans-serif; pointer-events: none; display: none; z-index: 10; }
    `;
    document.head.appendChild(css);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button id="fps-btn" title="Andar pela estufa como num jogo (tecla F)">🎮 Modo FPS (F)</button>
      <div id="fps-cross"></div>
      <div id="fps-tip"></div>
      <div id="fps-help">
        <b>Modo FPS</b><br>
        <b>W A S D</b> andar · <b>Shift</b> correr · <b>mouse</b> olhar<br>
        <b>Clique</b> usar / pegar / soltar o que está na mira<br>
        <b>Botão direito</b> regar (segurando o regador, mirando o vaso)<br>
        <b>M</b> modo auto/manual · <b>Espaço</b> rega manual<br>
        <b>Esc</b> sair
      </div>`;
    document.body.appendChild(wrap);
    this.btn = wrap.querySelector('#fps-btn');
    this.cross = wrap.querySelector('#fps-cross');
    this.help = wrap.querySelector('#fps-help');
    this.tip = wrap.querySelector('#fps-tip');
  }

  _bindEvents() {
    const canvas = this.renderer.domElement;
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.enter();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked && !this.active) this._activate();
      else if (!locked && this.active) this._deactivate();
    });
    document.addEventListener('pointerlockerror', () => {
      this.tip.textContent = 'O navegador bloqueou o mouse: clique na tela e tente de novo';
      this.tip.style.display = 'block';
      setTimeout(() => { if (!this.active) this.tip.style.display = 'none'; }, 3000);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      this.yaw -= e.movementX * LOOK_SPEED;
      this.pitch -= e.movementY * LOOK_SPEED;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat && !this.renderer.xr.isPresenting) {
        if (this.active) this.exit();
        else this.enter();
        return;
      }
      if (this.active) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) this._click();
      if (e.button === 2) this.pouring = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.pouring = false;
    });
    canvas.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });

    // Entrar na VR sai do modo FPS.
    this.renderer.xr.addEventListener('sessionstart', () => this.exit());
  }

  // -------------------------------------------------------------------------
  // Entrar / sair
  // -------------------------------------------------------------------------
  enter() {
    if (this.active || this.renderer.xr.isPresenting) return;
    const canvas = this.renderer.domElement;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // sem suporte: o evento pointerlockerror mostra o aviso
    }
  }

  exit() {
    if (document.pointerLockElement) document.exitPointerLock();
    else if (this.active) this._deactivate();
  }

  _activate() {
    this.active = true;
    this.orbit.enabled = false;
    // Começa olhando para onde a câmera orbital olhava.
    const dir = this.camera.getWorldDirection(this._v);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    this.camera.position.y = EYE_HEIGHT;
    this.cross.style.display = 'block';
    this.help.style.display = 'block';
    this.btn.style.display = 'none';
  }

  _deactivate() {
    this.active = false;
    this.keys.clear();
    this.pouring = false;
    if (this.held) this._drop();
    this.cross.style.display = 'none';
    this.help.style.display = 'none';
    this.tip.style.display = 'none';
    this.btn.style.display = '';
    // A câmera orbital volta a girar em torno de um ponto 2 m à frente.
    const dir = this.camera.getWorldDirection(this._v);
    this.orbit.target.copy(this.camera.position).addScaledVector(dir, 2);
    this.orbit.enabled = true;
    this.orbit.update();
  }

  /** Usado pela caminhada automática da entrada (intro) para virar a câmera. */
  lookAt(x, y, z) {
    const p = this.camera.position;
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  // -------------------------------------------------------------------------
  // Mira e clique
  // -------------------------------------------------------------------------
  _aim() {
    this.raycaster.setFromCamera(this._center, this.camera);
    return this.raycaster;
  }

  /** O que está na mira: { kind, object, point } ou null. */
  _target() {
    const ray = this._aim();
    const candidates = [
      ...(this.uiTargets || []).map((o) => [o, 'painel']),
      ...(this.lockedTargets || []).map((o) => [o, 'preso']),
      ...this.modeTargets.map((o) => [o, 'modo']),
      ...this.waterTargets.map((o) => [o, 'rega']),
      ...(this.held ? [] : this.grabbables.map((o) => [o, 'pegar'])),
    ];
    const hits = ray.intersectObjects(candidates.map(([o]) => o), true);
    for (const hit of hits) {
      let o = hit.object;
      while (o) {
        const c = candidates.find(([obj]) => obj === o);
        if (c) return { kind: c[1], object: c[0], point: hit.point };
        o = o.parent;
      }
    }
    return null;
  }

  _click() {
    // Segurando algo: o clique solta.
    if (this.held) {
      this._drop();
      return;
    }
    // Placas e porta da entrada.
    if (this.onIntroRay(this._aim())) return;
    const t = this._target();
    if (!t) return;
    if (t.kind === 'painel' || t.kind === 'preso') return; // painel: tratado em onIntroRay
    if (t.kind === 'modo') this.onToggleMode();
    else if (t.kind === 'rega') this.onWater();
    else if (t.kind === 'pegar') this._grab(t.object);
  }

  _grab(obj) {
    this.held = obj;
    obj.userData.held = this.hand; // impede o controle VR e a "queda" de mexerem nele
    obj.userData.falling = false;
    this.camera.attach(obj);
    obj.position.set(0.28, -0.28, -0.55); // na "mão", canto inferior direito da tela
    obj.rotation.set(0, Math.PI / 2, 0); // bico do regador apontando para a frente
  }

  _drop() {
    const obj = this.held;
    if (!obj) return;
    this.held = null;
    this.pouring = false;
    this.scene.attach(obj);
    // Solta onde estiver mirando (ou 1 m à frente); depois ele cai até a superfície.
    const ray = this._aim();
    const hit = ray.intersectObjects(this.world.dropSurfaces, true)[0];
    const p = hit ? hit.point.clone() : ray.ray.at(1, this._v);
    obj.position.set(p.x, Math.max(p.y, 0) + 0.25, p.z);
    obj.rotation.set(0, obj.rotation.y, 0);
    obj.userData.held = null;
    obj.userData.falling = true;
    obj.userData.vy = 0;
    // Ex.: o sensor solto perto do vaso principal encaixa no meio da terra (main.js).
    if (this.onDrop) this.onDrop(obj);
  }

  // -------------------------------------------------------------------------
  // Movimento com colisão simples
  // -------------------------------------------------------------------------
  _move(dt) {
    let fx = 0;
    let fz = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (!fx && !fz) return;
    const len = Math.hypot(fx, fz);
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) * dt;
    // Frente/direita no plano do chão, a partir de para onde se está olhando.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = ((-sin * fz + cos * fx) / len) * speed;
    const dz = ((-cos * fz - sin * fx) / len) * speed;

    this.collider.tryMove(this.camera.position, dx, dz);
  }

  // -------------------------------------------------------------------------
  // Regar com o regador na mão
  // -------------------------------------------------------------------------
  _updatePour() {
    const can = this.can;
    if (this.held !== can) return;
    const pc = this.potCenter;
    let overPot = false;
    if (this.pouring) {
      const ray = this._aim();
      // Mirando perto do vaso (até 2,5 m)?
      const t = ray.ray.distanceToPoint(this._v.set(pc.x, pc.y, pc.z));
      overPot = t < 0.35 && this.camera.position.distanceTo(this._v) < 2.5;
    }
    if (overPot) {
      // Leva o regador para cima do vaso e inclina (a lógica de rega do main.js detecta a inclinação).
      if (can.parent !== this.scene) this.scene.attach(can);
      can.position.set(pc.x - 0.18, pc.y + 0.2, pc.z);
      can.rotation.set(0, 0, -1.0);
    } else if (can.parent !== this.camera) {
      this.camera.attach(can);
      can.position.set(0.28, -0.28, -0.55);
      can.rotation.set(0, Math.PI / 2, 0);
    }
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------
  update(dt) {
    if (!this.active) return;
    this._move(dt);
    this.camera.position.y = EYE_HEIGHT;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this._updatePour();

    // Mira muda de cor e mostra uma dica quando há algo para usar.
    const t = this.held ? null : this._target();
    const kind = t ? t.kind : null;
    if (kind !== this.hoverKind || this.held !== this._lastHeld) {
      this.hoverKind = kind;
      this._lastHeld = this.held;
      const tips = {
        modo: 'Clique: trocar modo (auto/manual)',
        rega: 'Clique: rega manual',
        pegar: 'Clique: pegar',
        painel: 'Clique: usar o painel',
        preso: 'Planta em análise: presa à mesa com fitas',
      };
      let tip = kind ? tips[kind] : '';
      if (this.held) tip = this.held === this.can ? 'Botão direito no vaso: regar · Clique: soltar' : 'Clique: soltar (mire no vaso para espetar)';
      this.cross.classList.toggle('alvo', Boolean(kind));
      this.tip.textContent = tip;
      this.tip.style.display = tip ? 'block' : 'none';
    }
  }
}
