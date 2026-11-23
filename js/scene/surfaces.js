// Superfícies onde os objetos soltos e as gotas pousam: chão, mesa, bancadas e solo do vaso.
import { TABLE_Y, TABLE_Z, GREENHOUSE_SIZE } from './room.js';
import { SOIL_Y } from './plant.js';

// Bancadas laterais (ver environment.js > buildBenches): tampo em y = 0,8 com 5 cm de espessura.
export const BENCH_TOP_Y = 0.825;
const BENCH_X = GREENHOUSE_SIZE / 2 - 0.7;
const BENCH_HALF_W = 0.35;
const BENCH_HALF_LEN = (GREENHOUSE_SIZE - 1.2) / 2;

// Balanças de segurança embaixo dos vasos das bancadas (registradas por bench-irrigation.js):
// [{ x, z, half, y }] — plataforma quadrada de meia-largura "half" com o topo em y.
const scalePads = [];
export function setScalePads(pads) {
  scalePads.length = 0;
  scalePads.push(...pads);
}

// y = altura de onde o objeto está vindo: ele só pousa em superfícies abaixo dele.
export function surfaceHeight(x, z, y) {
  let best = { y: 0, soil: false };
  if (Math.abs(x) < 0.7 && Math.abs(z - TABLE_Z) < 0.35 && TABLE_Y <= y + 0.05) best = { y: TABLE_Y, soil: false };
  if (Math.abs(Math.abs(x) - BENCH_X) < BENCH_HALF_W && Math.abs(z) < BENCH_HALF_LEN && BENCH_TOP_Y <= y + 0.05) {
    best = { y: BENCH_TOP_Y, soil: false };
    for (const p of scalePads) {
      if (Math.abs(x - p.x) < p.half && Math.abs(z - p.z) < p.half && p.y <= y + 0.05) best = { y: p.y, soil: false };
    }
  }
  if (Math.hypot(x, z - TABLE_Z) < 0.12 && SOIL_Y <= y + 0.05) best = { y: SOIL_Y, soil: true };
  return best;
}
