/**
 * Minecraft-style water: sources (level 0) propagate down and up to 7 blocks
 * horizontally over solid/water footing; orphan water drains when cut off.
 *
 * Simulation uses getBlockIfLoaded only (no terrain generation while scanning).
 */
import { BlockId } from './blocktypes';

const SENT = 255;

const HORIZ_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Reused BFS buffers to cut GC during large water updates. */
let poolFlat = /** @type {Uint8Array | null} */ (null);
let poolQ: { x: number; y: number; z: number; d: number }[] = [];

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
  const dx = maxX - minX + 1;
  const dz = maxZ - minZ + 1;
  const dy = maxYi - minYi + 1;
  if (dx <= 0 || dz <= 0 || dy <= 0) return [];

  const n = dx * dz * dy;
  if (!poolFlat || poolFlat.length < n) {
    poolFlat = new Uint8Array(n);
  }
  const flat = poolFlat;
  flat.fill(SENT, 0, n);
  const stride = dz * dy;
  const q = poolQ;
  q.length = 0;

  const boxI = (x, y, z) => (x - minX) * stride + (z - minZ) * dy + (y - minYi);

  function tryEnq(x, y, z, d) {
    if (y < minYi || y > maxYi || x < minX || x > maxX || z < minZ || z > maxZ) return;
    const ii = boxI(x, y, z);
    const prev = flat[ii];
    if (prev !== SENT && prev <= d) return;
    flat[ii] = d;
    q.push({ x, y, z, d });
  }

  /* One seed per vertical “run” of water (top source cell per segment), not every block — huge for oceans. */
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      let inWaterRun = false;
      for (let y = maxYi; y >= minYi; y--) {
        const id = world.getBlockIfLoaded(x, y, z);
        if (id === null) {
          inWaterRun = false;
          continue;
        }
        const isSource =
          id === BlockId.WATER && world.getWaterLevelIfLoaded(x, y, z) === 0;
        if (isSource) {
          if (!inWaterRun) {
            tryEnq(x, y, z, 0);
            inWaterRun = true;
          }
        } else if (id !== BlockId.WATER) {
          inWaterRun = false;
        }
      }
    }
  }

  let qi = 0;
  while (qi < q.length) {
    const { x, y, z, d } = q[qi++];
    if (flat[boxI(x, y, z)] !== d) continue;

    if (y > 0) {
      const below = world.getBlockIfLoaded(x, y - 1, z);
      if (below === 0) tryEnq(x, y - 1, z, 0);
      else if (below === BlockId.WATER) tryEnq(x, y - 1, z, d);
    }

    for (let hi = 0; hi < 4; hi++) {
      const dxh = HORIZ_DIRS[hi][0];
      const dzh = HORIZ_DIRS[hi][1];
      const nx = x + dxh;
      const nz = z + dzh;
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

    /* Diagonal step into air when both sharing cardinals are water (vanilla-style corner seep). */
    for (let di = 0; di < 4; di++) {
      const [dxd, dzd] = DIAG_DIRS[di];
      const nx = x + dxd;
      const nz = z + dzd;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const nid = world.getBlockIfLoaded(nx, y, nz);
      if (nid !== 0) continue;
      const sideX = world.getBlockIfLoaded(x + dxd, y, z);
      const sideZ = world.getBlockIfLoaded(x, y, z + dzd);
      if (sideX !== BlockId.WATER || sideZ !== BlockId.WATER) continue;
      if (d < 7 && hasFooting(world, nx, y, nz)) tryEnq(nx, y, nz, d + 1);
    }
  }

  const cols = new Set<string>();
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minYi; y <= maxYi; y++) {
        const id = world.getBlockIfLoaded(x, y, z);
        if (id === null) continue;
        const wasW = id === BlockId.WATER;
        const bd = flat[boxI(x, y, z)];
        if (bd !== SENT) {
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

  const out: { x: number; z: number }[] = [];
  for (const s of cols) {
    const c = s.indexOf(',');
    out.push({ x: Number(s.slice(0, c)), z: Number(s.slice(c + 1)) });
  }
  return out;
}

function hasFooting(world, x, y, z) {
  if (y <= 0) return true;
  const b = world.getBlockIfLoaded(x, y - 1, z);
  if (b === null) return false;
  return b !== 0;
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
