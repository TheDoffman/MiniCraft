import * as THREE from 'three';
import {
  BLOCKS,
  BlockId,
  TILE_PX,
  TILE_CELLS,
  ATLAS_TILES,
  isDoorBottomId,
  isDoorTopId,
  isTallGrassBottomId,
  isTallGrassTopId,
} from './blocktypes.js';
import { pushMinecraftDoorPanels } from './doorMesh.js';
import { pushCrossPlant } from './plantMesh.js';
import { TorchAttach, effectiveTorchAttach } from './torchAttach.js';

const ATLAS_SIZE = ATLAS_TILES * TILE_PX;
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

function shouldCull(world, x, y, z, nx, ny, nz, selfAlpha) {
  const n = world.get(x + nx, y + ny, z + nz);
  if (n === 0) return false;
  const def = BLOCKS[n];
  if (!def.solid) return false;
  if (selfAlpha && def.alpha) return true;
  if (!selfAlpha && !def.alpha) return true;
  return false;
}

function vertexAO(world, x, y, z, d1x, d1y, d1z, d2x, d2y, d2z) {
  const s1 = isSolid(world, x + d1x, y + d1y, z + d1z);
  const s2 = isSolid(world, x + d2x, y + d2y, z + d2z);
  const c = isSolid(world, x + d1x + d2x, y + d1y + d2y, z + d1z + d2z);
  if (s1 && s2) return 0.4;
  return 1.0 - (s1 + s2 + c) * 0.2;
}

function isSolid(world, x, y, z) {
  const id = world.get(x, y, z);
  if (id === 0) return 0;
  return BLOCKS[id].solid && !BLOCKS[id].alpha ? 1 : 0;
}

