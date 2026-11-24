import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Vento: um relógio compartilhado e um "balanço" aplicado no shader dos
// materiais (folhas das árvores e grama). Quanto mais alto o vértice, mais ele
// balança, então a base fica parada e a ponta mexe. Também cria folhas voando.
// ---------------------------------------------------------------------------

export const wind = {
  time: { value: 0 },
  strength: { value: 1 },
};

// Aplica o balanço no material. amp = quanto balança por unidade de altura.
export function addWind(material, { amp = 0.02, speed = 1.6 } = {}) {
  if (material.userData.windApplied) return material;
  material.userData.windApplied = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uWindTime = wind.time;
    shader.uniforms.uWindStrength = wind.strength;
    shader.uniforms.uWindAmp = { value: amp };
    shader.uniforms.uWindSpeed = { value: speed };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;\nuniform float uWindAmp;\nuniform float uWindSpeed;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float windH = max(transformed.y, 0.0);
        float windPh = transformed.x * 0.7 + transformed.z * 0.5;
        #ifdef USE_INSTANCING
          windPh += instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.35;
        #endif
        float windW = sin(uWindTime * uWindSpeed + windPh) * 0.65 + sin(uWindTime * uWindSpeed * 2.3 + windPh * 1.7) * 0.25;
        transformed.x += windW * uWindAmp * windH * uWindStrength;
        transformed.z += windW * uWindAmp * 0.5 * windH * uWindStrength;`
      );
  };
  material.customProgramCacheKey = () => `wind-${amp}-${speed}`;
  material.needsUpdate = true;
  return material;
}

// Folhas voando com o vento: pequenos quadrados que atravessam o mapa e voltam.
export function buildFlyingLeaves(scene, { count = 70, area = 26 } = {}) {
  const geo = new THREE.PlaneGeometry(0.06, 0.04);
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a9a3a, side: THREE.DoubleSide, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const col = new THREE.Color();
  const leaves = [];
  for (let i = 0; i < count; i++) {
    leaves.push({
      x: (Math.random() * 2 - 1) * area,
      y: 0.3 + Math.random() * 3,
      z: (Math.random() * 2 - 1) * area,
      vx: 0.8 + Math.random() * 0.8,
      ph: Math.random() * Math.PI * 2,
      spin: 1 + Math.random() * 3,
    });
    mesh.setColorAt(i, col.setHSL(0.12 + Math.random() * 0.15, 0.55, 0.35 + Math.random() * 0.15));
  }
  scene.add(mesh);
  const d = new THREE.Object3D();
  return {
    update(dt, t) {
      for (let i = 0; i < count; i++) {
        const l = leaves[i];
        l.x += l.vx * dt * wind.strength.value;
        l.y += Math.sin(t * 1.3 + l.ph) * 0.2 * dt - 0.05 * dt;
        if (l.x > area || l.y < 0.05) {
          // Volta pelo outro lado do mapa, no alto.
          l.x = -area;
          l.y = 0.5 + Math.random() * 3;
          l.z = (Math.random() * 2 - 1) * area;
        }
        d.position.set(l.x, l.y, l.z);
        d.rotation.set(t * l.spin + l.ph, t * l.spin * 0.7, l.ph);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
