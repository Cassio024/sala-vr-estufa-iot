import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Corpo do jogador na VR: tronco que acompanha a cabeça, dois braços até os
// controles e as mãos nos controles. Só aparece dentro do headset; no PC some.
// ---------------------------------------------------------------------------

const SHOULDER_OFFSET = 0.2;  // distância dos ombros até o centro do tronco
const TORSO_DROP = 0.42;      // quanto o tronco fica abaixo dos olhos

export function createBody(scene, renderer, camera, controllers) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0b08c, roughness: 0.6 });

  // Tronco: cápsula azul (camisa).
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.35, 6, 12), shirtMat);
  root.add(torso);

  // Pescoço: liga o tronco à altura dos olhos.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), skinMat);
  root.add(neck);

  // Braços: cilindros que são esticados entre o ombro e a mão.
  const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 1, 10);
  armGeo.translate(0, 0.5, 0); // origem na base, para esticar a partir do ombro
  const arms = [0, 1].map(() => {
    const arm = new THREE.Mesh(armGeo, shirtMat);
    root.add(arm);
    return arm;
  });

  // Mãos: esferas presas nos controles.
  const handGeo = new THREE.SphereGeometry(0.05, 12, 10);
  const hands = controllers.map(() => {
    const hand = new THREE.Mesh(handGeo, skinMat);
    scene.add(hand);
    return hand;
  });

  const head = new THREE.Vector3();
  const yawQuat = new THREE.Quaternion();
  const shoulder = new THREE.Vector3();
  const hand = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();

  return {
    update() {
      const visible = renderer.xr.isPresenting;
      root.visible = visible;
      hands.forEach((h) => { h.visible = visible; });
      if (!visible) return;

      // Cabeça e direção que o jogador olha (só o giro em torno de Y).
      camera.getWorldPosition(head);
      camera.getWorldQuaternion(yawQuat);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
      const yaw = Math.atan2(forward.x, forward.z);
      // Sem girar o grupo: as peças usam posições do mundo; só os ombros seguem o olhar.
      right.set(1, 0, 0).applyAxisAngle(up, yaw);

      // Tronco e pescoço abaixo dos olhos.
      torso.position.set(head.x, head.y - TORSO_DROP, head.z);
      neck.position.set(head.x, head.y - 0.14, head.z);

      // Braços: do ombro (lado do tronco) até cada controle.
      controllers.forEach((c, i) => {
        const side = i === 0 ? -1 : 1;
        shoulder.set(head.x, head.y - 0.22, head.z).addScaledVector(right, side * SHOULDER_OFFSET);
        c.getWorldPosition(hand);
        hands[i].position.copy(hand);

        const arm = arms[i];
        dir.subVectors(hand, shoulder);
        const len = dir.length();
        arm.position.copy(shoulder);
        arm.scale.set(1, Math.max(len, 0.01), 1);
        arm.quaternion.setFromUnitVectors(up, dir.normalize());
      });
    },
  };
}
