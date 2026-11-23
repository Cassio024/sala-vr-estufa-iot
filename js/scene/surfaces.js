// Superfícies onde os objetos soltos e as gotas pousam: chão, mesa e solo do vaso.
import { TABLE_Y, TABLE_Z } from './room.js';
import { SOIL_Y } from './plant.js';

export function surfaceHeight(x, z, y) {
  let best = { y: 0, soil: false };
  if (Math.abs(x) < 0.7 && Math.abs(z - TABLE_Z) < 0.35 && TABLE_Y <= y + 0.05) best = { y: TABLE_Y, soil: false };
  if (Math.hypot(x, z - TABLE_Z) < 0.12 && SOIL_Y <= y + 0.05) best = { y: SOIL_Y, soil: true };
  return best;
}
