/**
 * Block-target outlines: neighbor-culled faces (like the mesher) and, for alpha-tested blocks,
 * edge lines along opaque/transparent boundaries in the atlas tile.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BlockId,
  BLOCKS,
  TILE_PX,
  isDoorBottomId,
  isDoorTopId,
  isTallGrassBottomId,
  isTallGrassTopId,
  isWheatCropId,
} from './blocktypes';
import { pushMinecraftDoorPanels } from './doorMesh';
import { TorchAttach, effectiveTorchAttach } from './torchAttach';

/** @type {HTMLCanvasElement | null} */
let _atlasScratch = null;

/**
 * @param {CanvasImageSource} atlasSource
 * @param {number} tx tile column
 * @param {number} ty tile row
 * @returns {ImageData | null}
 */
function readAtlasTile(atlasSource, tx, ty) {
  const tp = TILE_PX;
  let canvas;
  let ctx;
  if (atlasSource instanceof HTMLCanvasElement) {
    canvas = atlasSource;
    ctx = canvas.getContext('2d');
  } else {
    const w = atlasSource.width;
    const h = atlasSource.height;
    if (!(w > 0 && h > 0)) return null;
    if (!_atlasScratch || _atlasScratch.width !== w || _atlasScratch.height !== h) {
      _atlasScratch = document.createElement('canvas');
      _atlasScratch.width = w;
      _atlasScratch.height = h;
    }
    ctx = _atlasScratch.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(atlasSource, 0, 0);
    canvas = _atlasScratch;
  }
  if (!ctx) return null;
  const sx = tx * tp;
  const sy = ty * tp;
  if (sx + tp > canvas.width || sy + tp > canvas.height) return null;
  try {
    return ctx.getImageData(sx, sy, tp, tp);
  } catch {
    return null;
  }
}

/**
 * Same face-culling rule as {@link mesher.js} `shouldCull`.
 * @param {import('./world.js').World} world
 */
function shouldCullFace(world, x, y, z, nx, ny, nz, selfAlpha) {
  const n = world.get(x + nx, y + ny, z + nz);
  if (n === 0) return false;
  const def = BLOCKS[n];
  if (!def.solid) return false;
  if (selfAlpha && def.alpha) return true;
  if (!selfAlpha && !def.alpha) return true;
  return false;
}

/**
 * @param {(u: number, v: number) => number[]} W world xyz from tile UV in [0,1]²
 * @param {number[]} positions
 */
function pushRectOutline(W, positions) {
  const c = [
    W(0, 0),
    W(1, 0),
    W(1, 1),
    W(0, 1),
  ];
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
}

/**
 * Opaque vs transparent transitions on the tile grid → line segments in world space.
 * @param {(u: number, v: number) => number[]} W
 */
