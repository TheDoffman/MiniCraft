import * as THREE from 'three';
import { collidesAABB, aabbOverlapsFluid } from './physics.js';
import { BlockId } from './blocktypes.js';
import { getSquidMaterialBundle } from './squidTextures.js';
import { rayAabbEnterDistance } from './mobRaycast.js';
import {
  updateMobHitFlash,
  HIT_FLASH_DUR,
  KNOCKBACK_STRENGTH,
  DEATH_DUR,
  YAW_SMOOTH,
} from './mobShared.js';
import { PIG_HP } from './pigMob.js';

export const SQUID_HP = PIG_HP;

const SQUID_HW = 0.28;
const SQUID_H = 0.52;
const SQUID_HD = 0.28;
const SQUID_WANDER_SPEED = 0.42;
const SQUID_VY_SPEED = 0.32;
const SQUID_DRAG = 2.4;
const SQUID_TENTACLE_SPEED = 8;

const MANTLE_CY = 0.33;
const MANTLE_H = 0.24;
const MANTLE_W = 0.36;
const TENT_ATTACH_Y = MANTLE_CY - MANTLE_H / 2;
const TENT_LEN = 0.2;
const TENT_RING_R = 0.14;

/** @param {{ x: number, y: number, z: number }} s */
export function getSquidBodyAABB(s) {
  return {
    min: [s.x - SQUID_HW, s.y, s.z - SQUID_HD],
    max: [s.x + SQUID_HW, s.y + SQUID_H, s.z + SQUID_HD],
  };
}

/**
 * @param {Array<{ x: number, y: number, z: number, hp: number, state?: string }>} squids
 * @returns {{ squid: typeof squids[0], t: number } | null}
 */
export function raycastNearestSquidWithT(ox, oy, oz, dx, dy, dz, maxDist, squids) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < squids.length; i++) {
    const s = squids[i];
    if (s.hp <= 0 || s.state === 'dying') continue;
    const { min, max } = getSquidBodyAABB(s);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = s;
    }
  }
  return best !== null && bestT <= maxDist ? { squid: best, t: bestT } : null;
}

/**
 * Minecraft-style squid: vertical mantle, side eyes, eight tentacles hanging from the rim.
 *
 * @returns {{ group: THREE.Group, tentacles: THREE.Group[], materials: THREE.MeshLambertMaterial[] }}
 */
export function createSquidMesh() {
  const b = getSquidMaterialBundle();
  const mantleMat = b.mantleMat.clone();
  const tentMat = b.tentacleMat.clone();
  const eyeMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x080810),
    flatShading: true,
  });
  for (const m of [mantleMat, tentMat, eyeMat]) {
    m.emissive = new THREE.Color(0);
    m.emissiveIntensity = 0;
  }

  const group = new THREE.Group();

  const mantle = new THREE.Mesh(new THREE.BoxGeometry(MANTLE_W, MANTLE_H, MANTLE_W), mantleMat);
  mantle.position.set(0, MANTLE_CY, 0);
  mantle.castShadow = true;
  mantle.receiveShadow = true;
  group.add(mantle);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(MANTLE_W * 0.82, 0.07, MANTLE_W * 0.82),
    mantleMat,
  );
  cap.position.set(0, MANTLE_CY + MANTLE_H / 2 + 0.035, 0);
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  const eyeGeo = new THREE.BoxGeometry(0.045, 0.11, 0.03);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-(MANTLE_W / 2 + 0.012), MANTLE_CY + 0.02, 0.06);
  eyeL.castShadow = true;
  eyeL.receiveShadow = true;
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(MANTLE_W / 2 + 0.012, MANTLE_CY + 0.02, 0.06);
  eyeR.castShadow = true;
  eyeR.receiveShadow = true;
  group.add(eyeL, eyeR);

  /** @type {THREE.Group[]} */
  const tentacles = [];
  const tentGeo = new THREE.BoxGeometry(0.052, TENT_LEN, 0.052);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(
      Math.cos(ang) * TENT_RING_R,
      TENT_ATTACH_Y,
      Math.sin(ang) * TENT_RING_R,
    );
    const mesh = new THREE.Mesh(tentGeo, tentMat);
    mesh.position.set(0, -TENT_LEN / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    tentacles.push(pivot);
  }

  return {
    group,
    tentacles,
    materials: [mantleMat, tentMat, eyeMat],
  };
}

export function disposeSquidMobGroup(group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
}

/**
 * @param {import('./world.js').World} world
 */
