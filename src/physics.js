import { BLOCKS, BlockId } from './blocktypes.js';

function overlaps(min, max, bx, by, bz) {
  if (max[0] <= bx || min[0] >= bx + 1) return false;
  if (max[1] <= by || min[1] >= by + 1) return false;
  if (max[2] <= bz || min[2] >= bz + 1) return false;
  return true;
}

/**
 * @param {import('./world.js').World} world
 */
export function collidesAABB(world, min, max) {
  const x0 = Math.floor(min[0]);
  const x1 = Math.floor(max[0]);
  const y0 = Math.floor(min[1]);
  const y1 = Math.floor(max[1]);
  const z0 = Math.floor(min[2]);
  const z1 = Math.floor(max[2]);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const id = world.get(x, y, z);
        if (id === 0) continue;
        const def = BLOCKS[id];
        if (!def.solid) continue;
        if (def.collision === false) continue;
        if (overlaps(min, max, x, y, z)) return true;
      }
    }
  }
  return false;
}

/**
 * True if the AABB intersects any fluid block (water).
 * @param {import('./world.js').World} world
 * @param {number[]} min
 * @param {number[]} max
 */
export function aabbOverlapsFluid(world, min, max) {
  const x0 = Math.floor(min[0]);
  const x1 = Math.floor(max[0]);
  const y0 = Math.floor(min[1]);
  const y1 = Math.floor(max[1]);
  const z0 = Math.floor(min[2]);
  const z1 = Math.floor(max[2]);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const id = world.get(x, y, z);
        if (id === 0) continue;
        if (BLOCKS[id].fluid && overlaps(min, max, x, y, z)) return true;
      }
    }
  }
  return false;
}

/**
 * True only when every block cell that intersects the AABB is water (underwater overlay / swim).
 * Lava is excluded so the blue underwater effect does not apply in lava.
 * @param {import('./world.js').World} world
 * @param {number[]} min
 * @param {number[]} max
 */
export function aabbFullySubmergedInWater(world, min, max) {
  const x0 = Math.floor(min[0]);
  const x1 = Math.floor(max[0]);
  const y0 = Math.floor(min[1]);
  const y1 = Math.floor(max[1]);
  const z0 = Math.floor(min[2]);
  const z1 = Math.floor(max[2]);
  let hitAny = false;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (!overlaps(min, max, x, y, z)) continue;
        hitAny = true;
        const id = world.get(x, y, z);
        if (id !== BlockId.WATER) return false;
      }
    }
  }
  return hitAny;
}

/**
 * @deprecated Use {@link aabbFullySubmergedInWater}; kept name for tests that mean “any fluid”.
 */
export function aabbFullySubmergedInFluid(world, min, max) {
  return aabbFullySubmergedInWater(world, min, max);
}

/**
 * True if the AABB intersects any cell with the given block id.
 * @param {import('./world.js').World} world
 * @param {number[]} min
 * @param {number[]} max
 * @param {number} blockId
 */
export function aabbOverlapsBlockId(world, min, max, blockId) {
  const x0 = Math.floor(min[0]);
  const x1 = Math.floor(max[0]);
  const y0 = Math.floor(min[1]);
  const y1 = Math.floor(max[1]);
  const z0 = Math.floor(min[2]);
  const z1 = Math.floor(max[2]);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (world.get(x, y, z) === blockId && overlaps(min, max, x, y, z)) return true;
      }
    }
  }
  return false;
}
