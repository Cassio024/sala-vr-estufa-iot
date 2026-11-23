import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Texturas geradas por código (sem baixar arquivos). Cada uma tem cor e,
// quando faz sentido, um mapa de relevo (bump) feito a partir da própria cor.
// ---------------------------------------------------------------------------

const rand = (a, b) => a + Math.random() * (b - a);

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d') };
}

function toTexture(c, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

// Relevo: tons de cinza a partir da cor (escuro = fundo).
function bumpFrom(src) {
  const size = src.width;
  const { c, g } = canvas(size);
  g.filter = 'grayscale(1) contrast(1.8)';
  g.drawImage(src, 0, 0);
  return toTexture(c, { srgb: false });
}

// Casca de árvore: listras verticais irregulares e fendas.
export function barkTextures() {
  const { c, g } = canvas(256);
  g.fillStyle = '#5a4031';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    const x = rand(0, 256);
    const dark = Math.random() < 0.6;
    g.strokeStyle = dark ? `rgba(30,18,10,${rand(0.2, 0.5)})` : `rgba(150,120,90,${rand(0.1, 0.3)})`;
    g.lineWidth = rand(1, 5);
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 32) g.lineTo(x + rand(-4, 4), y);
    g.stroke();
  }
  return { map: toTexture(c, { repeat: [1, 1] }), bumpMap: bumpFrom(c) };
}

// Folhas: verde irregular com nervuras claras.
export function leafTextures() {
  const { c, g } = canvas(256);
  g.fillStyle = '#4a8a3c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const hue = rand(80, 125);
    g.fillStyle = `hsla(${hue}, ${rand(35, 60)}%, ${rand(20, 42)}%, ${rand(0.3, 0.7)})`;
    g.beginPath();
    g.ellipse(rand(0, 256), rand(0, 256), rand(4, 18), rand(2, 8), rand(0, Math.PI), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(200,235,160,0.25)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const x = rand(0, 256), y = rand(0, 256);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + rand(-10, 10), y + rand(10, 25), x + rand(-6, 6), y + rand(20, 40));
    g.stroke();
  }
  return { map: toTexture(c), bumpMap: bumpFrom(c) };
}

// Vaso de barro: manchas e grãos alaranjados.
export function terracottaTextures() {
  const { c, g } = canvas(256);
  g.fillStyle = '#b5562b';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const light = Math.random() < 0.5;
    g.fillStyle = light ? `rgba(230,150,95,${rand(0.2, 0.5)})` : `rgba(90,35,15,${rand(0.15, 0.4)})`;
    g.beginPath();
    g.arc(rand(0, 256), rand(0, 256), rand(0.8, 2.5), 0, Math.PI * 2);
    g.fill();
  }
  return { map: toTexture(c), bumpMap: bumpFrom(c) };
}

// Terra úmida ou seca: grãos escuros e claros.
export function soilTexture() {
  const { c, g } = canvas(256);
  g.fillStyle = '#7a5a40';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = Math.random() < 0.5
      ? `rgba(40,25,15,${rand(0.2, 0.5)})`
      : `rgba(190,160,120,${rand(0.1, 0.3)})`;
    g.beginPath();
    g.arc(rand(0, 256), rand(0, 256), rand(0.6, 2), 0, Math.PI * 2);
    g.fill();
  }
  return { map: toTexture(c), bumpMap: bumpFrom(c) };
}

// Metal escovado: estrias finas, dá brilho de alumínio pintado.
export function metalTexture() {
  const { c, g } = canvas(256);
  g.fillStyle = '#c9ced6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(80,90,105,0.18)';
    g.lineWidth = rand(0.5, 1.5);
    const y = rand(0, 256);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y + rand(-1, 1));
    g.stroke();
  }
  return { map: toTexture(c) };
}

// Círculo suave usado nas partículas de poeira.
export function softDotTexture() {
  const { c, g } = canvas(64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

// Textura real (arquivo em assets/textures): não altera a cor do material,
// só o mapa. Se o arquivo não existir, o material fica com a cor sólida.
export function realMap(path, { repeat = [1, 1], srgb = true } = {}) {
  const tex = new THREE.TextureLoader().load(path, undefined, undefined, () => {});
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
