// Colisão simples no plano do chão, usada pelo modo FPS (PC) e pelo andar com joystick (VR).
// O jogador é um círculo de raio `radius`; os móveis são retângulos; a estufa é um
// quadrado de vidro que só deixa passar pela porta (no lado da frente, z = +half).
//
// world = {
//   half,           // metade do tamanho da estufa (paredes em x = ±half e z = ±half)
//   doorHalfWidth,  // metade da largura da porta (centrada em x = 0, parede da frente)
//   limit,          // limite do mundo (|x| e |z| até aqui)
//   boxes: [{ x, z, hw, hd }], // móveis: centro e meia-largura / meia-profundidade
// }

export function createCollider(world, radius = 0.25) {
  function blocked(x, z) {
    for (const b of world.boxes) {
      if (Math.abs(x - b.x) < b.hw + radius && Math.abs(z - b.z) < b.hd + radius) return true;
    }
    const h = world.half;
    const alongZ = Math.abs(z) < h + radius;
    const alongX = Math.abs(x) < h + radius;
    if (alongZ && Math.abs(Math.abs(x) - h) < radius) return true; // paredes laterais
    if (alongX && Math.abs(z + h) < radius) return true; // parede do fundo
    const inDoor = Math.abs(x) < world.doorHalfWidth - radius * 0.6;
    if (alongX && Math.abs(z - h) < radius && !inDoor) return true; // parede da frente (com porta)
    return false;
  }

  const clamp = (v) => Math.min(world.limit, Math.max(-world.limit, v));

  /**
   * Move `pos` (objeto com x e z) em (dx, dz) respeitando a colisão.
   * Tenta X e Z separadamente: assim o jogador "desliza" pela parede em vez de travar.
   * Passos grandes são divididos para não atravessar paredes finas.
   */
  function tryMove(pos, dx, dz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.8)));
    for (let i = 0; i < steps; i++) {
      const nx = clamp(pos.x + dx / steps);
      if (!blocked(nx, pos.z)) pos.x = nx;
      const nz = clamp(pos.z + dz / steps);
      if (!blocked(pos.x, nz)) pos.z = nz;
    }
    return pos;
  }

  return { blocked, tryMove, radius };
}