export function getWaterColumnBounds(world, ix, iz) {
  if (!world.inBounds(ix, 0, iz)) return null;
  let minY = -1;
  let maxY = -1;
  const h = world.height;
  for (let y = 0; y < h; y++) {
    if (world.get(ix, y, iz) === BlockId.WATER) {
      if (minY < 0) minY = y;
      maxY = y;
    }
  }
  return minY >= 0 ? { minY, maxY } : null;
}

/**
 * @param {number} [hp]
 */
export function createSquid(x, y, z, hp = SQUID_HP) {
  const { group, tentacles, materials } = createSquidMesh();
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    hp,
    targetVx: 0,
    targetVy: 0,
    targetVz: 0,
    wanderT: 0,
    tentaclePhase: Math.random() * Math.PI * 2,
    smoothedYaw: 0,
    kvx: 0,
    kvz: 0,
    hitFlash: 0,
    state: 'alive',
    deathT: 0,
    deathSinkY: 0,
    pendingDeathCleanup: false,
    mesh: group,
    tentacles,
    materials,
  };
}

export function syncSquidMesh(s) {
  const sink = s.deathSinkY ?? 0;
  s.mesh.position.set(s.x, s.y + sink, s.z);
}

function squidTryAxis(world, squid, dx, dy, dz) {
  const { min, max } = getSquidBodyAABB(squid);
  const nx = min[0] + dx;
  const ny = min[1] + dy;
  const nz = min[2] + dz;
  const nmax = [max[0] + dx, max[1] + dy, max[2] + dz];
  if (!collidesAABB(world, [nx, ny, nz], nmax)) {
    squid.x += dx;
    squid.y += dy;
    squid.z += dz;
    return true;
  }
  return false;
}

/**
 * @param {import('./world.js').World} world
 */
export function updateSquid(squid, world, dt) {
  updateMobHitFlash(squid, dt);

  if (squid.state === 'dying') {
    squid.deathT += dt;
    const u = Math.min(1, squid.deathT / DEATH_DUR);
    const e = u * u * (3 - 2 * u);
    squid.mesh.rotation.x = -e * (Math.PI / 2 * 0.85);
    squid.mesh.rotation.z = Math.sin(e * Math.PI) * 0.4;
    squid.mesh.scale.setScalar(Math.max(0.06, 1 - e * 0.88));
    squid.deathSinkY = -e * e * 0.14;
    if (u >= 1) squid.pendingDeathCleanup = true;
    syncSquidMesh(squid);
    return;
  }

  if (squid.hp <= 0) return;

  squid.wanderT -= dt;
  if (squid.wanderT <= 0) {
    squid.wanderT = 1.8 + Math.random() * 3.2;
    const a = Math.random() * Math.PI * 2;
    const b = (Math.random() - 0.5) * 2 * SQUID_VY_SPEED;
    squid.targetVx = Math.cos(a) * SQUID_WANDER_SPEED * (0.65 + Math.random() * 0.5);
    squid.targetVz = Math.sin(a) * SQUID_WANDER_SPEED * (0.65 + Math.random() * 0.5);
    squid.targetVy = b;
  }

  const k = 1 - Math.exp(-dt * 2.2);
  squid.vx += (squid.targetVx - squid.vx) * k;
  squid.vy += (squid.targetVy - squid.vy) * k;
  squid.vz += (squid.targetVz - squid.vz) * k;

  const drag = Math.exp(-dt * SQUID_DRAG);
  squid.kvx *= drag;
  squid.kvz *= drag;

  const mx = squid.vx + squid.kvx;
  const my = squid.vy;
  const mz = squid.vz + squid.kvz;

  const stepAxis = (v, axis) => {
    const dist = v * dt;
    const n = Math.max(1, Math.ceil(Math.abs(dist) / 0.04));
    const stepV = dist / n;
    for (let i = 0; i < n; i++) {
      if (axis === 'x' && !squidTryAxis(world, squid, stepV, 0, 0)) {
        squid.vx *= -0.45;
        squid.targetVx *= -0.35;
        squid.kvx *= -0.4;
        break;
      }
      if (axis === 'z' && !squidTryAxis(world, squid, 0, 0, stepV)) {
        squid.vz *= -0.45;
        squid.targetVz *= -0.35;
        squid.kvz *= -0.4;
        break;
      }
      if (axis === 'y' && !squidTryAxis(world, squid, 0, stepV, 0)) {
        squid.vy *= -0.5;
        squid.targetVy *= -0.4;
        break;
      }
    }
  };
  stepAxis(mx, 'x');
  stepAxis(my, 'y');
  stepAxis(mz, 'z');

  const aabb = getSquidBodyAABB(squid);
  if (!aabbOverlapsFluid(world, aabb.min, aabb.max)) {
    const col = getWaterColumnBounds(world, Math.floor(squid.x), Math.floor(squid.z));
    if (col) {
      const targetFeet = (col.minY + col.maxY + 1) * 0.5 - SQUID_H * 0.5;
      squid.vy += (targetFeet - squid.y) * 6 * dt;
      squid.vy = Math.max(-2.2, Math.min(2.2, squid.vy));
    } else {
      squid.vy -= 12 * dt;
    }
  }

  const sp = Math.hypot(mx, mz);
  squid.tentaclePhase += dt * SQUID_TENTACLE_SPEED;
  const w = Math.sin(squid.tentaclePhase);
  for (let i = 0; i < squid.tentacles.length; i++) {
    const pivot = squid.tentacles[i];
    const o = Math.sin(squid.tentaclePhase + i * 0.78) * 0.52;
    pivot.rotation.x = o + w * 0.1;
    pivot.rotation.z = Math.sin(squid.tentaclePhase * 1.05 + i * 1.1) * 0.14;
  }

  if (sp > 0.04) {
    const targetYaw = Math.atan2(mx, mz);
    let dy = targetYaw - squid.smoothedYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    squid.smoothedYaw += dy * (1 - Math.exp(-dt * YAW_SMOOTH));
    squid.mesh.rotation.y = squid.smoothedYaw;
  }

  syncSquidMesh(squid);
}

