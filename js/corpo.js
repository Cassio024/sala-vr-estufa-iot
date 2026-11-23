import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Corpo do jogador, nos dois modos:
//  - VR: tronco e pescoço acompanham a cabeça; braços vão até os controles.
//  - PC: corpo inteiro (com pernas) no ponto para onde a câmera orbita, que é
//    onde você está andando. A câmera fica atrás dele (terceira pessoa).
// ---------------------------------------------------------------------------

const SHOULDER_OFFSET = 0.2;   // distância dos ombros até o centro do tronco
const TORSO_DROP = 0.42;       // VR: tronco abaixo dos olhos
const SHOULDER_DROP = 0.22;    // VR: ombros abaixo dos olhos
const PC_TORSO_Y = 0.95;       // PC: centro do tronco
const PC_SHOULDER_Y = 1.2;     // PC: altura dos ombros
const PC_NECK_Y = 1.36;
const PC_HAND_DROP = 0.55;     // PC: mãos esse tanto abaixo dos ombros
const PC_HAND_FORWARD = 0.06;

export function createBody(scene, renderer, camera, controllers, orbit) {
  const root = new THREE.Group();
  scene.add(root);

  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0b08c, roughness: 0.6 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });

  // Tronco: cápsula azul (camisa).
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.35, 6, 12), shirtMat);
  root.add(torso);

  // Cabeça (só aparece no PC, em terceira pessoa).
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skinMat);
  root.add(headMesh);

  // Pescoço.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), skinMat);
  root.add(neck);

  // Pernas (só no PC): dois cilindros do quadril até o chão.
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 10), pantsMat);
    leg.position.set(side * 0.09, 0.3, 0);
    root.add(leg);
    return leg;
  });

  // Braços: cilindros esticados entre o ombro e a mão.
  const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 1, 10);
  armGeo.translate(0, 0.5, 0);
  const arms = [0, 1].map(() => {
    const arm = new THREE.Mesh(armGeo, shirtMat);
    root.add(arm);
    return arm;
  });

  // Mãos: esferas. Na VR ficam nos controles; no PC, na ponta dos braços.
  const handGeo = new THREE.SphereGeometry(0.05, 12, 10);
  const hands = [0, 1].map(() => {
    const hand = new THREE.Mesh(handGeo, skinMat);
    scene.add(hand);
    return hand;
  });

  const anchor = new THREE.Vector3();
  const yawQuat = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const shoulder = new THREE.Vector3();
  const hand = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();

  return {
    update() {
      const inVR = renderer.xr.isPresenting;

      // Direção em que você olha (só o giro em volta de Y).
      camera.getWorldQuaternion(yawQuat);
      forward.set(0, 0, -1).applyQuaternion(yawQuat);
      const yaw = Math.atan2(forward.x, forward.z);
      right.set(1, 0, 0).applyAxisAngle(up, yaw);

      // Onde o corpo fica: na VR, na cabeça; no PC, no ponto para onde a câmera orbita.
      if (inVR) {
        camera.getWorldPosition(anchor);
      } else {
        anchor.copy(orbit.target);
      }

      // Visibilidade: pernas e cabeça só no PC.
      const showPC = !inVR;
      legs.forEach((l) => { l.visible = showPC; });
      headMesh.visible = showPC;
      legs.forEach((l, i) => { l.position.set(anchor.x + (i === 0 ? -0.09 : 0.09), 0.3, anchor.z); });

      // Tronco, pescoço e cabeça.
      const torsoY = inVR ? anchor.y - TORSO_DROP : PC_TORSO_Y;
      const shoulderY = inVR ? anchor.y - SHOULDER_DROP : PC_SHOULDER_Y;
      torso.position.set(anchor.x, torsoY, anchor.z);
      neck.position.set(anchor.x, inVR ? anchor.y - 0.14 : PC_NECK_Y, anchor.z);
      headMesh.position.set(anchor.x, PC_NECK_Y + 0.18, anchor.z);

      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        shoulder.set(anchor.x, shoulderY, anchor.z).addScaledVector(right, side * SHOULDER_OFFSET);

        if (inVR && controllers[i]) {
          controllers[i].getWorldPosition(hand); // mão no controle
        } else {
          // PC: braço pendurado ao lado do corpo, um pouco à frente.
          hand.copy(shoulder).addScaledVector(up, -PC_HAND_DROP).addScaledVector(forward, PC_HAND_FORWARD);
        }
        hands[i].position.copy(hand);

        const arm = arms[i];
        dir.subVectors(hand, shoulder);
        const len = dir.length();
        arm.position.copy(shoulder);
        arm.scale.set(1, Math.max(len, 0.01), 1);
        arm.quaternion.setFromUnitVectors(up, dir.normalize());
      }
    },
  };
}
