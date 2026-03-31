import { TILE_PX, ATLAS_TILES } from './blocktypes.js';

const ATLAS_SIZE = ATLAS_TILES * TILE_PX;
const EPS = 0.02;

function uvCorners(tx, ty) {
  const u0 = (tx * TILE_PX) / ATLAS_SIZE;
  const u1 = ((tx + 1) * TILE_PX) / ATLAS_SIZE;
  const vTop = 1 - (ty * TILE_PX) / ATLAS_SIZE;
  const vBot = 1 - ((ty + 1) * TILE_PX) / ATLAS_SIZE;
  return {
    bl: [u0, vBot],
    br: [u1, vBot],
    tl: [u0, vTop],
    tr: [u1, vTop],
  };
}

function pushQuad(positions, normals, uvs, indices, colors, nx, ny, nz, verts, uv4, ao4) {
  const b = positions.length / 3;
  for (const [px, py, pz] of verts) {
    positions.push(px, py, pz);
    normals.push(nx, ny, nz);
  }
  for (const [u, v] of uv4) {
    uvs.push(u, v);
  }
  for (const a of ao4) {
    colors.push(a, a, a);
  }
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
}

/**
 * Minecraft-style crossed billboards (two vertical quads), one texture stretched over {@link heightBlocks}.
 */
export function pushCrossPlant(x, y, z, heightBlocks, tx, ty, positions, normals, uvs, indices, colors) {
  const c = uvCorners(tx, ty);
  const ao = [1, 1, 1, 1];
  const y0 = y;
  const y1 = y + heightBlocks;
  const e = EPS;
  const n1x = 1 / Math.sqrt(2);
  const n1z = -1 / Math.sqrt(2);
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    n1x,
    0,
    n1z,
    [
      [x + e, y0, z + e],
      [x + e, y1, z + e],
      [x + 1 - e, y1, z + 1 - e],
      [x + 1 - e, y0, z + 1 - e],
    ],
    [c.bl, c.tl, c.tr, c.br],
    ao,
  );
  const n2x = -1 / Math.sqrt(2);
  const n2z = -1 / Math.sqrt(2);
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    n2x,
    0,
    n2z,
    [
      [x + e, y0, z + 1 - e],
      [x + e, y1, z + 1 - e],
      [x + 1 - e, y1, z + e],
      [x + 1 - e, y0, z + e],
    ],
    [c.bl, c.tl, c.tr, c.br],
    ao,
  );
}
