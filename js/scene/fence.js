// Cerca de madeira em volta do mapa inteiro: mostra o limite e, junto com a colisão
// (main.js > WORLD.bounds), impede o jogador de sair andando para fora do mapa.
// Mourões a cada ~2 m e 3 travessas; tudo em 2 InstancedMesh (2 draw calls).
import * as THREE from 'three';
import { pbrMaterial } from '../environment.js';

export const FENCE = { x: 22, z: 20, height: 1.2 };

export function buildPerimeterFence(scene, { x = FENCE.x, z = FENCE.z, height = FENCE.height, spacing = 2 } = {}) {
  const corners = [[-x, -z], [x, -z], [x, z], [-x, z]];
  const posts = [];
  const rails = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / spacing);
    const rotY = -Math.atan2(bz - az, bx - ax);
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      posts.push({ x: ax + (bx - ax) * t0, z: az + (bz - az) * t0 });
      const mx = ax + (bx - ax) * (t0 + t1) / 2;
      const mz = az + (bz - az) * (t0 + t1) / 2;
      for (const y of [0.3, 0.7, 1.05]) rails.push({ x: mx, z: mz, y: y * height / 1.2, rotY, len: len / n });
    }
  }

  const wood = pbrMaterial('madeira', { repeat: [1, 1], fallback: 'wood', color: 0xb08a5a, roughness: 0.8 });
  const postGeo = new THREE.BoxGeometry(0.12, height + 0.1, 0.12);
  postGeo.translate(0, (height + 0.1) / 2, 0);
  const postMesh = new THREE.InstancedMesh(postGeo, wood, posts.length);
  const railGeo = new THREE.BoxGeometry(1, 0.09, 0.04); // comprimento ajustado por escala em X
  const railMesh = new THREE.InstancedMesh(railGeo, wood, rails.length);

  const d = new THREE.Object3D();
  posts.forEach((p, i) => {
    d.position.set(p.x, 0, p.z);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    postMesh.setMatrixAt(i, d.matrix);
  });
  rails.forEach((r, i) => {
    d.position.set(r.x, r.y, r.z);
    d.rotation.set(0, r.rotY, 0);
    d.scale.set(r.len, 1, 1);
    d.updateMatrix();
    railMesh.setMatrixAt(i, d.matrix);
  });
  for (const m of [postMesh, railMesh]) {
    m.computeBoundingSphere();
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  return { posts: posts.length, rails: rails.length };
}
