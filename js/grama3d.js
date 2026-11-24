import * as THREE from 'three';
import { addWind } from './vento.js';

// ---------------------------------------------------------------------------
// Grama 3D densa: milhares de lâminas finas espalhadas pelo chão, em um único
// InstancedMesh (um só draw call). Ficam fora da estufa e do caminho.
// ---------------------------------------------------------------------------

function bladeGeometry() {
  // Lâmina: triângulo estreito que termina em ponta, com leve curvatura.
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    -0.03, 0, 0,
    0.03, 0, 0,
    0.01, 0.55, 0.02,
    0.01, 0.55, 0.02,
    -0.02, 0.9, 0.04,
    -0.03, 0, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function buildGrass3D(scene, avoid, { count = 40000, radius = 26 } = {}) {
  const mat = addWind(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), { amp: 0.18, speed: 2.0 });
  const mesh = new THREE.InstancedMesh(bladeGeometry(), mat, count);
  const d = new THREE.Object3D();
  const col = new THREE.Color();

  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 4) {
    tries++;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (avoid(x, z, 0.2)) continue;

    const s = 0.28 + Math.random() * 0.34; // altura variada (grama baixa, não trigo)
    d.position.set(x, 0, z);
    d.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
    d.scale.set(s, s, s);
    d.updateMatrix();
    mesh.setMatrixAt(placed, d.matrix);
    mesh.setColorAt(placed, col.setHSL(0.27 + Math.random() * 0.05, 0.5, 0.26 + Math.random() * 0.1));
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
