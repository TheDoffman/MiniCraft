import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function hash01(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

const CLOUD_Y = 168;
const CELL = 4;
const THICK = 0.42;
/** Half-extent of cloud field in cells (world span ≈ 2 * R * CELL). */
const GRID_R = 28;

/**
 * Single-axis-aligned slab with solid white top, gray sides, darker gray bottom (Minecraft-style).
 */
function makeCloudSlabGeometry(width, height, depth) {
  const g = new THREE.BoxGeometry(width, height, depth);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  const top = new THREE.Color(0xffffff);
  const side = new THREE.Color(0xc4c8d0);
  const bottom = new THREE.Color(0xa8adb8);

  for (let i = 0; i < pos.count; i++) {
    const ny = nrm[i * 3 + 1];
    const c = ny > 0.65 ? top : ny < -0.65 ? bottom : side;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Min Chebyshev distance from any new grid cell to existing cloud cells (keeps gaps between shapes).
 */
const MIN_CELL_GAP = 3;

const tryKey = (ix, iz) => `${ix},${iz}`;

function parseKey(key) {
  const i = key.indexOf(',');
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
}

function cellClearOfTaken(ax, az, taken, minGap) {
  for (const key of taken) {
    const [tx, tz] = parseKey(key);
    if (Math.max(Math.abs(ax - tx), Math.abs(az - tz)) < minGap) {
      return false;
    }
  }
  return true;
}

/** Rotated priority so anchors don’t all pick the same size first. */
function shapeTryOrder(ix, iz) {
  const base = [
    [3, 3],
    [3, 2],
    [2, 3],
    [3, 1],
    [1, 3],
    [2, 2],
    [2, 1],
    [1, 2],
    [1, 1],
  ];
  const n = base.length;
  const rot = Math.floor(hash01(ix, iz, 820) * n);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(base[(rot + i) % n]);
  }
  return out;
}

function patternFits(ix, iz, w, d, taken, minGap) {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const cx = ix + dx;
      const cz = iz + dz;
      if (cx < -GRID_R || cx >= GRID_R || cz < -GRID_R || cz >= GRID_R) {
        return false;
      }
      if (taken.has(tryKey(cx, cz))) return false;
      if (!cellClearOfTaken(cx, cz, taken, minGap)) return false;
    }
  }
  return true;
}

function markPattern(ix, iz, w, d, taken) {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      taken.add(tryKey(ix + dx, iz + dz));
    }
  }
}

/**
 * Thin voxel slabs with varied footprints (1×1 … 3×3 and bars); spacing keeps them readable.
 */
function buildMergedCloudGeometry() {
  const pieces = [];
  const taken = new Set();

  for (let iz = -GRID_R; iz < GRID_R; iz++) {
    for (let ix = -GRID_R; ix < GRID_R; ix++) {
      if (taken.has(tryKey(ix, iz))) continue;
      if (hash01(ix, iz, 701) < 0.82) continue;

      const order = shapeTryOrder(ix, iz);
      let placed = false;
      for (const [cw, cd] of order) {
        if (!patternFits(ix, iz, cw, cd, taken, MIN_CELL_GAP)) continue;

        const gw = cw * CELL;
        const gd = cd * CELL;
        const geom = makeCloudSlabGeometry(gw, THICK, gd);
        const m = new THREE.Matrix4();
        m.makeTranslation(
          ix * CELL + gw / 2,
          THICK / 2,
          iz * CELL + gd / 2,
        );
        geom.applyMatrix4(m);
        pieces.push(geom);
        markPattern(ix, iz, cw, cd, taken);
        placed = true;
        break;
      }
      if (!placed) {
        /* no shape fit at this anchor; leave empty */
      }
    }
  }

  if (pieces.length === 0) {
    const g = makeCloudSlabGeometry(CELL * 2, THICK, CELL * 2);
    g.applyMatrix4(
      new THREE.Matrix4().makeTranslation(0, THICK / 2, 0),
    );
    return g;
  }

  const merged = mergeGeometries(pieces, false);
  for (const p of pieces) {
    p.dispose();
  }
  return merged;
}

/**
 * @returns {{ group: THREE.Group, mesh: THREE.Mesh, material: THREE.MeshBasicMaterial }}
 */
export function createCloudLayer() {
  const geometry = buildMergedCloudGeometry();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -7;
  mesh.name = 'cloudVoxels';
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const group = new THREE.Group();
  group.name = 'cloudLayer';
  group.add(mesh);

  return { group, mesh, material };
}

/**
 * @param {{ group: THREE.Group, mesh: THREE.Mesh, material: THREE.MeshBasicMaterial }} refs
 * @param {number} dt
 * @param {number} dayF 0–1 daylight factor
 * @param {number} nightF 0–1 night factor
 * @param {number} [weatherDarken] 0–1 storm greying of clouds
 */
export function tickCloudLayer(refs, dt, dayF, nightF, weatherDarken = 0) {
  const { group, material } = refs;

  const day = THREE.MathUtils.clamp(dayF, 0, 1);
  const night = THREE.MathUtils.clamp(nightF, 0, 1);
  const wd = THREE.MathUtils.clamp(weatherDarken, 0, 1);
  const lum = 0.42 + day * 0.58;
  const nb = night * 0.42;
  const storm = 1 - wd * 0.62;
  material.color.r = lum * (1 - nb * 0.32) * storm;
  material.color.g = lum * (1 - nb * 0.22) * storm;
  material.color.b = Math.min(1, lum * (0.94 + day * 0.1 + nb * 0.26)) * (storm * 0.92 + 0.08);

  material.opacity = 0.5 + day * 0.48 + night * 0.06 + wd * 0.12;
  group.visible = material.opacity > 0.1;

  /** Westward drift (blocks/s), slow like overworld clouds. */
  const drift = dt * 0.55;
  group.userData.driftX = (group.userData.driftX ?? 0) - drift;
  const wrap = CELL * GRID_R * 2;
  if (group.userData.driftX < -wrap) group.userData.driftX += wrap;
}

/**
 * @param {{ group: THREE.Group }} refs
 * @param {THREE.Camera} camera
 */
export function syncCloudLayerPosition(refs, camera) {
  const dx = refs.group.userData.driftX ?? 0;
  refs.group.position.set(camera.position.x + dx, CLOUD_Y, camera.position.z);
}

/**
 * @param {{ mesh: THREE.Mesh, material: THREE.MeshBasicMaterial }} refs
 */
export function disposeCloudLayer(refs) {
  refs.mesh.geometry.dispose();
  refs.material.dispose();
}
