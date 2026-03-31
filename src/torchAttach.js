/**
 * Placed-torch attachment (which block face the torch hangs from).
 * Stored per block in world._torchMeta; 0 = unset → infer from neighbors.
 */
import { BLOCKS } from './blocktypes.js';

const AIR = 0;

export const TorchAttach = {
  AUTO: 0,
  FLOOR: 1,
  CEILING: 2,
  /** Solid neighbor at (x - 1, y, z) */
  WALL_MX: 3,
  /** Solid at (x + 1, y, z) */
  WALL_PX: 4,
  /** Solid at (x, y, z - 1) */
  WALL_MZ: 5,
  /** Solid at (x, y, z + 1) */
  WALL_PZ: 6,
};

/** Solid / torch face meat & torches can sit against (not fluids). */
export function isTorchSupportBlock(id) {
  if (id === AIR) return false;
  const d = BLOCKS[id];
  if (!d || d.fluid) return false;
  return !!(d.solid || d.torch);
}

/**
 * @param {import('./world.js').World} world
 */
export function inferTorchAttach(world, x, y, z) {
  if (isTorchSupportBlock(world.get(x, y - 1, z))) return TorchAttach.FLOOR;
  if (isTorchSupportBlock(world.get(x - 1, y, z))) return TorchAttach.WALL_MX;
  if (isTorchSupportBlock(world.get(x + 1, y, z))) return TorchAttach.WALL_PX;
  if (isTorchSupportBlock(world.get(x, y, z - 1))) return TorchAttach.WALL_MZ;
  if (isTorchSupportBlock(world.get(x, y, z + 1))) return TorchAttach.WALL_PZ;
  if (isTorchSupportBlock(world.get(x, y + 1, z))) return TorchAttach.CEILING;
  return TorchAttach.FLOOR;
}

/**
 * @param {import('./world.js').World} world
 */
export function effectiveTorchAttach(world, x, y, z) {
  const a = world.getTorchAttach(x, y, z);
  if (a !== TorchAttach.AUTO) return a;
  return inferTorchAttach(world, x, y, z);
}

/** H - T (support block minus torch cell), each component in {-1,0,1}. */
export function torchSupportDeltaToAttach(dx, dy, dz) {
  if (dx === 0 && dy === -1 && dz === 0) return TorchAttach.FLOOR;
  if (dx === 0 && dy === 1 && dz === 0) return TorchAttach.CEILING;
  if (dx === -1 && dy === 0 && dz === 0) return TorchAttach.WALL_MX;
  if (dx === 1 && dy === 0 && dz === 0) return TorchAttach.WALL_PX;
  if (dx === 0 && dy === 0 && dz === -1) return TorchAttach.WALL_MZ;
  if (dx === 0 && dy === 0 && dz === 1) return TorchAttach.WALL_PZ;
  return TorchAttach.FLOOR;
}

/** World-space offset from block min corner for point light (rough flame center). */
export function torchLightOffset(attach) {
  switch (attach) {
    case TorchAttach.CEILING:
      return { ox: 0.5, oy: 0.35, oz: 0.5 };
    case TorchAttach.WALL_MX:
      return { ox: 0.72, oy: 0.52, oz: 0.5 };
    case TorchAttach.WALL_PX:
      return { ox: 0.28, oy: 0.52, oz: 0.5 };
    case TorchAttach.WALL_MZ:
      return { ox: 0.5, oy: 0.52, oz: 0.72 };
    case TorchAttach.WALL_PZ:
      return { ox: 0.5, oy: 0.52, oz: 0.28 };
    default:
      return { ox: 0.5, oy: 0.72, oz: 0.5 };
  }
}
