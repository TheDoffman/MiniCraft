import * as THREE from 'three';
import { addItemToInventory } from './inventory';
import { BLOCKS, BlockId } from './blocktypes';
import { TorchAttach, torchSupportDeltaToAttach, isTorchSupportBlock } from './torchAttach';
import { getHeldBlockGeometry } from './firstPersonHand';

/** World scale for dropped item mesh (held FP geometry is ~0.2 units wide). */
const DROP_MESH_SCALE = 1.55;
/** Half-height of drop mesh in world units (held cube is ±0.1 before scale). */
const DROP_HALF_H = DROP_MESH_SCALE * 0.1;
const DROP_GRAVITY = 26;
const DROP_MAX_FALL_SPEED = 14;

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

function blockSupportsDrop(id) {
  if (id === 0) return false;
  const d = BLOCKS[id];
  return !!(d && d.solid && d.collision !== false);
}

/**
 * World Y for drop center resting on the first solid-with-collision block under (ix, iz).
 * Matches {@link import('./world.js').World#topSolidY} support rules (no water/glass floor).
 */
function dropRestCenterY(world, ix, iz, cy) {
  if (!world.inBounds(ix, 0, iz)) return cy;
  let b = Math.min(world.height - 1, Math.floor(cy - DROP_HALF_H - 1e-4));
  for (; b >= 0; b--) {
    if (!world.inBounds(ix, b, iz)) return DROP_HALF_H;
    if (blockSupportsDrop(world.get(ix, b, iz))) {
      return b + 1 + DROP_HALF_H;
    }
  }
  return DROP_HALF_H;
}

function dropShouldFallWithGravity(d) {
  const isMeat =
    d.blockId === BlockId.PORKCHOP ||
    d.blockId === BlockId.BEEF ||
    d.blockId === BlockId.MUTTON ||
    d.blockId === BlockId.RAW_CHICKEN;
  if (!isMeat) return true;
  const att = d.attach ?? TorchAttach.AUTO;
  if (att === TorchAttach.CEILING) return false;
  if (att >= TorchAttach.WALL_MX && att <= TorchAttach.WALL_PZ) return false;
  return true;
}

/**
 * Fall until the column below has solid support (same rules as {@link import('./world.js').World#topSolidY}).
 * @param {import('./world.js').World} world
 * @param {Array<{ x: number, y: number, z: number, mesh: THREE.Object3D, vy?: number, blockId: number, attach?: number }>} drops
 * @param {number} dt
 */
export function tickGroundDrops(world, drops, dt) {
  if (!world || drops.length === 0) return;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (d.pickupDelay > 0) d.pickupDelay = Math.max(0, d.pickupDelay - dt);
    if (!dropShouldFallWithGravity(d)) continue;

    const hvx = d.vx ?? 0;
    const hvz = d.vz ?? 0;
    if (hvx !== 0 || hvz !== 0) {
      d.x += hvx * dt;
      d.z += hvz * dt;
      const drag = Math.exp(-dt * 4.0);
      d.vx = hvx * drag;
      d.vz = hvz * drag;
      if (Math.abs(d.vx) < 0.01) d.vx = 0;
      if (Math.abs(d.vz) < 0.01) d.vz = 0;
    }

    const ix = Math.floor(d.x);
    const iz = Math.floor(d.z);
    const targetY = dropRestCenterY(world, ix, iz, d.y);
    if (d.y <= targetY + 1e-4 && (d.vy ?? 0) <= 0) {
      d.y = targetY;
      d.vy = 0;
      d.mesh.position.set(d.x, d.y, d.z);
      continue;
    }
    let vy = d.vy ?? 0;
    vy -= DROP_GRAVITY * dt;
    d.vy = vy;
    d.y += vy * dt;
    if (d.y < targetY) {
      d.y = targetY;
      d.vy = 0;
    }
    d.mesh.position.set(d.x, d.y, d.z);
  }
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

/** @type {Map<import('three').Texture, Map<number, THREE.MeshBasicMaterial>>} */
const _dropMatsByAtlas = new Map();

/**
 * Unlit material using the full block atlas (geometry carries per-face UVs).
 * Does not own `atlasTex` — do not dispose the texture from here.
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
    const cutout = !!def?.alpha;
    const itemOrTool = !!(def && !def.solid && !cutout);
    const blended = cutout || itemOrTool;
    m = new THREE.MeshBasicMaterial({
      map: atlasTex,
      transparent: blended,
      depthWrite: !blended,
      alphaTest: blended ? 0.08 : 0,
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
export function createGroundDrop(x, worldY, z, blockId, count, atlasTex, world = null, savedAttach?) {
  const isMeat =
    blockId === BlockId.PORKCHOP ||
    blockId === BlockId.BEEF ||
    blockId === BlockId.MUTTON ||
    blockId === BlockId.RAW_CHICKEN;
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

  const geom = getHeldBlockGeometry(blockId);
  const mat = getDropMaterialForBlock(atlasTex, blockId);
  const itemMesh = new THREE.Mesh(geom, mat);
  itemMesh.renderOrder = 4;
  itemMesh.frustumCulled = false;
  itemMesh.castShadow = false;
  itemMesh.receiveShadow = false;

  const group = new THREE.Group();
  group.add(itemMesh);
  group.scale.setScalar(DROP_MESH_SCALE);
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
    vx: 0,
    vy: 0,
    vz: 0,
    pickupDelay: 0,
  };
}

/**
 * Yaw dropped item toward camera + slow spin (same feel as old billboard drops).
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
    const isMeat =
    d.blockId === BlockId.PORKCHOP ||
    d.blockId === BlockId.BEEF ||
    d.blockId === BlockId.MUTTON ||
    d.blockId === BlockId.RAW_CHICKEN;
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
 * Hotbar first, then backpack (same as block-break rewards). Creative passes `{ hotbarOnly: true }`.
 * @param {import('./inventory.js').InvSlot[]} slots
 * @param {number} blockId
 * @param {number} count
 * @param {{ hotbarOnly?: boolean, backpackOnly?: boolean }} [opts]
 * @returns {number} count that could not be added
 */
function addPickupToInventory(slots, blockId, count, opts) {
  if (opts?.hotbarOnly || opts?.backpackOnly) {
    return addItemToInventory(slots, blockId, count, opts);
  }
  let left = addItemToInventory(slots, blockId, count, { hotbarOnly: true });
  if (left > 0) {
    left = addItemToInventory(slots, blockId, left, { backpackOnly: true });
  }
  return left;
}

/**
 * @param {import('./player.js').Player} player
 * @param {import('./inventory.js').InvSlot[]} slots
 * @param {{ hotbarOnly?: boolean, backpackOnly?: boolean }} [opts]
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
    if ((d.pickupDelay ?? 0) > 0) continue;
    const { x, y, z } = d;
    if (
      max[0] > x - padX &&
      min[0] < x + padX &&
      max[2] > z - padZ &&
      min[2] < z + padZ &&
      max[1] > y - padY &&
      min[1] < y + padY + 0.5
    ) {
      const remaining = addPickupToInventory(slots, d.blockId, d.count, opts);
      if (remaining === 0) {
        drops.splice(i, 1);
        removed.push(d);
      } else {
        d.count = remaining;
      }
    }
  }
  return removed;
}

export function disposeMobsSharedResources() {
  for (const byId of _dropMatsByAtlas.values()) {
    for (const m of byId.values()) {
      m.dispose();
    }
  }
  _dropMatsByAtlas.clear();
}
