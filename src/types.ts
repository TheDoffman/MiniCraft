/**
 * Shared structural types for modules that need a minimal voxel API (e.g. mesher vs World).
 */

/** Read block id at world integer coordinates. */
export interface VoxelAccessor {
  get(x: number, y: number, z: number): number;
}

/** Result of `createChunkSnapshot` in mesher. */
export interface ChunkSnapshot extends VoxelAccessor {
  buf: Uint8Array;
  W: number;
  h: number;
  maxY: number;
  x0: number;
  z0: number;
}