function buildGeoFromBuffers(positions, normals, uvs, indices, colors, waterDepths = null, waterFlows = null) {
  const geo = new THREE.BufferGeometry();
  if (positions.length === 0) {
    return geo;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (waterDepths && waterDepths.length === positions.length / 3) {
    geo.setAttribute('waterDepth', new THREE.Float32BufferAttribute(waterDepths, 1));
  }
  if (waterFlows && waterFlows.length === (positions.length / 3) * 2) {
    geo.setAttribute('waterFlow', new THREE.Float32BufferAttribute(waterFlows, 2));
  }
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Contiguous water column height (in blocks) from the surface downward maps to murk.
 * Lower = full effect in shallower lakes (visible on top faces when looking down).
 */
const WATER_DEPTH_NORMALIZE = 10;

/**
 * Per (x,z): number of vertically contiguous water blocks from the top water cell down.
 * 0 if no water. Same value for every water block in that column so top faces show depth.
 * @param {import('./world.js').World} world
 */
function buildFluidColumnDepthCache(world, xa, xb, za, zb, h, fluidId) {
  const cw = xb - xa;
  const cache = new Float32Array(cw * (zb - za));
  let i = 0;
  for (let z = za; z < zb; z++) {
    for (let x = xa; x < xb; x++) {
      let topY = -1;
      for (let yy = h - 1; yy >= 0; yy--) {
        if (world.get(x, yy, z) === fluidId) {
          topY = yy;
          break;
        }
      }
      if (topY < 0) {
        cache[i++] = 0;
        continue;
      }
      let depth = 0;
      for (let yy = topY; yy >= 0 && world.get(x, yy, z) === fluidId; yy--) {
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

  const waterColumnCache = buildFluidColumnDepthCache(world, xa, xb, za, zb, h, BlockId.WATER);
  const lavaColumnCache = buildFluidColumnDepthCache(world, xa, xb, za, zb, h, BlockId.LAVA);

  for (let z = za; z < zb; z++) {
    for (let y = 0; y < h; y++) {
      for (let x = xa; x < xb; x++) {
        const id = world.get(x, y, z);
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
          const top = world.get(x, y + 1, z);
          const hasTop = top === BlockId.DOOR_TOP || top === BlockId.DOOR_OPEN_TOP;
          const height = hasTop ? 2 : 1;
          const meta = world.getDoorMeta(x, y, z);
          const defD = BLOCKS[id];
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
          const top = world.get(x, y + 1, z);
          const hasTop = top === BlockId.TALL_GRASS_TOP;
          const height = hasTop ? 2 : 1;
          const gdef = BLOCKS[id];
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
        if (id === BlockId.SHORT_GRASS) {
          const sg = BLOCKS[id];
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
        const def = BLOCKS[id];
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
        const wdep =
          id === BlockId.WATER
            ? normalizedWaterMurk(waterColumnCache, xa, xb, za, x, z)
            : id === BlockId.LAVA
              ? normalizedWaterMurk(lavaColumnCache, xa, xb, za, x, z)
              : 0;
        const fluidAbove =
          (id === BlockId.WATER || id === BlockId.LAVA) &&
          world.inBounds(x, y + 1, z) &&
          world.get(x, y + 1, z) === id;
        const yTopV = id === BlockId.LAVA && !fluidAbove ? y + 1 - WATER_TOP_INSET : y + 1;

        let c00 = yTopV;
        let c10 = yTopV;
        let c11 = yTopV;
        let c01 = yTopV;
        let wFlowBuf = null;
        let wfx = 0;
        let wfz = 0;
        if (id === BlockId.WATER) {
          c00 = waterCornerTopY(world, y, x, z);
          c10 = waterCornerTopY(world, y, x + 1, z);
          c11 = waterCornerTopY(world, y, x + 1, z + 1);
          c01 = waterCornerTopY(world, y, x, z + 1);
          const fd = waterFlowDir(world, x, y, z);
          wfx = fd.fx;
          wfz = fd.fz;
          wFlowBuf = waterFlow;
        }

        const tpx = x + 1;
        const tpz = z + 1;
        const eXpZ =
          id === BlockId.WATER ? waterCornerTopY(world, y, tpx, z) : yTopV;
        const eXpZp =
          id === BlockId.WATER ? waterCornerTopY(world, y, tpx, tpz) : yTopV;
        const eXZp =
          id === BlockId.WATER ? waterCornerTopY(world, y, x, tpz) : yTopV;
        const eXZ = id === BlockId.WATER ? waterCornerTopY(world, y, x, z) : yTopV;

        if (!shouldCull(world, x, y, z, 1, 0, 0, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const ax = x + 1;
          const a0 = vertexAO(world, ax, y, z, 0, -1, 0, 0, 0, -1);
          const a1 = vertexAO(world, ax, eXpZ, z, 0, 1, 0, 0, 0, -1);
          const a2 = vertexAO(world, ax, eXpZp, z + 1, 0, 1, 0, 0, 0, 1);
          const a3 = vertexAO(world, ax, y, z + 1, 0, -1, 0, 0, 0, 1);
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
        if (!shouldCull(world, x, y, z, -1, 0, 0, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const a0 = vertexAO(world, x, y, z + 1, 0, -1, 0, 0, 0, 1);
          const a1 = vertexAO(world, x, eXZp, z + 1, 0, 1, 0, 0, 0, 1);
          const a2 = vertexAO(world, x, eXZ, z, 0, 1, 0, 0, 0, -1);
          const a3 = vertexAO(world, x, y, z, 0, -1, 0, 0, 0, -1);
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
        if (!shouldCull(world, x, y, z, 0, 1, 0, isAlpha)) {
          const c = uvCorners(def.top[0], def.top[1]);
          const a0 = vertexAO(world, x, c00, z, -1, 0, 0, 0, 0, -1);
          const a1 = vertexAO(world, x + 1, c10, z, 1, 0, 0, 0, 0, -1);
          const a2 = vertexAO(world, x + 1, c11, z + 1, 1, 0, 0, 0, 0, 1);
          const a3 = vertexAO(world, x, c01, z + 1, -1, 0, 0, 0, 0, 1);
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
        if (!shouldCull(world, x, y, z, 0, -1, 0, isAlpha)) {
          const c = uvCorners(def.bottom[0], def.bottom[1]);
          const a0 = vertexAO(world, x, y, z, -1, 0, 0, 0, 0, -1);
          const a1 = vertexAO(world, x + 1, y, z, 1, 0, 0, 0, 0, -1);
          const a2 = vertexAO(world, x + 1, y, z + 1, 1, 0, 0, 0, 0, 1);
          const a3 = vertexAO(world, x, y, z + 1, -1, 0, 0, 0, 0, 1);
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
        if (!shouldCull(world, x, y, z, 0, 0, 1, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const az = z + 1;
          const a0 = vertexAO(world, x + 1, y, az, 1, 0, 0, 0, -1, 0);
          const a1 = vertexAO(world, x + 1, eXpZp, az, 1, 0, 0, 0, 1, 0);
          const a2 = vertexAO(world, x, eXZp, az, -1, 0, 0, 0, 1, 0);
          const a3 = vertexAO(world, x, y, az, -1, 0, 0, 0, -1, 0);
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
        if (!shouldCull(world, x, y, z, 0, 0, -1, isAlpha)) {
          const c = uvCorners(def.side[0], def.side[1]);
          const a0 = vertexAO(world, x, y, z, -1, 0, 0, 0, -1, 0);
          const a1 = vertexAO(world, x, eXZ, z, -1, 0, 0, 0, 1, 0);
          const a2 = vertexAO(world, x + 1, eXpZ, z, 1, 0, 0, 0, 1, 0);
          const a3 = vertexAO(world, x + 1, y, z, 1, 0, 0, 0, -1, 0);
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

