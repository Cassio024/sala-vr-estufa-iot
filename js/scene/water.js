// Gotas de água (pool reutilizável: nada é criado durante o loop).
import * as THREE from 'three';
import { surfaceHeight } from './surfaces.js';

export function createWater(scene, count = 60) {
  const dropGeo = new THREE.SphereGeometry(0.008, 8, 6);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const drops = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(dropGeo, dropMat);
    mesh.visible = false;
    scene.add(mesh);
    drops.push({ mesh, vy: 0, alive: false });
  }
  let spawnTimer = 0;

  // emitters: lista de posições de onde a água está saindo neste frame.
  function update(dt, emitters) {
    if (emitters.length) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = 0.06;
        for (const origin of emitters) {
          const drop = drops.find((d) => !d.alive);
          if (!drop) break;
          drop.alive = true;
          drop.vy = 0;
          drop.mesh.visible = true;
          drop.mesh.position.copy(origin);
        }
      }
    }
    for (const drop of drops) {
      if (!drop.alive) continue;
      drop.vy -= 4 * dt;
      const p = drop.mesh.position;
      p.y += drop.vy * dt;
      if (p.y <= surfaceHeight(p.x, p.z, p.y - drop.vy * dt).y) {
        drop.alive = false;
        drop.mesh.visible = false;
      }
    }
  }

  return { update };
}
