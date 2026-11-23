import * as THREE from 'three';

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _h = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Vibração no controle (funciona em Quest e outros headsets com haptics).
export function haptic(controller, strength = 0.5, ms = 50) {
  const gp = controller.userData.gamepad;
  if (!gp) return;
  const act = gp.hapticActuators && gp.hapticActuators[0];
  if (act && act.pulse) act.pulse(strength, ms);
  else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
    gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength });
  }
}

// Controles VR:
//  - gatilho (select)             -> onSelect(controller)
//  - gatilho lateral (squeeze)    -> pegar / soltar objetos "grabbables"
//  - analógico ESQUERDO           -> andar (para onde se está olhando), como num jogo
//  - analógico direito p/ os lados -> giro de 30°
//  - analógico direito p/ frente  -> mostra o raio, ao soltar teletransporta
// Com `collider` (collision.js), andar e teletransportar respeitam paredes, porta e móveis.
const MOVE_SPEED = 1.6; // m/s com o analógico todo inclinado
const DEADZONE = 0.15;

export class XRInteraction {
  constructor({ renderer, scene, camera, rig, grabbables, surfaceHeight, onSelect, bounds = 3.6, collider = null, onRelease = null }) {
    this.onRelease = onRelease;
    this.scene = scene;
    this.camera = camera;
    this.rig = rig;
    this.grabbables = grabbables;
    this.surfaceHeight = surfaceHeight; // (x, z, yDaBase) -> { y, soil }
    this.bounds = bounds; // usado só se não houver collider
    this.collider = collider;
    this.controllers = [];
    this.target = new THREE.Vector3();
    this.targetValid = false;

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.18, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    this.marker.visible = false;
    scene.add(this.marker);

    const pointerGeo = new THREE.SphereGeometry(0.012, 12, 8);
    const pointerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      Object.assign(c.userData, { gamepad: null, handedness: '', index: i, held: null, aiming: false, snapLock: false, wasNear: false });

      c.add(new THREE.Mesh(pointerGeo, pointerMat));
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x22d3ee })
      );
      ray.name = 'ray';
      ray.visible = false;
      c.add(ray);

      c.addEventListener('connected', (e) => {
        c.userData.gamepad = e.data.gamepad;
        c.userData.handedness = e.data.handedness; // 'left' | 'right' | 'none'
      });
      c.addEventListener('disconnected', () => { c.userData.gamepad = null; });
      c.addEventListener('selectstart', () => onSelect(c));
      c.addEventListener('squeezestart', () => this.grab(c));
      c.addEventListener('squeezeend', () => this.release(c));

      rig.add(c); // dentro do "rig" para o teletransporte levar os controles junto
      this.controllers.push(c);
    }
  }

  pulseAll(strength, ms) {
    for (const c of this.controllers) haptic(c, strength, ms);
  }

  // --- Pegar objetos -------------------------------------------------------
  grab(c) {
    if (c.userData.held) return;
    c.getWorldPosition(_p);
    let best = null;
    let bestD = 0.18;
    for (const o of this.grabbables) {
      if (o.userData.held) continue;
      const d = o.getWorldPosition(_v).distanceTo(_p);
      if (d < bestD) { best = o; bestD = d; }
    }
    if (!best) return;
    c.attach(best); // mantém a posição no mundo e passa a seguir a mão
    best.userData.held = c;
    best.userData.falling = false;
    c.userData.held = best;
    haptic(c, 0.5, 60);
  }

  release(c) {
    const o = c.userData.held;
    if (!o) return;
    this.scene.attach(o);
    o.userData.held = null;
    o.userData.falling = true;
    o.userData.vy = 0;
    c.userData.held = null;
    if (this.onRelease) this.onRelease(o); // ex.: encaixar o sensor no vaso se soltou perto dele
    haptic(c, 0.2, 30);
  }

  // Objetos soltos caem até a superfície abaixo deles (mesa, solo do vaso ou chão).
  _fall(dt) {
    for (const o of this.grabbables) {
      const u = o.userData;
      if (u.held || !u.falling) continue;
      u.vy -= 9.8 * dt;
      o.position.y += u.vy * dt;
      const bottom = o.position.y - u.baseOffset;
      // Altura de onde a base veio + o quanto ela pode entrar na terra: assim o sensor
      // continua "sobre o solo" enquanto afunda os 8 cm e não atravessa o vaso até a mesa.
      const s = this.surfaceHeight(o.position.x, o.position.z, bottom - u.vy * dt + (u.insertDepth || 0));
      const restBottom = s.y - (s.soil ? u.insertDepth || 0 : 0);
      if (bottom <= restBottom) {
        o.position.y = restBottom + u.baseOffset;
        o.rotation.x = 0;
        o.rotation.z = 0;
        u.falling = false;
        u.vy = 0;
      }
    }
  }

  // --- Teletransporte e giro ----------------------------------------------
  // Mão esquerda anda; mão direita gira e teletransporta.
  // Se o headset não informar a mão, o controle 0 é tratado como esquerdo.
  _isLeft(c) {
    const h = c.userData.handedness;
    return h ? h === 'left' : c.userData.index === 0;
  }

  _locomotion(c, dt) {
    const u = c.userData;
    const gp = u.gamepad;
    if (!gp || !gp.axes) return;
    const ax = gp.axes;
    const x = ax[2] !== undefined ? ax[2] : ax[0] || 0;
    const y = ax[3] !== undefined ? ax[3] : ax[1] || 0;

    if (this._isLeft(c)) {
      this._walk(x, y, dt);
      return;
    }

    if (y < -0.7) {
      u.aiming = true;
      this._aim(c);
    } else if (u.aiming && y > -0.3) {
      u.aiming = false;
      c.getObjectByName('ray').visible = false;
      this.marker.visible = false;
      if (this.targetValid) this._teleport(c);
    }

    if (!u.aiming && Math.abs(y) < 0.5) {
      if (!u.snapLock && Math.abs(x) > 0.8) {
        this._snapTurn(-Math.sign(x) * (Math.PI / 6));
        u.snapLock = true;
      } else if (Math.abs(x) < 0.3) {
        u.snapLock = false;
      }
    }
  }

  // Andar contínuo: frente/trás e lados em relação para onde a cabeça está olhando.
  _walk(x, y, dt) {
    if (Math.abs(x) < DEADZONE && Math.abs(y) < DEADZONE) return;
    this.camera.getWorldDirection(_d);
    _d.y = 0;
    if (_d.lengthSq() < 1e-6) return;
    _d.normalize();
    // direita = frente × cima
    const rx = -_d.z;
    const rz = _d.x;
    const speed = MOVE_SPEED * dt;
    const dx = (_d.x * -y + rx * x) * speed;
    const dz = (_d.z * -y + rz * x) * speed;

    this.camera.getWorldPosition(_h);
    const before = { x: _h.x, z: _h.z };
    const after = { x: _h.x, z: _h.z };
    if (this.collider) this.collider.tryMove(after, dx, dz);
    else {
      after.x = THREE.MathUtils.clamp(after.x + dx, -this.bounds, this.bounds);
      after.z = THREE.MathUtils.clamp(after.z + dz, -this.bounds, this.bounds);
    }
    this.rig.position.x += after.x - before.x;
    this.rig.position.z += after.z - before.z;
  }

  _aim(c) {
    c.getWorldPosition(_o);
    _d.set(0, 0, -1).applyQuaternion(c.getWorldQuaternion(_q));
    this.targetValid = false;
    let dist = 3;
    if (_d.y < -0.05) {
      const t = -_o.y / _d.y; // interseção com o chão (y = 0)
      if (t > 0 && t < 10) {
        _t.copy(_o).addScaledVector(_d, t);
        const ok = this.collider
          ? Math.abs(_t.x) < 36 && Math.abs(_t.z) < 36 && !this.collider.blocked(_t.x, _t.z)
          : Math.abs(_t.x) < this.bounds && Math.abs(_t.z) < this.bounds;
        if (ok) {
          this.target.copy(_t);
          this.targetValid = true;
          dist = t;
        }
      }
    }
    const ray = c.getObjectByName('ray');
    ray.visible = true;
    ray.scale.z = dist;
    this.marker.visible = this.targetValid;
    if (this.targetValid) this.marker.position.set(this.target.x, 0.01, this.target.z);
  }

  _teleport(c) {
    this.camera.getWorldPosition(_h);
    this.rig.position.x += this.target.x - _h.x;
    this.rig.position.z += this.target.z - _h.z;
    haptic(c, 0.4, 40);
  }

  _snapTurn(angle) {
    this.camera.getWorldPosition(_h);
    this.rig.position.sub(_h).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).add(_h);
    this.rig.rotation.y += angle;
  }

  update(dt) {
    this._fall(dt);
    for (const c of this.controllers) this._locomotion(c, dt);
  }
}
