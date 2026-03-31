/**
 * Minecraft-style water: sources (level 0) propagate down and up to 7 blocks
 * horizontally over solid/water footing; orphan water drains when cut off.
 *
 * Simulation uses getBlockIfLoaded only (no terrain generation while scanning).
 */
import { BlockId } from './blocktypes.js';

function key3(x, y, z) {
  return `${x},${y},${z}`;
}

function hasFooting(world, x, y, z) {
  if (y <= 0) return true;
  const b = world.getBlockIfLoaded(x, y - 1, z);
  if (b === null) return false;
  return b !== 0;
}

/**
 * True if breaking at (bx,by,bz) could change water (removed water or any water in 3×3×3).
 * Call after the block is already set to air.
 * @param {import('./world.js').World} world
 * @param {boolean} brokenWasWater
 */
export function needsWaterRecomputeAfterBreak(world, bx, by, bz, brokenWasWater) {
  if (brokenWasWater) return true;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = bx + dx;
        const y = by + dy;
        const z = bz + dz;
        if (!world.inBounds(x, y, z)) continue;
        const id = world.getBlockIfLoaded(x, y, z);
        if (id === BlockId.WATER) return true;
      }
    }
  }
  return false;
}

/**
 * Recompute water inside an axis-aligned box (world coords, inclusive).
 * @param {import('./world.js').World} world
 * @returns {{ x: number, z: number }[]} unique columns that changed
 */
export function recomputeWaterBox(world, minX, maxX, minY, maxY, minZ, maxZ) {
  const h = world.height;
  const minYi = Math.max(0, minY);
  const maxYi = Math.min(h - 1, maxY);
  /** @type {Map<string, number>} */
  const best = new Map();
  /** @type {{ x: number, y: number, z: number, d: number }[]} */
  const q = [];

  function tryEnq(x, y, z, d) {
    if (y < 0 || y >= h || x < minX || x > maxX || z < minZ || z > maxZ) return;
    const k = key3(x, y, z);
    const cur = best.get(k);
    if (cur !== undefined && cur <= d) return;
    best.set(k, d);
    q.push({ x, y, z, d });
  }

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minYi; y <= maxYi; y++) {
        const id = world.getBlockIfLoaded(x, y, z);
        if (id === null || id !== BlockId.WATER) continue;
        if (world.getWaterLevelIfLoaded(x, y, z) !== 0) continue;
        tryEnq(x, y, z, 0);
      }
    }
  }

  let qi = 0;
  while (qi < q.length) {
    const { x, y, z, d } = q[qi++];

    if (y > 0) {
      const below = world.getBlockIfLoaded(x, y - 1, z);
      if (below === 0) tryEnq(x, y - 1, z, d);
    }

    const horiz = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dz] of horiz) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const nid = world.getBlockIfLoaded(nx, y, nz);
      if (nid === null) continue;
      if (nid === BlockId.WATER) {
        tryEnq(nx, y, nz, d);
        continue;
      }
      if (nid === 0 && d < 7 && hasFooting(world, nx, y, nz)) {
        tryEnq(nx, y, nz, d + 1);
      }
    }
  }

  const cols = new Set();
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minYi; y <= maxYi; y++) {
        const id = world.getBlockIfLoaded(x, y, z);
        if (id === null) continue;
        const wasW = id === BlockId.WATER;
        const bd = best.get(key3(x, y, z));
        if (bd !== undefined) {
          const tl = Math.min(7, bd);
          if (!wasW) {
            world.set(x, y, z, BlockId.WATER);
            world.setWaterLevel(x, y, z, tl);
            cols.add(`${x},${z}`);
          } else if (world.getWaterLevelIfLoaded(x, y, z) !== tl) {
            world.setWaterLevel(x, y, z, tl);
            cols.add(`${x},${z}`);
          }
        } else if (wasW) {
          world.set(x, y, z, 0);
          cols.add(`${x},${z}`);
        }
      }
    }
  }

  return [...cols].map((s) => {
    const [a, b] = s.split(',').map(Number);
    return { x: a, z: b };
  });
}

/**
 * @param {import('./world.js').World} world
 * @param {number} wx
 * @param {number} wy
 * @param {number} wz
 * @param {number} [pad]
 * @returns {{ x: number, z: number }[]}
 */
export function recomputeWaterAround(world, wx, wy, wz, pad = 12) {
  const h = world.height;
  const minX = Math.floor(wx - pad);
  const maxX = Math.ceil(wx + pad);
  const minZ = Math.floor(wz - pad);
  const maxZ = Math.ceil(wz + pad);
  return recomputeWaterBox(world, minX, maxX, 0, h - 1, minZ, maxZ);
}
