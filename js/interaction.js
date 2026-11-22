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
//  - gatilho (select)        -> onSelect(controller)
//  - gatilho lateral (squeeze) -> pegar / soltar objetos "grabbables"
//  - analógico para frente   -> mostra o raio, ao soltar teletransporta
//  - analógico para os lados -> giro de 30°
export class XRInteraction {
  constructor({ renderer, scene, camera, rig, grabbables, surfaceHeight, onSelect, bounds = 3.6 }) {
    this.scene = scene;
    this.camera = camera;
    this.rig = rig;
    this.grabbables = grabbables;
    this.surfaceHeight = surfaceHeight; // (x, z, yDaBase) -> { y, soil }
    this.bounds = bounds;
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
      Object.assign(c.userData, { gamepad: null, held: null, aiming: false, snapLock: false, wasNear: false });

      c.add(new THREE.Mesh(pointerGeo, pointerMat));
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x22d3ee })
      );
      ray.name = 'ray';
      ray.visible = false;
      c.add(ray);

      c.addEventListener('connected', (e) => { c.userData.gamepad = e.data.gamepad; });
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
      const s = this.surfaceHeight(o.position.x, o.position.z, bottom - u.vy * dt);
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
  _locomotion(c) {
    const u = c.userData;
    const gp = u.gamepad;
    if (!gp || !gp.axes) return;
    const ax = gp.axes;
    const x = ax[2] !== undefined ? ax[2] : ax[0] || 0;
    const y = ax[3] !== undefined ? ax[3] : ax[1] || 0;

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

  _aim(c) {
    c.getWorldPosition(_o);
    _d.set(0, 0, -1).applyQuaternion(c.getWorldQuaternion(_q));
    this.targetValid = false;
    let dist = 3;
    if (_d.y < -0.05) {
      const t = -_o.y / _d.y; // interseção com o chão (y = 0)
      if (t > 0 && t < 10) {
        _t.copy(_o).addScaledVector(_d, t);
        if (Math.abs(_t.x) < this.bounds && Math.abs(_t.z) < this.bounds) {
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
    for (const c of this.controllers) this._locomotion(c);
  }
}