function pushAlphaSilhouetteOnTile(imageData, tilePx, W, positions) {
  const d = imageData.data;
  const o = (ix, iy) => d[(iy * tilePx + ix) * 4 + 3] > 127;

  let any = false;
  for (let iy = 0; iy < tilePx; iy++) {
    for (let ix = 0; ix < tilePx; ix++) {
      if (o(ix, iy)) any = true;
    }
  }
  if (!any) {
    pushRectOutline(W, positions);
    return;
  }

  for (let iy = 0; iy <= tilePx; iy++) {
    for (let ix = 0; ix < tilePx; ix++) {
      const down = iy < tilePx && o(ix, iy);
      const up = iy > 0 && o(ix, iy - 1);
      if (down !== up) {
        const v = 1 - iy / tilePx;
        const u0 = ix / tilePx;
        const u1 = (ix + 1) / tilePx;
        const a = W(u0, v);
        const b = W(u1, v);
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
  }

  for (let ix = 0; ix <= tilePx; ix++) {
    for (let iy = 0; iy < tilePx; iy++) {
      const left = ix > 0 && o(ix - 1, iy);
      const right = ix < tilePx && o(ix, iy);
      if (left !== right) {
        const u = ix / tilePx;
        const v0 = 1 - iy / tilePx;
        const v1 = 1 - (iy + 1) / tilePx;
        const a = W(u, v0);
        const b = W(u, v1);
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
  }
}

/** Face UV → world; matches {@link mesher.js} quad vertex / UV layout. */
const FACE_UV_WORLD = {
  /** +X */
  px: (bx, by, bz, u, v) => [bx + 1, by + v, bz + u],
  /** −X */
  nx: (bx, by, bz, u, v) => [bx, by + v, bz + 1 - u],
  /** +Y top */
  py: (bx, by, bz, u, v) => [bx + u, by + 1, bz + v],
  /** −Y bottom */
  ny: (bx, by, bz, u, v) => [bx + u, by, bz + v],
  /** +Z */
  pz: (bx, by, bz, u, v) => [bx + 1 - u, by + v, bz + 1],
  /** −Z */
  nz: (bx, by, bz, u, v) => [bx + u, by + v, bz],
};

/**
 * @param {import('./world.js').World} world
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {number} blockId
 * @param {CanvasImageSource | null | undefined} atlasSource
 */
function buildExposedCubeOutline(world, bx, by, bz, blockId, atlasSource) {
  const def = BLOCKS[blockId];
  const selfAlpha = !!def.alpha;
  /** @type {number[]} */
  const positions = [];

  const faces = [
    { key: 'px', nx: 1, ny: 0, nz: 0, tile: def.side },
    { key: 'nx', nx: -1, ny: 0, nz: 0, tile: def.side },
    { key: 'py', nx: 0, ny: 1, nz: 0, tile: def.top },
    { key: 'ny', nx: 0, ny: -1, nz: 0, tile: def.bottom },
    { key: 'pz', nx: 0, ny: 0, nz: 1, tile: def.side },
    { key: 'nz', nx: 0, ny: 0, nz: -1, tile: def.side },
  ];

  for (const f of faces) {
    if (shouldCullFace(world, bx, by, bz, f.nx, f.ny, f.nz, selfAlpha)) continue;
    const fk = /** @type {'px'|'nx'|'py'|'ny'|'pz'|'nz'} */ (f.key);
    const W = (u, v) => FACE_UV_WORLD[fk](bx, by, bz, u, v);
    if (selfAlpha && atlasSource) {
      const img = readAtlasTile(atlasSource, f.tile[0], f.tile[1]);
      if (img) pushAlphaSilhouetteOnTile(img, TILE_PX, W, positions);
      else pushRectOutline(W, positions);
    } else {
      pushRectOutline(W, positions);
    }
  }

  return positions;
}

/**
 * @param {number[]} positions
 * @param {number} [ox] block origin when falling back to a full-cell box (all faces culled)
 */
function positionsToLineGeometry(positions, ox = 0, oy = 0, oz = 0) {
  if (positions.length < 6) {
    const g = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    g.translate(ox + 0.5, oy + 0.5, oz + 0.5);
    const e = new THREE.EdgesGeometry(g, 30);
    g.dispose();
    return e;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
  return geo;
}

/**
 * Bilinear world position on a grass/cross quad: u,v ∈ [0,1] with corners A,D,C,B order
 * (1-u)(1-v)A + u(1-v)D + uv*C + (1-u)v*B
 */
function worldBilinearQuad(u, v, A, D, C, B) {
  const x =
    (1 - u) * (1 - v) * A[0] + u * (1 - v) * D[0] + u * v * C[0] + (1 - u) * v * B[0];
  const y =
    (1 - u) * (1 - v) * A[1] + u * (1 - v) * D[1] + u * v * C[1] + (1 - u) * v * B[1];
  const z =
    (1 - u) * (1 - v) * A[2] + u * (1 - v) * D[2] + u * v * C[2] + (1 - u) * v * B[2];
  return [x, y, z];
}

/**
 * Cross-plant quads with texture silhouette (side tile), matching plantMesh layout.
 */
function buildCrossPlantTextureOutline(bx, by, bz, heightBlocks, atlasSource, tileTx, tileTy) {
  const e = 0.02;
  const y0 = by;
  const y1 = by + heightBlocks;
  const A1 = [bx + e, y0, bz + e];
  const B1 = [bx + e, y1, bz + e];
  const C1 = [bx + 1 - e, y1, bz + 1 - e];
  const D1 = [bx + 1 - e, y0, bz + 1 - e];
  const A2 = [bx + e, y0, bz + 1 - e];
  const B2 = [bx + e, y1, bz + 1 - e];
  const C2 = [bx + 1 - e, y1, bz + e];
  const D2 = [bx + 1 - e, y0, bz + e];
  const img = atlasSource ? readAtlasTile(atlasSource, tileTx, tileTy) : null;
  /** @type {number[]} */
  const positions = [];
  const W1 = (u, v) => worldBilinearQuad(u, v, A1, D1, C1, B1);
  const W2 = (u, v) => worldBilinearQuad(u, v, A2, D2, C2, B2);
  if (img) {
    pushAlphaSilhouetteOnTile(img, TILE_PX, W1, positions);
    pushAlphaSilhouetteOnTile(img, TILE_PX, W2, positions);
  } else {
    pushRectOutline(W1, positions);
    pushRectOutline(W2, positions);
  }
  return positionsToLineGeometry(positions, 0, 0, 0);
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} az
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 */
function boxGeom(ax, ay, az, bx, by, bz) {
  const g = new THREE.BoxGeometry(bx - ax, by - ay, bz - az);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

/**
 * @param {import('./world.js').World} world
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function torchOutlineParts(world, x, y, z) {
  const td = BLOCKS[BlockId.TORCH];
  const flameCols = td.torchCols ?? [5, 11];
  const stickCols = td.torchStickCols ?? [7, 9];
  const attach = effectiveTorchAttach(world, x, y, z);
  const [fl0, fl1] = flameCols;
  const [st0, st1] = stickCols;

  const cx = x + 0.5;
  const cz = z + 0.5;
  const stemHalf = (st1 - st0) / TILE_PX / 2;
  const flameHalf = (fl1 - fl0) / TILE_PX / 2;
  const cy = y + 5.5 / TILE_PX;

  /** @type {THREE.BufferGeometry[]} */
  const parts = [];

  if (attach === TorchAttach.CEILING) {
    const flameY0 = y + 2 / TILE_PX;
    const flameY1 = y + 7 / TILE_PX;
    const stemY0 = y + 7 / TILE_PX;
    const stemY1 = y + 15.5 / TILE_PX;
    parts.push(
      boxGeom(cx - flameHalf, flameY0, cz - flameHalf, cx + flameHalf, flameY1, cz + flameHalf),
    );
    parts.push(
      boxGeom(cx - stemHalf, stemY0, cz - stemHalf, cx + stemHalf, stemY1, cz + stemHalf),
    );
    return parts;
  }

  if (attach === TorchAttach.WALL_MX) {
    const sx0 = x + 1 / TILE_PX;
    const sx1 = x + 10 / TILE_PX;
    parts.push(
      boxGeom(sx0, cy - stemHalf, cz - stemHalf, sx1, cy + stemHalf, cz + stemHalf),
    );
    parts.push(
      boxGeom(
        x + 8 / TILE_PX,
        cy - flameHalf,
        cz - flameHalf,
        x + 15.5 / TILE_PX,
        cy + flameHalf,
        cz + flameHalf,
      ),
    );
    return parts;
  }

  if (attach === TorchAttach.WALL_PX) {
    const sx1 = x + 1 - 1 / TILE_PX;
    const sx0 = x + 1 - 10 / TILE_PX;
    parts.push(
      boxGeom(sx0, cy - stemHalf, cz - stemHalf, sx1, cy + stemHalf, cz + stemHalf),
    );
    parts.push(
      boxGeom(
        x + 1 - 15.5 / TILE_PX,
        cy - flameHalf,
        cz - flameHalf,
        x + 1 - 8 / TILE_PX,
        cy + flameHalf,
        cz + flameHalf,
      ),
    );
    return parts;
  }

  if (attach === TorchAttach.WALL_MZ) {
    const sz0 = z + 1 / TILE_PX;
    const sz1 = z + 10 / TILE_PX;
    parts.push(
      boxGeom(cx - stemHalf, cy - stemHalf, sz0, cx + stemHalf, cy + stemHalf, sz1),
    );
    parts.push(
      boxGeom(
        cx - flameHalf,
        cy - flameHalf,
        z + 8 / TILE_PX,
        cx + flameHalf,
        cy + flameHalf,
        z + 15.5 / TILE_PX,
      ),
    );
    return parts;
  }

  if (attach === TorchAttach.WALL_PZ) {
    const sz1 = z + 1 - 1 / TILE_PX;
    const sz0 = z + 1 - 10 / TILE_PX;
    parts.push(
      boxGeom(cx - stemHalf, cy - stemHalf, sz0, cx + stemHalf, cy + stemHalf, sz1),
    );
    parts.push(
      boxGeom(
        cx - flameHalf,
        cy - flameHalf,
        z + 1 - 15.5 / TILE_PX,
        cx + flameHalf,
        cy + flameHalf,
        z + 1 - 8 / TILE_PX,
      ),
    );
    return parts;
  }

  const stemY0 = y + 1 / TILE_PX;
  const stemY1 = y + 10 / TILE_PX;
  parts.push(
    boxGeom(cx - stemHalf, stemY0, cz - stemHalf, cx + stemHalf, stemY1, cz + stemHalf),
  );
  parts.push(
    boxGeom(
      cx - flameHalf,
      y + 9 / TILE_PX,
      cz - flameHalf,
      cx + flameHalf,
      y + 15.5 / TILE_PX,
      cz + flameHalf,
    ),
  );
  return parts;
}

function edgesFromGeometry(geo, thresholdAngle) {
  const e = new THREE.EdgesGeometry(geo, thresholdAngle);
  geo.dispose();
  return e;
}

function fallbackBoxEdges(x, y, z) {
  const g = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  g.translate(x + 0.5, y + 0.5, z + 0.5);
  return edgesFromGeometry(g, 30);
}

/**
 * @param {import('./world.js').World} world
 * @param {number} hx
 * @param {number} hy
 * @param {number} hz
 * @param {number} blockId
 * @param {CanvasImageSource | null | undefined} [atlasSource]
 * @returns {THREE.BufferGeometry}
 */
export function buildSelectionOutlineGeometry(world, hx, hy, hz, blockId, atlasSource) {
  if (!blockId || !BLOCKS[blockId]) {
    return fallbackBoxEdges(hx, hy, hz);
  }

  if (blockId === BlockId.TORCH) {
    const parts = torchOutlineParts(world, hx, hy, hz);
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) return fallbackBoxEdges(hx, hy, hz);
    return edgesFromGeometry(merged, 28);
  }

  let bx = hx;
  let by = hy;
  let bz = hz;
  let id = blockId;

  if (isDoorTopId(blockId)) {
    by = hy - 1;
    id = world.get(bx, by, bz);
    if (!isDoorBottomId(id)) {
      return fallbackBoxEdges(hx, hy, hz);
    }
  }

  if (isDoorBottomId(id)) {
    const top = world.get(bx, by + 1, bz);
    const hasTop = top === BlockId.DOOR_TOP || top === BlockId.DOOR_OPEN_TOP;
    const height = hasTop ? 2 : 1;
    const meta = world.getDoorMeta(bx, by, bz);
    const defD = BLOCKS[id];
    const p = [];
    const n = [];
    const u = [];
    const idx = [];
    const c = [];
    pushMinecraftDoorPanels(
      world,
      bx,
      by,
      bz,
      id,
      meta,
      height,
      defD.side[0],
      defD.side[1],
      p,
      n,
      u,
      idx,
      c,
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setIndex(idx);
    return edgesFromGeometry(geo, 38);
  }

  if (isTallGrassTopId(blockId)) {
    by = hy - 1;
    id = world.get(bx, by, bz);
    if (!isTallGrassBottomId(id)) {
      return fallbackBoxEdges(hx, hy, hz);
    }
  }

  if (isTallGrassBottomId(id)) {
    const top = world.get(bx, by + 1, bz);
    const hasTop = top === BlockId.TALL_GRASS_TOP;
    const height = hasTop ? 2 : 1;
    const gdef = BLOCKS[id];
    return buildCrossPlantTextureOutline(bx, by, bz, height, atlasSource, gdef.side[0], gdef.side[1]);
  }

  if (id === BlockId.SHORT_GRASS) {
    const sg = BLOCKS[id];
    return buildCrossPlantTextureOutline(bx, by, bz, 0.5, atlasSource, sg.side[0], sg.side[1]);
  }

  if (isWheatCropId(id)) {
    const wdef = BLOCKS[id];
    return buildCrossPlantTextureOutline(bx, by, bz, 0.5, atlasSource, wdef.side[0], wdef.side[1]);
  }

  const def = BLOCKS[id];
  if (def?.solid && !def?.fluid) {
    const pos = buildExposedCubeOutline(world, bx, by, bz, id, atlasSource);
    return positionsToLineGeometry(pos, bx, by, bz);
  }

  return fallbackBoxEdges(hx, hy, hz);
}
