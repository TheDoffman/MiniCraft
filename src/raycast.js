import { BLOCKS } from './blocktypes.js';

/** Solid blocks the ray stops on (includes bedrock; excludes fluids). Torches and tall grass are thin but targetable. */
export function isRayStop(world, x, y, z) {
  const id = world.get(x, y, z);
  if (id === 0) return false;
  const def = BLOCKS[id];
  if (def?.torch) return true;
  if (def?.tallGrassBottom || def?.tallGrassTop || def?.shortGrass) return true;
  return !!def?.solid && !def?.fluid;
}

/**
 * Solid colliding blocks — used for rain particle line-of-sight (glass / open doors pass through).
 */
export function isParticleOccluder(world, x, y, z) {
  const id = world.get(x, y, z);
  if (id === 0) return false;
  const def = BLOCKS[id];
  if (!def || def.fluid || !def.solid || def.collision === false) return false;
  return true;
}

/**
 * Grid traversal (Amanatides & Woo style) — stable at grazing angles vs fixed step.
 * @param {import('./world.js').World} world
 * @param {{ isStop?: (w: import('./world.js').World, x: number, y: number, z: number) => boolean }} [opts] Custom voxel test; default is {@link isRayStop}.
 */
export function raycastBlocks(world, ox, oy, oz, dx, dy, dz, maxDist, opts) {
  const isStop = opts?.isStop ?? isRayStop;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return null;
  dx /= len;
  dy /= len;
  dz /= len;

  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const stepZ = dz === 0 ? 0 : dz > 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  const fract = (v) => v - Math.floor(v);
  let tMaxX =
    dx > 0 ? (1 - fract(ox)) * tDeltaX : dx < 0 ? fract(ox) * tDeltaX : Infinity;
  let tMaxY =
    dy > 0 ? (1 - fract(oy)) * tDeltaY : dy < 0 ? fract(oy) * tDeltaY : Infinity;
  let tMaxZ =
    dz > 0 ? (1 - fract(oz)) * tDeltaZ : dz < 0 ? fract(oz) * tDeltaZ : Infinity;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  let prevX = x;
  let prevY = y;
  let prevZ = z;

  if (world.inBounds(x, y, z) && isStop(world, x, y, z)) {
    return {
      hit: { x, y, z },
      prev: { x: prevX, y: prevY, z: prevZ },
      t: 0,
    };
  }

  let t = 0;
  while (true) {
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        t = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        t = tMaxY;
        y += stepY;
        tMaxY += tDeltaY;
      } else {
        t = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    }

    if (t > maxDist) return null;

    if (!world.inBounds(x, y, z)) {
      return null;
    }

    if (isStop(world, x, y, z)) {
      return {
        hit: { x, y, z },
        prev: { x: prevX, y: prevY, z: prevZ },
        t,
      };
    }

    prevX = x;
    prevY = y;
    prevZ = z;
  }
}
