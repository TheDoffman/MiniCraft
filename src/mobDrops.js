import * as THREE from 'three';
import { addItemToInventory } from './inventory.js';
import { BLOCKS, ATLAS_COLS, ATLAS_TILES, BlockId } from './blocktypes.js';
import { TorchAttach, torchSupportDeltaToAttach, isTorchSupportBlock } from './torchAttach.js';

const NEIGHBOR_DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 * @param {number} attach TorchAttach
 */
function meatSnapWorldPoint(tx, ty, tz, attach) {
  const cx = tx + 0.5;
  const cz = tz + 0.5;
  switch (attach) {
    case TorchAttach.CEILING:
      return { x: cx, y: ty + 0.86, z: cz };
    case TorchAttach.WALL_MX:
      return { x: tx + 0.26, y: ty + 0.34, z: cz };
    case TorchAttach.WALL_PX:
      return { x: tx + 0.74, y: ty + 0.34, z: cz };
    case TorchAttach.WALL_MZ:
      return { x: cx, y: ty + 0.34, z: tz + 0.26 };
    case TorchAttach.WALL_PZ:
      return { x: cx, y: ty + 0.34, z: tz + 0.74 };
    case TorchAttach.FLOOR:
    default:
      return { x: cx, y: ty + 0.1, z: cz };
  }
}

/**
 * Nearest air cell next to a solid (torch-style) to the mob position; picks closest snap point.
 * @param {import('./world.js').World} world
 * @returns {{ x: number, y: number, z: number, attach: number } | null}
 */
export function findMeatDropPlacement(world, ox, oy, oz) {
  let best = null;
  let bestDistSq = Infinity;
  const ix = Math.floor(ox);
  const iy = Math.floor(oy);
  const iz = Math.floor(oz);
  for (let dxi = -1; dxi <= 1; dxi++) {
    for (let dyi = -1; dyi <= 1; dyi++) {
      for (let dzi = -1; dzi <= 1; dzi++) {
        const tx = ix + dxi;
        const ty = iy + dyi;
        const tz = iz + dzi;
        if (!world.inBounds(tx, ty, tz)) continue;
        if (world.get(tx, ty, tz) !== 0) continue;
        for (const [nx, ny, nz] of NEIGHBOR_DIRS) {
          const sx = tx - nx;
          const sy = ty - ny;
          const sz = tz - nz;
          if (!world.inBounds(sx, sy, sz)) continue;
          if (!isTorchSupportBlock(world.get(sx, sy, sz))) continue;
          const att = torchSupportDeltaToAttach(-nx, -ny, -nz);
          const pos = meatSnapWorldPoint(tx, ty, tz, att);
          const ddx = pos.x - ox;
          const ddy = pos.y - oy;
          const ddz = pos.z - oz;
          const dsq = ddx * ddx + ddy * ddy + ddz * ddz;
          if (dsq < bestDistSq) {
            bestDistSq = dsq;
            best = { x: pos.x, y: pos.y, z: pos.z, attach: att };
          }
        }
      }
    }
  }
  return best;
}

function meatWallBaseYaw(attach) {
  switch (attach) {
    case TorchAttach.WALL_MX:
      return 0;
    case TorchAttach.WALL_PX:
      return Math.PI;
    case TorchAttach.WALL_MZ:
      return Math.PI / 2;
    case TorchAttach.WALL_PZ:
      return -Math.PI / 2;
    default:
      return 0;
  }
}

let _dropGeo = null;
/** @type {Map<import('three').Texture, Map<number, THREE.MeshBasicMaterial>>} */
const _dropMatsByAtlas = new Map();

/**
 * @param {THREE.Texture} atlasTex
 * @param {number} blockId
 */
function getDropMaterialForBlock(atlasTex, blockId) {
  let byId = _dropMatsByAtlas.get(atlasTex);
  if (!byId) {
    byId = new Map();
    _dropMatsByAtlas.set(atlasTex, byId);
  }
  let m = byId.get(blockId);
  if (!m) {
    const def = BLOCKS[blockId];
    const col = def?.top?.[0] ?? 13;
    const row = def?.top?.[1] ?? 0;
    const t = atlasTex.clone();
    t.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_TILES);
    t.offset.set(col / ATLAS_COLS, row / ATLAS_TILES);
    t.needsUpdate = true;
    m = new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.08,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    byId.set(blockId, m);
  }
  return m;
}

