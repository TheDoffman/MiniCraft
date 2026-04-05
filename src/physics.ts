import { BlockId, blockDef } from './blocktypes';

function overlaps(min, max, bx, by, bz) {
  if (max[0] <= bx || min[0] >= bx + 1) return false;
  if (max[1] <= by || min[1] >= by + 1) return false;
  if (max[2] <= bz || min[2] >= bz + 1) return false;
  return true;
}

/**
 * @param {import('./world.js').World} world
 */
/** True if two axis-aligned boxes intersect in 3D (flush faces do not count). */
export function aabbIntersects3D(minA, maxA, minB, maxB) {
  if (maxA[0] <= minB[0] || minA[0] >= maxB[0]) return false;
  if (maxA[1] <= minB[1] || minA[1] >= maxB[1]) return false;
  if (maxA[2] <= minB[2] || minA[2] >= maxB[2]) return false;
  return true;
}

/**
 * Positive overlap lengths along each axis when intersecting; meaningless if not intersecting.
 * @returns {{ ox: number, oy: number, oz: number }}
 */
export function overlapDepths3D(minA, maxA, minB, maxB) {
  return {
    ox: Math.min(maxA[0], maxB[0]) - Math.max(minA[0], minB[0]),
    oy: Math.min(maxA[1], maxB[1]) - Math.max(minA[1], minB[1]),
    oz: Math.min(maxA[2], maxB[2]) - Math.max(minA[2], minB[2]),
  };
}

/**
 * Block geometry or any mob AABB (for player movement blocking).
 * @param {Array<{ min: number[], max: number[] }> | { boxes: { min: number[], max: number[] }[], count: number } | null | undefined} [mobBoxes]
 */
export function collidesWorldOrMobBoxes(world, min, max, mobBoxes) {
  if (collidesAABB(world, min, max)) return true;
  const n =
    mobBoxes && 'count' in mobBoxes
      ? mobBoxes.count
      : mobBoxes
        ? mobBoxes.length
        : 0;
  if (n === 0) return false;
  const arr = mobBoxes && 'count' in mobBoxes ? mobBoxes.boxes : mobBoxes;
  for (let i = 0; i < n; i++) {
    const b = arr[i];
    if (aabbIntersects3D(min, max, b.min, b.max)) return true;
  }
  return false;
}

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
        const def = blockDef(id);
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
        if (blockDef(id).fluid && overlaps(min, max, x, y, z)) return true;
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
