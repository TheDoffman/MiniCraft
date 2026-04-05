import * as THREE from 'three';
import {
  BLOCKS,
  BlockId,
  TILE_PX,
  TILE_CELLS,
  ATLAS_TILES,
  blockDef,
  isDoorBottomId,
  isDoorTopId,
  isTallGrassBottomId,
  isTallGrassTopId,
} from './blocktypes';
import { pushMinecraftDoorPanels } from './doorMesh';
import { pushCrossPlant } from './plantMesh';
import { TorchAttach, effectiveTorchAttach } from './torchAttach';
import { CHUNK_XZ } from './chunks';

const ATLAS_SIZE = ATLAS_TILES * TILE_PX;

/**
 * Fast local voxel snapshot for a chunk + 1-block border from neighbors.
 * Avoids world.get() overhead (Map lookup + ensureChunk + index math) in the mesher hot loop.
 */
const SNAP_PAD = 1;

/**
 * Source chunk layout: idx = lx + CHUNK_XZ * (y + h * lz)
 * Snapshot layout:     idx = sx + W * (y + h * sz)    where sx = wx - x0 + PAD, sz = wz - z0 + PAD
 */
function createChunkSnapshot(world, cx, cz) {
  const h = world.height;
  const W = CHUNK_XZ + SNAP_PAD * 2;
  const buf = new Uint8Array(W * h * W);
  const x0 = cx * CHUNK_XZ;
  const z0 = cz * CHUNK_XZ;

  const mainBuf = world.getChunkBuffer(cx, cz);

  let maxY = 0;
  for (let lz = 0; lz < CHUNK_XZ; lz++) {
    for (let lx = 0; lx < CHUNK_XZ; lx++) {
      const sx = lx + SNAP_PAD;
      const sz = lz + SNAP_PAD;
      for (let y = 0; y < h; y++) {
        const v = mainBuf[lx + CHUNK_XZ * (y + h * lz)];
        if (v !== 0) {
          buf[sx + W * (y + h * sz)] = v;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  // -X neighbor: copy column lx=15 (the edge adjacent to our chunk)
  const nMX = world.getChunkBufferIfLoaded(cx - 1, cz);
  if (nMX) {
    const sx = 0; // SNAP_PAD - 1
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      const sz = lz + SNAP_PAD;
      const srcBase = (CHUNK_XZ - 1) + CHUNK_XZ * h * lz;
      const dstBase = sx + W * h * sz;
      for (let y = 0; y <= maxY; y++) {
        const v = nMX[srcBase + CHUNK_XZ * y];
        if (v !== 0) buf[dstBase + W * y] = v;
      }
    }
  }
  // +X neighbor: copy column lx=0
  const nPX = world.getChunkBufferIfLoaded(cx + 1, cz);
  if (nPX) {
    const sx = CHUNK_XZ + SNAP_PAD;
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      const sz = lz + SNAP_PAD;
      const srcBase = CHUNK_XZ * h * lz;
      const dstBase = sx + W * h * sz;
      for (let y = 0; y <= maxY; y++) {
        const v = nPX[srcBase + CHUNK_XZ * y];
        if (v !== 0) buf[dstBase + W * y] = v;
      }
    }
  }
  // -Z neighbor: copy row lz=15
  const nMZ = world.getChunkBufferIfLoaded(cx, cz - 1);
  if (nMZ) {
    const sz = 0;
    for (let lx = 0; lx < CHUNK_XZ; lx++) {
      const sx = lx + SNAP_PAD;
      const srcBase = lx + CHUNK_XZ * h * (CHUNK_XZ - 1);
      const dstBase = sx + W * h * sz;
      for (let y = 0; y <= maxY; y++) {
        const v = nMZ[srcBase + CHUNK_XZ * y];
        if (v !== 0) buf[dstBase + W * y] = v;
      }
    }
  }
  // +Z neighbor: copy row lz=0
  const nPZ = world.getChunkBufferIfLoaded(cx, cz + 1);
  if (nPZ) {
    const sz = CHUNK_XZ + SNAP_PAD;
    for (let lx = 0; lx < CHUNK_XZ; lx++) {
      const sx = lx + SNAP_PAD;
      const srcBase = lx;
      const dstBase = sx + W * h * sz;
      for (let y = 0; y <= maxY; y++) {
        const v = nPZ[srcBase + CHUNK_XZ * y];
        if (v !== 0) buf[dstBase + W * y] = v;
      }
    }
  }

  const _h = h;
  const _W = W;
  const _buf = buf;
  const _x0 = x0;
  const _z0 = z0;
  const _maxY = Math.min(maxY + 2, h - 1);

  return {
    buf: _buf,
    W: _W,
    h: _h,
    maxY: _maxY,
    x0: _x0,
    z0: _z0,
    get(x, y, z) {
      if (y < 0 || y >= _h) return 0;
      const lx = x - _x0 + SNAP_PAD;
      const lz = z - _z0 + SNAP_PAD;
      if (lx < 0 || lx >= _W || lz < 0 || lz >= _W) return 0;
      return _buf[lx + _W * (y + _h * lz)];
    },
  };
}
/** Surface water top is slightly below the block top for a visible edge next to shores. */
const WATER_TOP_INSET = 1 / 16;

/** Still water / source: full block top. Flow levels 1–7 → lower surface (MC-style decay). */
function waterFlatTopY(world, bx, by, bz) {
  if (world.get(bx, by, bz) !== BlockId.WATER) return by + 1;
  if (world.inBounds(bx, by + 1, bz) && world.get(bx, by + 1, bz) === BlockId.WATER) {
    return by + 1;
  }
  const lv = world.getWaterLevel(bx, by, bz);
  if (lv <= 0) return by + 1 - WATER_TOP_INSET;
  const L = Math.min(7, lv);
  return by + (8 - L) / 8;
}

/** Shared corner height for sloped top (min of adjacent water surfaces). */
function waterCornerTopY(world, yLayer, gx, gz) {
  let minH = Infinity;
  for (const [bx, bz] of [
    [gx - 1, gz - 1],
    [gx, gz - 1],
    [gx - 1, gz],
    [gx, gz],
  ]) {
    if (!world.inBounds(bx, yLayer, bz)) continue;
    if (world.get(bx, yLayer, bz) !== BlockId.WATER) continue;
    minH = Math.min(minH, waterFlatTopY(world, bx, yLayer, bz));
  }
  return Number.isFinite(minH) ? minH : yLayer + 1;
}

function waterNeighborSurfaceH(world, bx, by, bz) {
  const id = world.get(bx, by, bz);
  if (id === BlockId.WATER) return waterFlatTopY(world, bx, by, bz);
  if (id === 0) return by;
  return null;
}

/** Horizontal flow toward lower surface / empty (for texture current). */
function waterFlowDir(world, x, y, z) {
  const my = waterFlatTopY(world, x, y, z);
  let gx = 0;
  let gz = 0;
  for (const [ox, oz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + ox;
    const nz = z + oz;
    if (!world.inBounds(nx, y, nz)) continue;
    const nh = waterNeighborSurfaceH(world, nx, y, nz);
    if (nh === null) continue;
    gx += ox * (nh - my);
    gz += oz * (nh - my);
  }
  const len = Math.hypot(gx, gz);
  if (len < 1e-5) return { fx: 1, fz: 0 };
  return { fx: -gx / len, fz: -gz / len };
}

/** Same as {@link waterFlatTopY} but reads block ids from chunk snapshot (matches fluid face culling at borders). */
function waterFlatTopYSnap(world, snap, bx, by, bz) {
  if (snap.get(bx, by, bz) !== BlockId.WATER) return by + 1;
  if (world.inBounds(bx, by + 1, bz) && snap.get(bx, by + 1, bz) === BlockId.WATER) {
    return by + 1;
  }
  const lv = world.getWaterLevel(bx, by, bz);
  if (lv <= 0) return by + 1 - WATER_TOP_INSET;
  const L = Math.min(7, lv);
  return by + (8 - L) / 8;
}

function waterCornerTopYSnap(world, snap, yLayer, gx, gz) {
  let minH = Infinity;
  for (const [bx, bz] of [
    [gx - 1, gz - 1],
    [gx, gz - 1],
    [gx - 1, gz],
    [gx, gz],
  ]) {
    if (!world.inBounds(bx, yLayer, bz)) continue;
    if (snap.get(bx, yLayer, bz) !== BlockId.WATER) continue;
    minH = Math.min(minH, waterFlatTopYSnap(world, snap, bx, yLayer, bz));
  }
  return Number.isFinite(minH) ? minH : yLayer + 1;
}

function waterNeighborSurfaceHSnap(world, snap, bx, by, bz) {
  const id = snap.get(bx, by, bz);
  if (id === BlockId.WATER) return waterFlatTopYSnap(world, snap, bx, by, bz);
  if (id === 0) return by;
  return null;
}

function waterFlowDirSnap(world, snap, x, y, z) {
  const my = waterFlatTopYSnap(world, snap, x, y, z);
  let gx = 0;
  let gz = 0;
  for (const [ox, oz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + ox;
    const nz = z + oz;
    if (!world.inBounds(nx, y, nz)) continue;
    const nh = waterNeighborSurfaceHSnap(world, snap, nx, y, nz);
    if (nh === null) continue;
    gx += ox * (nh - my);
    gz += oz * (nh - my);
  }
  const len = Math.hypot(gx, gz);
  if (len < 1e-5) return { fx: 1, fz: 0 };
  return { fx: -gx / len, fz: -gz / len };
}

const _uvC = {
  bl: [0, 0] as [number, number],
  br: [0, 0] as [number, number],
  tl: [0, 0] as [number, number],
  tr: [0, 0] as [number, number],
};

function uvCorners(tx, ty) {
  const u0 = (tx * TILE_PX) / ATLAS_SIZE;
  const u1 = ((tx + 1) * TILE_PX) / ATLAS_SIZE;
  const vTop = 1 - (ty * TILE_PX) / ATLAS_SIZE;
  const vBot = 1 - ((ty + 1) * TILE_PX) / ATLAS_SIZE;
  _uvC.bl[0] = u0;
  _uvC.bl[1] = vBot;
  _uvC.br[0] = u1;
  _uvC.br[1] = vBot;
  _uvC.tl[0] = u0;
  _uvC.tl[1] = vTop;
  _uvC.tr[0] = u1;
  _uvC.tr[1] = vTop;
  return _uvC;
}

/**
 * UV rectangle inside an atlas tile. row/col indices use TILE_CELLS (16) logical space like drawPixelArt.
 * Rows/cols are half-open: [rowTop, rowBot), [colLeft, colRight).
 */
function uvSubTileRect(tx, ty, rowTop, rowBot, colLeft, colRight) {
  const uTileL = (tx * TILE_PX) / ATLAS_SIZE;
  const vTileTop = 1 - (ty * TILE_PX) / ATLAS_SIZE;
  const tw = TILE_PX / ATLAS_SIZE;
  const th = TILE_PX / ATLAS_SIZE;
  const uL = uTileL + (colLeft / TILE_CELLS) * tw;
  const uR = uTileL + (colRight / TILE_CELLS) * tw;
  const vTop = vTileTop - (rowTop / TILE_CELLS) * th;
  const vBot = vTileTop - (rowBot / TILE_CELLS) * th;
  return {
    bl: [uL, vBot],
    br: [uR, vBot],
    tl: [uL, vTop],
    tr: [uR, vTop],
  };
}

/** Single diagonal split; AO only in vertex colors (stable winding). */
function pushQuad(
  positions,
  normals,
  uvs,
  indices,
  colors,
  nx,
  ny,
  nz,
  verts,
  uv4,
  ao4,
  waterDepthBuf,
  waterDepthVal,
  waterFlowBuf = null,
  waterFlowU = 0,
  waterFlowV = 0,
) {
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
  if (waterDepthBuf) {
    waterDepthBuf.push(waterDepthVal, waterDepthVal, waterDepthVal, waterDepthVal);
  }
  if (waterFlowBuf) {
    for (let i = 0; i < 4; i++) {
      waterFlowBuf.push(waterFlowU, waterFlowV);
    }
  }
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
}

/** Axis-aligned box with per-face UV rects (vanilla-style block model). */
function pushCuboid6Faces(x0, y0, z0, x1, y1, z1, faceUv, positions, normals, uvs, indices, colors, ao4) {
  const f = faceUv;
  const c = f.px;
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    1,
    0,
    0,
    [
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ],
    [c.bl, c.tl, c.tr, c.br],
    ao4,
    null,
    0,
  );
  const n = f.nx;
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    -1,
    0,
    0,
    [
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
      [x0, y0, z0],
    ],
    [n.br, n.tr, n.tl, n.bl],
    ao4,
    null,
    0,
  );
  const t = f.py;
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    0,
    1,
    0,
    [
      [x0, y1, z0],
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ],
    [t.bl, t.tl, t.tr, t.br],
    ao4,
    null,
    0,
  );
  const b = f.ny;
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    0,
    -1,
    0,
    [
      [x0, y0, z1],
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
    ],
    [b.bl, b.br, b.tr, b.tl],
    ao4,
    null,
    0,
  );
  const pz = f.pz;
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    0,
    0,
    1,
    [
      [x0, y0, z1],
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y0, z1],
    ],
    [pz.bl, pz.tl, pz.tr, pz.br],
    ao4,
    null,
    0,
  );
  const nz = f.nz;
  pushQuad(
    positions,
    normals,
    uvs,
    indices,
    colors,
    0,
    0,
    -1,
    [
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z0],
    ],
    [nz.br, nz.tr, nz.tl, nz.bl],
    ao4,
    null,
    0,
  );
}

