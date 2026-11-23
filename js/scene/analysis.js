// Vaso principal "em análise": fitas zebradas prendem o vaso à mesa e uma etiqueta
// avisa que ele não deve ser movido. (Ele não está na lista de objetos pegáveis.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function stripesTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#facc15';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#111827';
  for (let y = -64; y < 256 + 64; y += 48) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 32);
    g.lineTo(64, y + 56);
    g.lineTo(0, y + 24);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Um pedaço reto de fita entre dois pontos, com a largura virada "de lado" (tangente ao vaso). */
function strapSegment(a, b, tangent, width = 0.024, thickness = 0.003) {
  const along = b.clone().sub(a);
  const len = along.length();
  const y = along.normalize();
  const x = tangent.clone();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const geo = new THREE.BoxGeometry(width, len, thickness);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(a.clone().add(b).multiplyScalar(0.5));
  geo.applyMatrix4(m);
  return geo;
}

/**
 * @param {THREE.Scene} scene
 * @param {object} o
 * @param {THREE.Vector3} o.base centro da base do vaso (em cima da mesa)
 * @param {number} o.height altura do vaso
 * @param {number} o.topRadius raio da boca do vaso
 * @param {number} o.bottomRadius raio do fundo do vaso
 * @returns {THREE.Object3D[]} objetos que a mira acerta (para mostrar "planta em análise")
 */
export function buildAnalysisStraps(scene, { base, height, topRadius, bottomRadius }) {
  const geos = [];
  // Ângulos escolhidos para não passar pelo sensor nem pelo tubo da bomba.
  for (const deg of [20, 110, 200, 290]) {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const tangent = new THREE.Vector3(-dir.z, 0, dir.x);
    const at = (r, y) => base.clone().addScaledVector(dir, r).setY(base.y + y);
    const pts = [
      at(topRadius - 0.03, height + 0.006), // por cima da borda, já sobre a terra
      at(topRadius + 0.004, height + 0.006), // borda do vaso
      at(bottomRadius + 0.004, 0.003), // desce pela lateral
      at(bottomRadius + 0.13, 0.002), // presa na mesa
    ];
    for (let i = 0; i < pts.length - 1; i++) geos.push(strapSegment(pts[i], pts[i + 1], tangent));
  }
  const straps = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: stripesTexture(), roughness: 0.6 }));
  straps.castShadow = true;
  scene.add(straps);

  // Etiqueta "em análise" numa estaca, ao lado do vaso.
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#facc15';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#111827';
  g.fillRect(12, 12, 488, 232);
  g.fillStyle = '#facc15';
  g.font = 'bold 62px sans-serif';
  g.textAlign = 'center';
  g.fillText('PLANTA EM', 256, 100);
  g.fillText('ANÁLISE', 256, 168);
  g.font = '32px sans-serif';
  g.fillStyle = '#f8fafc';
  g.fillText('não mover', 256, 220);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Group();
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  card.position.y = 0.2;
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
  stake.position.y = 0.1;
  tag.add(card, stake);
  tag.position.set(base.x + 0.2, base.y, base.z - 0.2);
  tag.rotation.y = -0.3;
  scene.add(tag);

  return [straps, card];
}
