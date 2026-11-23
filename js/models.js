import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('vendor/three/examples/jsm/libs/draco/gltf/'); // local: funciona offline
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

// Carrega um .glb/.gltf e devolve um Group com a origem no CENTRO DA BASE
// do modelo, já escalado para a altura desejada (em metros).
// Se o arquivo não existir, devolve null e o projeto continua com a forma simples.
export async function tryLoadModel(url, { height } = {}) {
  try {
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    if (height) {
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.multiplyScalar(height / size.y);
    }
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);

    const wrapper = new THREE.Group();
    wrapper.add(model);
    return wrapper;
  } catch (err) {
    console.info(`[modelos] ${url} não encontrado — usando forma simples.`);
    return null;
  }
}

// Permite mudar a cor do modelo (ex.: folhas murchando) sem afetar outros usos.
export function makeTintable(root) {
  const items = [];
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) {
      o.material = o.material.clone();
      items.push({ mat: o.material, base: o.material.color.clone() });
    }
  });
  return items;
}

export function tint(items, toColor, amount) {
  for (const it of items) it.mat.color.copy(it.base).lerp(toColor, amount);
}
