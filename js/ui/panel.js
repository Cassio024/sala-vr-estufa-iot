// Painel de status na parede (canvas desenhado e usado como textura).
import * as THREE from 'three';

export function createPanel(scene, position) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.75),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  panel.position.copy(position);
  scene.add(panel);

  // debugText: linha de diagnóstico (?debug); vazia = não mostra.
  function draw({ moisture, probeIn, pumpOn, mode, near, log, excess = false, debugText = '' }) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#e5e7eb';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('Estufa IoT - Sala VR', 40, 70);

    ctx.font = '46px sans-serif';
    if (probeIn && excess) {
      // Água em excesso: faixa azul de alerta no topo do painel.
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(560, 22, 440, 64);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText('⚠ ÁGUA EM EXCESSO', 580, 66);
      ctx.font = '46px sans-serif';
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(`Umidade do solo: ${moisture.toFixed(0)}% — ENCHARCADO`, 40, 150);
    } else if (probeIn) {
      ctx.fillStyle = moisture < 35 ? '#f87171' : '#34d399';
      ctx.fillText(`Umidade do solo: ${moisture.toFixed(0)}%`, 40, 150);
    } else {
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('Sensor fora do solo (espete no vaso)', 40, 150);
    }

    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(`Bomba: ${pumpOn ? 'LIGADA' : 'desligada'}`, 40, 210);
    ctx.fillText(`Modo: ${mode === 'auto' ? 'automático' : 'manual'}`, 40, 270);
    ctx.fillText(`Proximidade: ${near ? 'mão detectada' : 'livre'}`, 40, 330);

    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#9ca3af';
    log.forEach((line, i) => ctx.fillText(`• ${line}`, 40, 390 + i * 40));

    if (debugText) {
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(debugText, 40, 570);
    }

    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Botão azul REGAR (ao lado da bomba) = rega · botão cinza = modo · lateral: pegar · analógico: andar', 40, 610);

    texture.needsUpdate = true;
  }

  return { panel, draw };
}