/**
 * @param {THREE.Texture} atlasTex
 * @param {import('./world.js').World | null} [world] Pork/beef: snap to nearest block face (floor/wall/ceiling).
 * @param {number} [savedAttach] If 1–6, use saved orientation (load); skip auto-placement.
 */
export function createGroundDrop(x, worldY, z, blockId, count, atlasTex, world = null, savedAttach) {
  const isMeat = blockId === BlockId.PORKCHOP || blockId === BlockId.BEEF;
  let fx = x;
  let fy = worldY;
  let fz = z;
  let attach = TorchAttach.AUTO;
  if (isMeat && world) {
    const sa = savedAttach ?? TorchAttach.AUTO;
    if (sa >= TorchAttach.FLOOR && sa <= TorchAttach.WALL_PZ) {
      attach = sa;
    } else {
      const sn = findMeatDropPlacement(world, x, worldY, z);
      if (sn) {
        fx = sn.x;
        fy = sn.y;
        fz = sn.z;
        attach = sn.attach;
      }
    }
  }

  if (!_dropGeo) _dropGeo = new THREE.PlaneGeometry(0.34, 0.34);
  const mat = getDropMaterialForBlock(atlasTex, blockId);
  const planeA = new THREE.Mesh(_dropGeo, mat);
  const planeB = new THREE.Mesh(_dropGeo, mat);
  planeB.rotation.y = Math.PI / 2;
  planeA.renderOrder = 4;
  planeB.renderOrder = 4;

  const group = new THREE.Group();
  group.add(planeA, planeB);
  group.position.set(fx, fy, fz);
  group.renderOrder = 4;
  return {
    x: fx,
    y: fy,
    z: fz,
    blockId,
    count,
    mesh: group,
    spinPhase: Math.random() * Math.PI * 2,
    attach,
  };
}

/**
 * Minecraft-style item: two vertical planes in a +, yaw toward camera + slow spin.
 * @param {Array<{ mesh: THREE.Object3D, spinPhase?: number }>} drops
 * @param {THREE.Camera} camera
 * @param {number} [timeSec]
 */
export function orientDropsToCamera(drops, camera, timeSec = 0) {
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    const g = d.mesh;
    const spin = (d.spinPhase ?? 0) + timeSec * 2.0;
    const dx = camera.position.x - g.position.x;
    const dz = camera.position.z - g.position.z;
    g.rotation.order = 'YXZ';
    const isMeat = d.blockId === BlockId.PORKCHOP || d.blockId === BlockId.BEEF;
    const att = d.attach ?? TorchAttach.AUTO;
    if (isMeat && att >= TorchAttach.WALL_MX && att <= TorchAttach.WALL_PZ) {
      const wobble = Math.atan2(dx, dz) * 0.12;
      g.rotation.set(0, meatWallBaseYaw(att) + wobble + spin * 0.08, 0);
    } else {
      const yaw = Math.atan2(dx, dz) + spin;
      g.rotation.set(0, yaw, 0);
    }
  }
}

/**
 * @param {import('./player.js').Player} player
 * @param {import('./inventory.js').InvSlot[]} slots
 * @param {{ hotbarOnly?: boolean }} [opts]
 * @returns {Array<{ mesh: THREE.Mesh }>}
 */
export function tryPickupDrops(player, drops, slots, opts) {
  const { min, max } = player.aabb();
  const padX = 0.45;
  const padZ = 0.45;
  const padY = 0.35;
  const removed = [];
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    const { x, y, z } = d;
    if (
      max[0] > x - padX &&
      min[0] < x + padX &&
      max[2] > z - padZ &&
      min[2] < z + padZ &&
      max[1] > y - padY &&
      min[1] < y + padY + 0.5
    ) {
      addItemToInventory(slots, d.blockId, d.count, opts);
      drops.splice(i, 1);
      removed.push(d);
    }
  }
  return removed;
}

export function disposeMobsSharedResources() {
  for (const byId of _dropMatsByAtlas.values()) {
    for (const m of byId.values()) {
      m.map?.dispose();
      m.dispose();
    }
  }
  _dropMatsByAtlas.clear();
  if (_dropGeo) {
    _dropGeo.dispose();
    _dropGeo = null;
  }
}