/**
 * @param {import('./world.js').World} world
 * @param {THREE.Scene} scene
 * @param {Array<{ mesh: THREE.Group }>} squids
 * @param {number} [count]
 * @param {number} [centerX]
 * @param {number} [centerZ]
 */
export function spawnSquidsInWater(world, scene, squids, count = 10, centerX, centerZ) {
  const cx =
    centerX !== undefined && Number.isFinite(centerX) ? Math.floor(centerX) : 0;
  const cz =
    centerZ !== undefined && Number.isFinite(centerZ) ? Math.floor(centerZ) : 0;
  const minR = 6;
  const maxR = 96;
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 280;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const ix = Math.floor(cx + Math.cos(ang) * r);
    const iz = Math.floor(cz + Math.sin(ang) * r);
    const col = getWaterColumnBounds(world, ix, iz);
    if (!col) continue;
    const span = col.maxY - col.minY + 1;
    if (span < SQUID_H + 0.25) continue;
    const feetMin = col.minY + 0.02;
    const feetMax = col.maxY + 1 - SQUID_H - 0.08;
    if (feetMax <= feetMin) continue;
    const feetY = feetMin + Math.random() * (feetMax - feetMin);
    const squid = createSquid(ix + 0.5, feetY, iz + 0.5);
    scene.add(squid.mesh);
    syncSquidMesh(squid);
    squids.push(squid);
    placed++;
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {Array<{ mesh: THREE.Group }>} squids
 * @param {number} index
 */
export function finalizeDeadSquid(scene, squids, index) {
  const s = squids[index];
  scene.remove(s.mesh);
  disposeSquidMobGroup(s.mesh);
  squids.splice(index, 1);
}

/**
 * Same punch rules as pigs ({@link MOB_PUNCH_DAMAGE}).
 * @returns {boolean} true if the squid was hit
 */
export function damageSquid(_scene, squids, damage, _atlasTex, _drops, squid, knockDx, knockDz) {
  const idx = squids.indexOf(squid);
  if (idx < 0 || squid.hp <= 0 || squid.state === 'dying') return false;
  squid.hp -= damage;
  squid.hitFlash = HIT_FLASH_DUR;
  const kdx = knockDx ?? 0;
  const kdz = knockDz ?? 0;
  const hlen = Math.hypot(kdx, kdz);
  if (hlen > 1e-5) {
    squid.kvx += (kdx / hlen) * KNOCKBACK_STRENGTH;
    squid.kvz += (kdz / hlen) * KNOCKBACK_STRENGTH;
  }
  if (squid.hp > 0) return true;
  squid.state = 'dying';
  squid.deathT = 0;
  squid.hp = 0;
  squid.targetVx = 0;
  squid.targetVy = 0;
  squid.targetVz = 0;
  squid.vx *= 0.28;
  squid.vy *= 0.28;
  squid.vz *= 0.28;
  squid.kvx *= 0.55;
  squid.kvz *= 0.55;
  squid.hitFlash = Math.max(squid.hitFlash, HIT_FLASH_DUR * 0.9);
  squid.mesh.rotation.order = 'YXZ';
  squid.pendingDeathCleanup = false;
  return true;
}
