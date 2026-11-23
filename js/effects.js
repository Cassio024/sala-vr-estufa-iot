import * as THREE from 'three';
import { softDotTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Efeitos extras de ambiente:
//  - sombras de contato (mancha escura embaixo de vasos, mesa e árvores)
//  - nuvens que se movem devagar no céu
//  - partículas de poeira no ar da estufa (luz do sol)
// ---------------------------------------------------------------------------

function radialShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// spots: [{ x, y, z, r }] com y = altura da superfície onde a sombra cai.
export function buildContactShadows(scene, spots) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: radialShadowTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const d = new THREE.Object3D();
  spots.forEach((s, i) => {
    d.position.set(s.x, s.y + 0.004, s.z);
    d.scale.set(s.r * 2.4, 1, s.r * 2.4);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

// Poeira e pólen flutuando no ar, visíveis no feixe de luz. Cada partícula
// anda em um pequeno círculo próprio, então o movimento parece natural.
export function buildDust(scene, { count = 160, box = 3.4, minY = 0.2, maxY = 2.8 } = {}) {
  const pos = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const seed = {
      x: (Math.random() * 2 - 1) * box,
      y: minY + Math.random() * (maxY - minY),
      z: (Math.random() * 2 - 1) * box,
      ph: Math.random() * Math.PI * 2,
      sp: 0.1 + Math.random() * 0.15,
    };
    seeds.push(seed);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: softDotTexture(),
    color: 0xfff1d0,
    size: 0.045,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  return {
    update(t) {
      seeds.forEach((s, i) => {
        pos[i * 3] = s.x + Math.cos(t * s.sp + s.ph) * 0.12;
        pos[i * 3 + 1] = s.y + Math.sin(t * s.sp * 1.3 + s.ph) * 0.08;
        pos[i * 3 + 2] = s.z + Math.sin(t * s.sp + s.ph) * 0.12;
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const cx = 60 + Math.random() * 136;
    const cy = 110 + Math.random() * 30;
    const r = 40 + Math.random() * 45;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Nuvens em volta e acima da estufa, andando devagar no sentido do vento.
export function buildClouds(scene, { count = 12, radius = 42, height = 26 } = {}) {
  const tex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.75 + Math.random() * 0.2,
      depthWrite: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    const s = 14 + Math.random() * 12;
    sprite.scale.set(s * 2, s, 1);
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    sprite.position.set(Math.cos(a) * radius, height + Math.random() * 4, Math.sin(a) * radius);
    sprite.userData.speed = 0.6 + Math.random() * 0.6;
    scene.add(sprite);
    clouds.push(sprite);
  }

  return {
    update(dt) {
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        // Quando sai do campo de visão, volta para o outro lado.
        if (c.position.x > radius) c.position.x = -radius;
      }
    },
  };
}
