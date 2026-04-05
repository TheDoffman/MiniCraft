import { BlockId, ATLAS_TILES, TILE_PX } from './blocktypes';

const D = 1 / 8;
const ATLAS_SIZE = ATLAS_TILES * TILE_PX;

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} az
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 */
function quadNormal(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return [0, 1, 0];
  return [nx / len, ny / len, nz / len];
}

/**
 * Slab local: lx ∈ [0,D] (outward thickness), lz ∈ [0,1] (width), ly ∈ [0,H] (height).
 * @param {number} facing 0 +X, 1 -X, 2 +Z, 3 -Z outward wall normal
 */
function localToWorld(facing, x, y, z, lx, ly, lz, H) {
  void H;
  switch (facing) {
    case 0:
      return [x + 1 - D + lx, y + ly, z + lz];
    case 1:
      return [x + lx, y + ly, z + lz];
    case 2:
      return [x + lz, y + ly, z + 1 - D + lx];
    case 3:
    default:
      return [x + lz, y + ly, z + lx];
  }
}

/** World-space pivot on hinge edge (outer × width corner), mid height. */
function pivotWorld(facing, x, y, z, hingeRight, H) {
  const lzP = hingeRight ? 1 : 0;
  const py = y + H * 0.5;
  switch (facing) {
    case 0:
      return [x + 1 - D, py, z + lzP];
    case 1:
      return [x, py, z + lzP];
    case 2:
      return [x + lzP, py, z + 1 - D];
    case 3:
    default:
      return [x + lzP, py, z];
  }
}

function rotY(wx, wy, wz, px, py, pz, ca, sa) {
  const vx = wx - px;
  const vz = wz - pz;
  return [px + vx * ca - vz * sa, wy, pz + vx * sa + vz * ca];
}

function uvTileCorners(tx, ty) {
  const u0 = (tx * TILE_PX) / ATLAS_SIZE;
  const u1 = ((tx + 1) * TILE_PX) / ATLAS_SIZE;
  const vTop = 1 - (ty * TILE_PX) / ATLAS_SIZE;
  const vBot = 1 - ((ty + 1) * TILE_PX) / ATLAS_SIZE;
  return { bl: [u0, vBot], tl: [u0, vTop], tr: [u1, vTop], br: [u1, vBot] };
}

/**
 * @param {import('./world.js').World} _world
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} blockId
 * @param {number} meta
 * @param {number} height
 * @param {number} tx
 * @param {number} ty
 */
export function pushMinecraftDoorPanels(
  _world,
  x,
  y,
  z,
  blockId,
  meta,
  height,
  tx,
  ty,
  positions,
  normals,
  uvs,
  indices,
  colors,
) {
  const open = blockId === BlockId.DOOR_OPEN;
  const facing = meta & 3;
  const hingeRight = !!(meta & 4);
  const ang = open ? (hingeRight ? -Math.PI / 2 : Math.PI / 2) : 0;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const H = height;
  const p = pivotWorld(facing, x, y, z, hingeRight, H);

  const full = uvTileCorners(tx, ty);

  /**
   * @param {number[][]} lc4 [lx,ly,lz] × 4 CCW outward
   * @param {[number, number][]} uv4
   */
  function pushQuadLc(lc4, uv4) {
    const w = lc4.map(([lx, ly, lz]) => {
      const [wx0, wy0, wz0] = localToWorld(facing, x, y, z, lx, ly, lz, H);
      return rotY(wx0, wy0, wz0, p[0], p[1], p[2], ca, sa);
    });
    const [nx, ny, nz] = quadNormal(
      w[0][0],
      w[0][1],
      w[0][2],
      w[1][0],
      w[1][1],
      w[1][2],
      w[2][0],
      w[2][1],
      w[2][2],
    );
    const b = positions.length / 3;
    for (const pt of w) {
      positions.push(pt[0], pt[1], pt[2]);
      normals.push(nx, ny, nz);
    }
    for (const uv of uv4) {
      uvs.push(uv[0], uv[1]);
    }
    for (let i = 0; i < 4; i++) colors.push(1, 1, 1);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  /* Six faces of the thin box in local (lx, ly, lz). */
  /* +lx outer */
  pushQuadLc(
    [
      [D, 0, 0],
      [D, H, 0],
      [D, H, 1],
      [D, 0, 1],
    ],
    [full.bl, full.tl, full.tr, full.br],
  );
  /* -lx inner (flip U) */
  pushQuadLc(
    [
      [0, 0, 1],
      [0, H, 1],
      [0, H, 0],
      [0, 0, 0],
    ],
    [full.br, full.tr, full.tl, full.bl],
  );
  /* lz=0 side */
  pushQuadLc(
    [
      [0, 0, 0],
      [0, H, 0],
      [D, H, 0],
      [D, 0, 0],
    ],
    [full.bl, full.tl, full.tr, full.br],
  );
  /* lz=1 side */
  pushQuadLc(
    [
      [D, 0, 1],
      [D, H, 1],
      [0, H, 1],
      [0, 0, 1],
    ],
    [full.bl, full.tl, full.tr, full.br],
  );
  /* ly=0 bottom */
  pushQuadLc(
    [
      [0, 0, 0],
      [D, 0, 0],
      [D, 0, 1],
      [0, 0, 1],
    ],
    [full.bl, full.br, full.tr, full.tl],
  );
  /* ly=H top */
  pushQuadLc(
    [
      [0, H, 1],
      [D, H, 1],
      [D, H, 0],
      [0, H, 0],
    ],
    [full.bl, full.br, full.tr, full.tl],
  );
}
