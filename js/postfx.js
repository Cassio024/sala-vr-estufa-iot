import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

// ---------------------------------------------------------------------------
// Efeitos de pós-processamento: brilho (bloom) nos reflexos do sol e no vidro,
// escurecimento suave nas bordas e correção de cor.
// Só no computador: no headset (VR) o render é direto, porque pós-processamento
// pesa demais para manter o FPS.
// ---------------------------------------------------------------------------
export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.22, // força
    0.5,  // raio
    0.9   // limiar: só o que está muito claro brilha
  );
  composer.addPass(bloom);

  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.1;
  vignette.uniforms.darkness.value = 0.9;
  composer.addPass(vignette);

  composer.addPass(new OutputPass()); // tone mapping e cor sRGB

  return {
    resize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
    render(dt) {
      if (renderer.xr.isPresenting) {
        renderer.render(scene, camera);
      } else {
        composer.render(dt);
      }
    },
  };
}
