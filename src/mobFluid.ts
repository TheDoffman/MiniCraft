import { BlockId } from './blocktypes';

/**
 * World Y of the top surface of water in this column (first water hit scanning downward from sky).
 * @param {import('./world.js').World} world
 * @returns {number | null} block-space top Y of water column, or null if none
 */
export function getColumnWaterSurfaceY(world, x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  if (!world.inBounds(ix, 0, iz)) return null;
  const h = world.height;
  for (let yy = h - 1; yy >= 0; yy--) {
    if (world.get(ix, yy, iz) === BlockId.WATER) {
      return yy + 1;
    }
  }
  return null;
}