/**
 * Placed torch: stem + flame oriented by TorchAttach (floor / wall / ceiling).
 */
function pushMinecraftTorch3d(
  attach,
  x,
  y,
  z,
  positions,
  normals,
  uvs,
  indices,
  colors,
  ttx,
  tty,
  flameRows,
  stickRows,
  flameCols,
  stickCols,
  ao4,
) {
  const [fr0, fr1] = flameRows;
  const [sr0, sr1] = stickRows;
  const [fl0, fl1] = flameCols;
  const [st0, st1] = stickCols;

  const cx = x + 0.5;
  const cz = z + 0.5;
  const stemHalf = (st1 - st0) / TILE_CELLS / 2;
  const flameHalf = (fl1 - fl0) / TILE_CELLS / 2;
  const cy = y + 5.5 / TILE_CELLS;

  const stemSide = uvSubTileRect(ttx, tty, sr0, sr1, st0, st1);
  const stemTop = uvSubTileRect(ttx, tty, sr0, sr0 + 1, st0, st1);
  const stemBot = uvSubTileRect(ttx, tty, sr1 - 1, sr1, st0, st1);

  const flameSide = uvSubTileRect(ttx, tty, fr0, fr1, fl0, fl1);
  const flameTop = uvSubTileRect(ttx, tty, fr0, fr0 + 1, fl0, fl1);
  const flameBot = uvSubTileRect(ttx, tty, fr1 - 1, fr1, fl0, fl1);

  const stemU = {
    px: stemSide,
    nx: stemSide,
    py: stemTop,
    ny: stemBot,
    pz: stemSide,
    nz: stemSide,
  };
  const flameU = {
    px: flameSide,
    nx: flameSide,
    py: flameTop,
    ny: flameBot,
    pz: flameSide,
    nz: flameSide,
  };

  if (attach === TorchAttach.CEILING) {
    const flameY0 = y + 2 / TILE_CELLS;
    const flameY1 = y + 7 / TILE_CELLS;
    const stemY0 = y + 7 / TILE_CELLS;
    const stemY1 = y + 15.5 / TILE_CELLS;
    pushCuboid6Faces(
      cx - flameHalf,
      flameY0,
      cz - flameHalf,
      cx + flameHalf,
      flameY1,
      cz + flameHalf,
      flameU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    pushCuboid6Faces(
      cx - stemHalf,
      stemY0,
      cz - stemHalf,
      cx + stemHalf,
      stemY1,
      cz + stemHalf,
      stemU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    return;
  }

  if (attach === TorchAttach.WALL_MX) {
    const sx0 = x + 1 / TILE_CELLS;
    const sx1 = x + 10 / TILE_CELLS;
    pushCuboid6Faces(
      sx0,
      cy - stemHalf,
      cz - stemHalf,
      sx1,
      cy + stemHalf,
      cz + stemHalf,
      stemU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    pushCuboid6Faces(
      x + 8 / TILE_CELLS,
      cy - flameHalf,
      cz - flameHalf,
      x + 15.5 / TILE_CELLS,
      cy + flameHalf,
      cz + flameHalf,
      flameU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    return;
  }

  if (attach === TorchAttach.WALL_PX) {
    const sx1 = x + 1 - 1 / TILE_CELLS;
    const sx0 = x + 1 - 10 / TILE_CELLS;
    pushCuboid6Faces(
      sx0,
      cy - stemHalf,
      cz - stemHalf,
      sx1,
      cy + stemHalf,
      cz + stemHalf,
      stemU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    pushCuboid6Faces(
      x + 1 - 15.5 / TILE_CELLS,
      cy - flameHalf,
      cz - flameHalf,
      x + 1 - 8 / TILE_CELLS,
      cy + flameHalf,
      cz + flameHalf,
      flameU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    return;
  }

  if (attach === TorchAttach.WALL_MZ) {
    const sz0 = z + 1 / TILE_CELLS;
    const sz1 = z + 10 / TILE_CELLS;
    pushCuboid6Faces(
      cx - stemHalf,
      cy - stemHalf,
      sz0,
      cx + stemHalf,
      cy + stemHalf,
      sz1,
      stemU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    pushCuboid6Faces(
      cx - flameHalf,
      cy - flameHalf,
      z + 8 / TILE_CELLS,
      cx + flameHalf,
      cy + flameHalf,
      z + 15.5 / TILE_CELLS,
      flameU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    return;
  }

  if (attach === TorchAttach.WALL_PZ) {
    const sz1 = z + 1 - 1 / TILE_CELLS;
    const sz0 = z + 1 - 10 / TILE_CELLS;
    pushCuboid6Faces(
      cx - stemHalf,
      cy - stemHalf,
      sz0,
      cx + stemHalf,
      cy + stemHalf,
      sz1,
      stemU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    pushCuboid6Faces(
      cx - flameHalf,
      cy - flameHalf,
      z + 1 - 15.5 / TILE_CELLS,
      cx + flameHalf,
      cy + flameHalf,
      z + 1 - 8 / TILE_CELLS,
      flameU,
      positions,
      normals,
      uvs,
      indices,
      colors,
      ao4,
    );
    return;
  }

  /* FLOOR (default) */
  const stemY0 = y + 1 / TILE_CELLS;
  const stemY1 = y + 10 / TILE_CELLS;
  pushCuboid6Faces(
    cx - stemHalf,
    stemY0,
    cz - stemHalf,
    cx + stemHalf,
    stemY1,
    cz + stemHalf,
    stemU,
    positions,
    normals,
    uvs,
    indices,
    colors,
    ao4,
  );
  pushCuboid6Faces(
    cx - flameHalf,
    y + 9 / TILE_CELLS,
    cz - flameHalf,
    cx + flameHalf,
    y + 15.5 / TILE_CELLS,
    cz + flameHalf,
    flameU,
    positions,
    normals,
    uvs,
    indices,
    colors,
    ao4,
  );
}

function shouldCull(voxels, x, y, z, nx, ny, nz, selfAlpha) {
  const n = voxels.get(x + nx, y + ny, z + nz);
  if (n === 0) return false;
  const def = blockDef(n);
  if (!def.solid) return false;
  if (selfAlpha && def.alpha) return true;
  if (!selfAlpha && !def.alpha) return true;
  return false;
}

function vertexAO(voxels, x, y, z, d1x, d1y, d1z, d2x, d2y, d2z) {
  const s1 = isSolid(voxels, x + d1x, y + d1y, z + d1z);
  const s2 = isSolid(voxels, x + d2x, y + d2y, z + d2z);
  const c = isSolid(voxels, x + d1x + d2x, y + d1y + d2y, z + d1z + d2z);
  if (s1 && s2) return 0.4;
  return 1.0 - (s1 + s2 + c) * 0.2;
}

function isSolid(voxels, x, y, z) {
  const id = voxels.get(x, y, z);
  if (id === 0) return 0;
  const d = blockDef(id);
  return d.solid && !d.alpha ? 1 : 0;
}

function buildGeoFromBuffers(positions, normals, uvs, indices, colors, waterDepths = null, waterFlows = null) {
  const geo = new THREE.BufferGeometry();
  if (positions.length === 0) {
    return geo;
  }
  const posArr = new Float32Array(positions);
  const normArr = new Float32Array(normals);
  const uvArr = new Float32Array(uvs);
  const colArr = new Float32Array(colors);
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const vertCount = posArr.length / 3;
  if (waterDepths && waterDepths.length === vertCount) {
    geo.setAttribute('waterDepth', new THREE.BufferAttribute(new Float32Array(waterDepths), 1));
  }
  if (waterFlows && waterFlows.length === vertCount * 2) {
    geo.setAttribute('waterFlow', new THREE.BufferAttribute(new Float32Array(waterFlows), 2));
  }
  if (indices.length <= 65535) {
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  } else {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  }
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Contiguous water column height (in blocks) from the surface downward maps to murk.
 * Lower = full effect in shallower lakes (visible on top faces when looking down).
 */
const WATER_DEPTH_NORMALIZE = 10;

/** @type {Float32Array | null} */
let _fluidCachePool = null;

/**
 * Per (x,z): number of vertically contiguous water blocks from the top water cell down.
 * 0 if no water. Same value for every water block in that column so top faces show depth.
 * @param {import('./world.js').World} world
 */
function buildFluidColumnDepthCache(snap, xa, xb, za, zb, h, fluidId) {
  const sz = (xb - xa) * (zb - za);
  let cache;
  if (_fluidCachePool && _fluidCachePool.length >= sz) {
    cache = _fluidCachePool;
    cache.fill(0, 0, sz);
  } else {
    cache = new Float32Array(sz);
    _fluidCachePool = cache.length >= sz ? cache : new Float32Array(Math.max(sz, 256));
  }
  let i = 0;
  for (let z = za; z < zb; z++) {
    for (let x = xa; x < xb; x++) {
      let topY = -1;
      for (let yy = h - 1; yy >= 0; yy--) {
        if (snap.get(x, yy, z) === fluidId) {
          topY = yy;
          break;
        }
      }
      if (topY < 0) {
        i++;
        continue;
      }
      let depth = 0;
      for (let yy = topY; yy >= 0 && snap.get(x, yy, z) === fluidId; yy--) {
        depth++;
      }
      cache[i++] = depth;
    }
  }
  return cache;
}

/** Murk 0–1 from contiguous water column height (same for top faces and deep blocks in that column). */
function normalizedWaterMurk(cache, xa, xb, za, x, z) {
  const d = cache[(z - za) * (xb - xa) + (x - xa)];
  const t = d / WATER_DEPTH_NORMALIZE;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * @param {import('./world.js').World} world
 * @param {number} x0 inclusive
 * @param {number} x1 exclusive
 * @param {number} z0 inclusive
 * @param {number} z1 exclusive
 */
export function buildRegionMesh(world, x0, x1, z0, z1) {
  const opaqueP = [],
    opaqueN = [],
    opaqueU = [],
    opaqueI = [],
    opaqueC = [];
  /** Cutout foliage / glass (alpha texture holes, not fluid blending). */
  const cutoutP = [],
    cutoutN = [],
    cutoutU = [],
    cutoutI = [],
    cutoutC = [];
  const waterP = [],
    waterN = [],
    waterU = [],
    waterI = [],
    waterC = [],
    waterW = [],
    waterFlow = [];
  const lavaP = [],
    lavaN = [],
    lavaU = [],
    lavaI = [],
    lavaC = [],
    lavaW = [];

  const h = world.height;
  const xa = x0;
  const xb = x1;
  const za = z0;
  const zb = z1;

  const cx = Math.floor(x0 / CHUNK_XZ);
  const cz = Math.floor(z0 / CHUNK_XZ);
  const snap = createChunkSnapshot(world, cx, cz);
  const yMax = snap.maxY;

  let waterColumnCache = null;
  let lavaColumnCache = null;

  for (let z = za; z < zb; z++) {
    for (let y = 0; y <= yMax; y++) {
      for (let x = xa; x < xb; x++) {
        const id = snap.get(x, y, z);
        if (id === 0) continue;
        if (id === BlockId.TORCH) {
          const td = BLOCKS[BlockId.TORCH];
          const rows = td.torchRows ?? { flame: [2, 7], stick: [7, 13] };
          const flameCols = td.torchCols ?? [5, 11];
          const stickCols = td.torchStickCols ?? [7, 9];
          const aoT = [1, 1, 1, 1];
          const attach = effectiveTorchAttach(world, x, y, z);
          pushMinecraftTorch3d(
            attach,
            x,
            y,
            z,
            cutoutP,
            cutoutN,
            cutoutU,
            cutoutI,
            cutoutC,
            td.side[0],
            td.side[1],
            rows.flame,
            rows.stick,
            flameCols,
            stickCols,
            aoT,
          );
          continue;
        }
        if (isDoorTopId(id)) {
          continue;
        }
        if (isDoorBottomId(id)) {
          const top = snap.get(x, y + 1, z);
          const hasTop = top === BlockId.DOOR_TOP || top === BlockId.DOOR_OPEN_TOP;
          const height = hasTop ? 2 : 1;
          const meta = world.getDoorMeta(x, y, z);
          const defD = blockDef(id);
          const ttx = defD.side[0];
          const tty = defD.side[1];
          pushMinecraftDoorPanels(
            world,
            x,
            y,
            z,
            id,
            meta,
            height,
            ttx,
            tty,
            opaqueP,
            opaqueN,
            opaqueU,
            opaqueI,
            opaqueC,
          );
          continue;
        }
        if (isTallGrassTopId(id)) {
          continue;
        }
        if (isTallGrassBottomId(id)) {
          const top = snap.get(x, y + 1, z);
          const hasTop = top === BlockId.TALL_GRASS_TOP;
          const height = hasTop ? 2 : 1;
          const gdef = blockDef(id);
          pushCrossPlant(
            x,
            y,
            z,
            height,
            gdef.side[0],
            gdef.side[1],
            cutoutP,
            cutoutN,
            cutoutU,
            cutoutI,
            cutoutC,
          );
          continue;
        }
        if (id === BlockId.SHORT_GRASS || blockDef(id).farmCrop) {
          const sg = blockDef(id);
          pushCrossPlant(
            x,
            y,
            z,
            0.5,
            sg.side[0],
            sg.side[1],
            cutoutP,
            cutoutN,
            cutoutU,
            cutoutI,
            cutoutC,
          );
          continue;
        }
        const def = blockDef(id);
        if (!def.solid) continue;

        const isAlpha = !!def.alpha;
        let positions;
        let normals;
        let uvs;
        let indices;
        let colors;
        let wBuf;
        if (!isAlpha) {
          positions = opaqueP;
          normals = opaqueN;
          uvs = opaqueU;
          indices = opaqueI;
          colors = opaqueC;
          wBuf = null;
        } else if (id === BlockId.WATER) {
          positions = waterP;
          normals = waterN;
          uvs = waterU;
          indices = waterI;
          colors = waterC;
          wBuf = waterW;
        } else if (id === BlockId.LAVA) {
          positions = lavaP;
          normals = lavaN;
          uvs = lavaU;
          indices = lavaI;
          colors = lavaC;
          wBuf = lavaW;
        } else if (def.fluid) {
          continue;
        } else {
          positions = cutoutP;
          normals = cutoutN;
          uvs = cutoutU;
          indices = cutoutI;
          colors = cutoutC;
          wBuf = null;
        }
        let wdep = 0;
        if (id === BlockId.WATER) {
          if (!waterColumnCache) waterColumnCache = buildFluidColumnDepthCache(snap, xa, xb, za, zb, h, BlockId.WATER);
          wdep = normalizedWaterMurk(waterColumnCache, xa, xb, za, x, z);
        } else if (id === BlockId.LAVA) {
          if (!lavaColumnCache) lavaColumnCache = buildFluidColumnDepthCache(snap, xa, xb, za, zb, h, BlockId.LAVA);
          wdep = normalizedWaterMurk(lavaColumnCache, xa, xb, za, x, z);
        }
        const fluidAbove =
          (id === BlockId.WATER || id === BlockId.LAVA) &&
          y + 1 < h &&
          snap.get(x, y + 1, z) === id;
        const yTopV = id === BlockId.LAVA && !fluidAbove ? y + 1 - WATER_TOP_INSET : y + 1;

        let c00 = yTopV;
        let c10 = yTopV;
        let c11 = yTopV;
        let c01 = yTopV;
        let wFlowBuf = null;
        let wfx = 0;
        let wfz = 0;
        if (id === BlockId.WATER) {
          c00 = waterCornerTopYSnap(world, snap, y, x, z);
          c10 = waterCornerTopYSnap(world, snap, y, x + 1, z);
          c11 = waterCornerTopYSnap(world, snap, y, x + 1, z + 1);
          c01 = waterCornerTopYSnap(world, snap, y, x, z + 1);
          const fd = waterFlowDirSnap(world, snap, x, y, z);
          wfx = fd.fx;
          wfz = fd.fz;
          wFlowBuf = waterFlow;
        }

        /* Edge top Ys match block corners: (x+1,z)=c10, (x+1,z+1)=c11, (x,z+1)=c01, (x,z)=c00 */
        const eXpZ = id === BlockId.WATER ? c10 : yTopV;
        const eXpZp = id === BlockId.WATER ? c11 : yTopV;
        const eXZp = id === BlockId.WATER ? c01 : yTopV;
        const eXZ = id === BlockId.WATER ? c00 : yTopV;

        if (!shouldCull(snap, x, y, z, 1, 0, 0, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const ax = x + 1;
          const a0 = vertexAO(snap, ax, y, z, 0, -1, 0, 0, 0, -1);
          const a1 = vertexAO(snap, ax, eXpZ, z, 0, 1, 0, 0, 0, -1);
          const a2 = vertexAO(snap, ax, eXpZp, z + 1, 0, 1, 0, 0, 0, 1);
          const a3 = vertexAO(snap, ax, y, z + 1, 0, -1, 0, 0, 0, 1);
          pushQuad(
            positions,
            normals,
            uvs,
            indices,
            colors,
            1,
            0,
            0,
            [
              [ax, y, z],
              [ax, eXpZ, z],
              [ax, eXpZp, z + 1],
              [ax, y, z + 1],
            ],
            [c.bl, c.tl, c.tr, c.br],
            [a0, a1, a2, a3],
            wBuf,
            wdep,
            wFlowBuf,
            wfx,
            wfz,
          );
        }
        if (!shouldCull(snap, x, y, z, -1, 0, 0, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const a0 = vertexAO(snap, x, y, z + 1, 0, -1, 0, 0, 0, 1);
          const a1 = vertexAO(snap, x, eXZp, z + 1, 0, 1, 0, 0, 0, 1);
          const a2 = vertexAO(snap, x, eXZ, z, 0, 1, 0, 0, 0, -1);
          const a3 = vertexAO(snap, x, y, z, 0, -1, 0, 0, 0, -1);
          pushQuad(
            positions,
            normals,
            uvs,
            indices,
            colors,
            -1,
            0,
            0,
            [
              [x, y, z + 1],
              [x, eXZp, z + 1],
              [x, eXZ, z],
              [x, y, z],
            ],
            [c.br, c.tr, c.tl, c.bl],
            [a0, a1, a2, a3],
            wBuf,
            wdep,
            wFlowBuf,
            wfx,
            wfz,
          );
        }
        if (!shouldCull(snap, x, y, z, 0, 1, 0, isAlpha)) {
          const c = uvCorners(def.top[0], def.top[1]);
          const a0 = vertexAO(snap, x, c00, z, -1, 0, 0, 0, 0, -1);
          const a1 = vertexAO(snap, x + 1, c10, z, 1, 0, 0, 0, 0, -1);
          const a2 = vertexAO(snap, x + 1, c11, z + 1, 1, 0, 0, 0, 0, 1);
          const a3 = vertexAO(snap, x, c01, z + 1, -1, 0, 0, 0, 0, 1);
          pushQuad(
            positions,
            normals,
            uvs,
            indices,
            colors,
            0,
            1,
            0,
            [
              [x, c00, z],
              [x, c01, z + 1],
              [x + 1, c11, z + 1],
              [x + 1, c10, z],
            ],
            [c.bl, c.tl, c.tr, c.br],
            [a0, a3, a2, a1],
            wBuf,
            wdep,
            wFlowBuf,
            wfx,
            wfz,
          );
        }
        if (!shouldCull(snap, x, y, z, 0, -1, 0, isAlpha)) {
          const c = uvCorners(def.bottom[0], def.bottom[1]);
          const a0 = vertexAO(snap, x, y, z, -1, 0, 0, 0, 0, -1);
          const a1 = vertexAO(snap, x + 1, y, z, 1, 0, 0, 0, 0, -1);
          const a2 = vertexAO(snap, x + 1, y, z + 1, 1, 0, 0, 0, 0, 1);
          const a3 = vertexAO(snap, x, y, z + 1, -1, 0, 0, 0, 0, 1);
          pushQuad(
            positions,
            normals,
            uvs,
            indices,
            colors,
            0,
            -1,
            0,
            [
              [x, y, z],
              [x + 1, y, z],
              [x + 1, y, z + 1],
              [x, y, z + 1],
            ],
            [c.bl, c.br, c.tr, c.tl],
            [a0, a1, a2, a3],
            wBuf,
            wdep,
            wFlowBuf,
            wfx,
            wfz,
          );
        }
        if (!shouldCull(snap, x, y, z, 0, 0, 1, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const az = z + 1;
          const a0 = vertexAO(snap, x + 1, y, az, 1, 0, 0, 0, -1, 0);
          const a1 = vertexAO(snap, x + 1, eXpZp, az, 1, 0, 0, 0, 1, 0);
          const a2 = vertexAO(snap, x, eXZp, az, -1, 0, 0, 0, 1, 0);
          const a3 = vertexAO(snap, x, y, az, -1, 0, 0, 0, -1, 0);
          pushQuad(
            positions,
            normals,
            uvs,
            indices,
            colors,
            0,
            0,
            1,
            [
              [x + 1, y, az],
              [x + 1, eXpZp, az],
              [x, eXZp, az],
              [x, y, az],
            ],
            [c.br, c.tr, c.tl, c.bl],
            [a0, a1, a2, a3],
            wBuf,
            wdep,
            wFlowBuf,
            wfx,
            wfz,
          );
        }
        if (!shouldCull(snap, x, y, z, 0, 0, -1, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const a0 = vertexAO(snap, x, y, z, -1, 0, 0, 0, -1, 0);
          const a1 = vertexAO(snap, x, eXZ, z, -1, 0, 0, 0, 1, 0);
          const a2 = vertexAO(snap, x + 1, eXpZ, z, 1, 0, 0, 0, 1, 0);
          const a3 = vertexAO(snap, x + 1, y, z, 1, 0, 0, 0, -1, 0);
          pushQuad(
            positions,
            normals,
            uvs,
            indices,
            colors,
            0,
            0,
            -1,
            [
              [x, y, z],
              [x, eXZ, z],
              [x + 1, eXpZ, z],
              [x + 1, y, z],
            ],
            [c.bl, c.tl, c.tr, c.br],
            [a0, a1, a2, a3],
            wBuf,
            wdep,
            wFlowBuf,
            wfx,
            wfz,
          );
        }
      }
    }
  }

  return {
    opaque: buildGeoFromBuffers(opaqueP, opaqueN, opaqueU, opaqueI, opaqueC),
    cutout: buildGeoFromBuffers(cutoutP, cutoutN, cutoutU, cutoutI, cutoutC),
    water: buildGeoFromBuffers(waterP, waterN, waterU, waterI, waterC, waterW, waterFlow),
    lava: buildGeoFromBuffers(lavaP, lavaN, lavaU, lavaI, lavaC, lavaW),
  };
}

