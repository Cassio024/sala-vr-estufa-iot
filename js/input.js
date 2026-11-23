// Entrada no computador (sem headset): mouse e teclado.
// Os controles VR ficam em interaction.js.
import * as THREE from 'three';

export function setupDesktopInput({ renderer, camera, modeTargets, waterTargets, onToggleMode, onWater, onPick = null, isBusy = () => false }) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downX = 0;
  let downY = 0;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });

  // Clicar no botão cinza troca o modo; clicar na esfera azul rega.
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (isBusy()) return; // modo FPS: os cliques são tratados em fps.js (mira no centro da tela)
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return; // foi um arrasto (girar a câmera)
    mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    // Primeiro: placas explicativas, porta e chão (caminho de entrada). Se tratou o clique, para aqui.
    if (onPick && onPick(raycaster)) return;
    const hit = raycaster.intersectObjects([...modeTargets, ...waterTargets], false)[0];
    if (!hit) return;
    if (modeTargets.includes(hit.object)) onToggleMode();
    else onWater();
  });

  // Atalhos: Espaço rega, M troca o modo.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') onWater();
    if (e.code === 'KeyM') onToggleMode();
  });
}
