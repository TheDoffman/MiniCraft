/** Horizontal chunk size (blocks). Vertical span is full world height. */
export const CHUNK_XZ = 16;

export function chunkCount(dim) {
  return Math.ceil(dim / CHUNK_XZ);
}

/**
 * @param {number} cx chunk index
 * @param {number} cz chunk index
 * @param {number} [w] legacy finite world width — when set, clips last row/column to map edge
 * @param {number} [d] legacy finite world depth
 */
export function regionForChunk(cx, cz, w, d) {
  const x0 = cx * CHUNK_XZ;
  const z0 = cz * CHUNK_XZ;
  if (w == null || d == null) {
    return { x0, x1: x0 + CHUNK_XZ, z0, z1: z0 + CHUNK_XZ };
  }
  const x1 = Math.min(x0 + CHUNK_XZ, w);
  const z1 = Math.min(z0 + CHUNK_XZ, d);
  return { x0, x1, z0, z1 };
}

/**
 * Chunks that must rebuild when a block at (bx,bz) changes.
 * Only includes neighbor chunks when the block is on a chunk edge.
 * @param {number} [w] legacy finite width — when set, omits neighbors outside 0..w-1
 * @param {number} [d] legacy finite depth
 * @returns {string[]} keys "cx,cz"
 */
export function chunkKeysForBlock(bx, bz, w, d) {
  const cx = Math.floor(bx / CHUNK_XZ);
  const cz = Math.floor(bz / CHUNK_XZ);
  const mcx = w != null ? chunkCount(w) - 1 : null;
  const mcz = d != null ? chunkCount(d) - 1 : null;
  const lx = bx - cx * CHUNK_XZ;
  const lz = bz - cz * CHUNK_XZ;
  const edgeXLo = lx === 0;
  const edgeXHi = lx === CHUNK_XZ - 1;
  const edgeZLo = lz === 0;
  const edgeZHi = lz === CHUNK_XZ - 1;
  const keys = [`${cx},${cz}`];
  const canWest = mcx == null || cx > 0;
  const canEast = mcx == null || cx < mcx;
  const canNorth = mcz == null || cz > 0;
  const canSouth = mcz == null || cz < mcz;
  if (edgeXLo && canWest) keys.push(`${cx - 1},${cz}`);
  if (edgeXHi && canEast) keys.push(`${cx + 1},${cz}`);
  if (edgeZLo && canNorth) keys.push(`${cx},${cz - 1}`);
  if (edgeZHi && canSouth) keys.push(`${cx},${cz + 1}`);
  if (edgeXLo && edgeZLo && canWest && canNorth) keys.push(`${cx - 1},${cz - 1}`);
  if (edgeXLo && edgeZHi && canWest && canSouth) keys.push(`${cx - 1},${cz + 1}`);
  if (edgeXHi && edgeZLo && canEast && canNorth) keys.push(`${cx + 1},${cz - 1}`);
  if (edgeXHi && edgeZHi && canEast && canSouth) keys.push(`${cx + 1},${cz + 1}`);
  return keys;
}
