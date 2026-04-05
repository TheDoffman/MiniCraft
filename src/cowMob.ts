import * as THREE from 'three';
import { collidesAABB, aabbOverlapsFluid } from './physics';
import { BlockId } from './blocktypes';
import { getColumnWaterSurfaceY } from './mobFluid';
import { getCowMaterialBundle } from './cowTextures';
import { rayAabbEnterDistance } from './mobRaycast';
import {
  updateMobHitFlash,
  HIT_FLASH_DUR,
  KNOCKBACK_STRENGTH,
  KNOCKBACK_DECAY,
  DEATH_DUR,
  YAW_SMOOTH,
  MOB_PUNCH_DAMAGE,
  landSpawnColumnHasFluid,
} from './mobShared';
import { createGroundDrop } from './mobDrops';
import { playSound } from './sound';

export const COW_HP = 10;
/** @deprecated Prefer {@link MOB_PUNCH_DAMAGE} from `mobShared.js`. */
export const COW_PUNCH_DAMAGE = MOB_PUNCH_DAMAGE;

const WALK_PHASE_SPEED = 10;
const LEG_SWING_MAX = 0.38;
const TORSO_BOB_MAX = 0.02;
const LEG_RETURN_RATE = 10;

const COW_FLOAT_SUBMERGE = 0.38;
const COW_WATER_SPRING = 13;
const COW_WATER_VDAMP = 5.2;
const COW_WATER_VY_MAX = 3.4;
const COW_WATER_H_DRAG = 2.0;
const COW_WATER_BOB_SPEED = 4.8;
const COW_WATER_BOB_AMP = 0.038;

const HW = 0.48;
const H = 0.92;
const HD = 0.58;

const COW_LEG_LEN = 0.24;
const COW_LEG_W = 0.11;
const COW_LEG_D = 0.11;
const COW_HIP_Y = COW_LEG_LEN;

/** @param {{ x: number, y: number, z: number }} cow */
export function getCowBodyAABB(cow) {
  return {
    min: [cow.x - HW, cow.y, cow.z - HD],
    max: [cow.x + HW, cow.y + H, cow.z + HD],
  };
}

/**
 * @param {Array<{ x: number, y: number, z: number, hp: number }>} cows
 */
export function raycastNearestCow(ox, oy, oz, dx, dy, dz, maxDist, cows) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < cows.length; i++) {
    const cow = cows[i];
    if (cow.hp <= 0 || cow.state === 'dying') continue;
    const { min, max } = getCowBodyAABB(cow);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = cow;
    }
  }
  return best !== null && bestT <= maxDist ? best : null;
}

/**
 * @param {Array<{ x: number, y: number, z: number, hp: number }>} cows
 * @returns {{ cow: typeof cows[0], t: number } | null}
 */
export function raycastNearestCowWithT(ox, oy, oz, dx, dy, dz, maxDist, cows) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < cows.length; i++) {
    const cow = cows[i];
    if (cow.hp <= 0 || cow.state === 'dying') continue;
    const { min, max } = getCowBodyAABB(cow);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = cow;
    }
  }
  return best !== null && bestT <= maxDist ? { cow: best, t: bestT } : null;
}

/**
 * @returns {{ group: THREE.Group, anim: { torso: THREE.Group, legFL: THREE.Group, legFR: THREE.Group, legBL: THREE.Group, legBR: THREE.Group, baseTorsoY: number }, materials: THREE.MeshLambertMaterial[] }}
 */
export function createCowMesh() {
  const b = getCowMaterialBundle();
  const hideMat = b.hideMat.clone();
  const muzzleMat = b.muzzleMat.clone();
  const hoofMat = b.hoofMat.clone();
  const hornMat = b.hornMat.clone();
  for (const m of [hideMat, muzzleMat, hoofMat, hornMat]) {
    m.emissive = new THREE.Color(0);
    m.emissiveIntensity = 0;
  }

  const group = new THREE.Group();

  const baseTorsoY = 0.32;
  const torso = new THREE.Group();
  torso.position.set(0, baseTorsoY, 0);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.5, 1.18), hideMat);
  body.castShadow = true;
  body.receiveShadow = true;
  torso.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.48), hideMat);
  head.position.set(0, 0.28, 0.58);
  head.castShadow = true;
  head.receiveShadow = true;

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.2), muzzleMat);
  muzzle.position.set(0, 0.22, 0.92);
  muzzle.castShadow = true;
  muzzle.receiveShadow = true;

  function horn(side) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), hornMat);
    h.position.set(side * 0.22, 0.52, 0.52);
    h.rotation.z = side * 0.35;
    h.castShadow = true;
    h.receiveShadow = true;
    return h;
  }

  torso.add(head, muzzle, horn(1), horn(-1));

  function legPivot(lx, lz) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, COW_HIP_Y, lz);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(COW_LEG_W, COW_LEG_LEN, COW_LEG_D),
      hoofMat,
    );
    mesh.position.set(0, -COW_LEG_LEN / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const legFL = legPivot(0.28, 0.38);
  const legFR = legPivot(-0.28, 0.38);
  const legBL = legPivot(0.28, -0.38);
  const legBR = legPivot(-0.28, -0.38);

  group.add(torso);

  return {
    group,
    anim: { torso, legFL, legFR, legBL, legBR, baseTorsoY },
    materials: [hideMat, muzzleMat, hoofMat, hornMat],
  };
}

export function disposeCowMobGroup(group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
}

/**
 * @param {number} [hp]
 */
export function createCow(x, y, z, hp = COW_HP) {
  const { group, anim, materials } = createCowMesh();
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    hp,
    targetVx: 0,
    targetVz: 0,
    wanderT: 0,
    walkPhase: 0,
    waterBobPhase: Math.random() * Math.PI * 2,
    waterBobY: 0,
    smoothedYaw: 0,
    kvx: 0,
    kvz: 0,
    fleeT: 0,
    fleeDirX: 0,
    fleeDirZ: 0,
    hitFlash: 0,
    /** @type {'alive' | 'dying'} */
    state: 'alive',
    deathT: 0,
    deathSinkY: 0,
    pendingDeathCleanup: false,
    mesh: group,
    anim,
    materials,
  };
}

export function syncCowMesh(cow) {
  const sink = cow.deathSinkY ?? 0;
  const bob = cow.state === 'dying' ? 0 : cow.waterBobY ?? 0;
  cow.mesh.position.set(cow.x, cow.y + sink + bob, cow.z);
}

function cowTryAxis(world, cow, dx, dy, dz) {
  const { min, max } = getCowBodyAABB(cow);
  const nx = min[0] + dx;
  const ny = min[1] + dy;
  const nz = min[2] + dz;
  const nmax = [max[0] + dx, max[1] + dy, max[2] + dz];
  if (!collidesAABB(world, [nx, ny, nz], nmax)) {
    cow.x += dx;
    cow.y += dy;
    cow.z += dz;
    return true;
  }
  return false;
}

/**
 * @param {import('./world.js').World} world
 */
export function updateCow(cow, world, dt) {
  updateMobHitFlash(cow, dt);

  if (cow.state === 'dying') {
    cow.deathT += dt;
    const u = Math.min(1, cow.deathT / DEATH_DUR);
    const e = u * u * (3 - 2 * u);
    cow.mesh.rotation.x = -e * (Math.PI / 2 * 0.92);
    cow.mesh.rotation.z = Math.sin(e * Math.PI) * 0.32;
    cow.mesh.scale.setScalar(Math.max(0.08, 1 - e * 0.82));
    cow.deathSinkY = -e * e * 0.12;
    const { anim } = cow;
    const legDecay = Math.exp(-dt * 14);
    anim.legFL.rotation.x *= legDecay;
    anim.legFR.rotation.x *= legDecay;
    anim.legBL.rotation.x *= legDecay;
    anim.legBR.rotation.x *= legDecay;
    anim.torso.position.y = anim.baseTorsoY;
    if (u >= 1) cow.pendingDeathCleanup = true;
    syncCowMesh(cow);
    return;
  }

  if (cow.hp <= 0) return;

  cow.fleeT = (cow.fleeT ?? 0) - dt;
  if (cow.fleeT > 0) {
    const fleeSpeed = 2.0;
    cow.targetVx = (cow.fleeDirX ?? 0) * fleeSpeed;
    cow.targetVz = (cow.fleeDirZ ?? 0) * fleeSpeed;
    cow.wanderT = 1 + Math.random() * 2;
  } else {
    cow.wanderT -= dt;
    if (cow.wanderT <= 0) {
      cow.wanderT = 2.5 + Math.random() * 5;
      const a = Math.random() * Math.PI * 2;
      cow.targetVx = Math.cos(a) * 0.48;
      cow.targetVz = Math.sin(a) * 0.48;
    }
  }

  const k = 1 - Math.exp(-dt * 2.4);
  cow.vx += (cow.targetVx - cow.vx) * k;
  cow.vz += (cow.targetVz - cow.vz) * k;

  const kDecay = Math.exp(-dt * KNOCKBACK_DECAY);
  cow.kvx *= kDecay;
  cow.kvz *= kDecay;

  const aabbPre = getCowBodyAABB(cow);
  const inWater = aabbOverlapsFluid(world, aabbPre.min, aabbPre.max);
  if (inWater) {
    const hDrag = Math.exp(-dt * COW_WATER_H_DRAG);
    cow.vx *= hDrag;
    cow.vz *= hDrag;
    cow.targetVx *= hDrag;
    cow.targetVz *= hDrag;
    cow.kvx *= hDrag;
    cow.kvz *= hDrag;
  }

  const mx = cow.vx + cow.kvx;
  const mz = cow.vz + cow.kvz;

  const step = (v, axis) => {
    const dist = v * dt;
    const n = Math.ceil(Math.abs(dist) / 0.04);
    const stepV = dist / n;
    for (let i = 0; i < n; i++) {
      if (axis === 'x' && !cowTryAxis(world, cow, stepV, 0, 0)) {
        cow.vx *= -0.35;
        cow.targetVx *= -0.28;
        cow.kvx *= -0.32;
        break;
      }
      if (axis === 'z' && !cowTryAxis(world, cow, 0, 0, stepV)) {
        cow.vz *= -0.35;
        cow.targetVz *= -0.28;
        cow.kvz *= -0.32;
        break;
      }
    }
  };
  step(mx, 'x');
  step(mz, 'z');

  if (inWater) {
    const surf = getColumnWaterSurfaceY(world, cow.x, cow.z);
    if (surf !== null) {
      const targetY = surf - H * COW_FLOAT_SUBMERGE;
      cow.vy += ((targetY - cow.y) * COW_WATER_SPRING - cow.vy * COW_WATER_VDAMP) * dt;
      cow.vy = Math.max(-COW_WATER_VY_MAX, Math.min(COW_WATER_VY_MAX, cow.vy));
    } else {
      cow.vy -= 22 * dt;
    }
  } else {
    cow.vy -= 22 * dt;
  }

  const dy = cow.vy * dt;
  const n = Math.max(1, Math.ceil(Math.abs(dy) / 0.05));
  const sy = dy / n;
  let landed = false;
  for (let i = 0; i < n; i++) {
    if (cowTryAxis(world, cow, 0, sy, 0)) {
      /* moved */
    } else {
      cow.vy = 0;
      landed = true;
      break;
    }
  }

  const aabbPost = getCowBodyAABB(cow);
  const onGround = collidesAABB(
    world,
    [aabbPost.min[0] + 0.02, aabbPost.min[1] - 0.1, aabbPost.min[2] + 0.02],
    [aabbPost.max[0] - 0.02, aabbPost.min[1] + 0.02, aabbPost.max[2] - 0.02],
  );
  const stillInWater = aabbOverlapsFluid(world, aabbPost.min, aabbPost.max);
  if (!stillInWater && (onGround || landed)) {
    cow.vy = Math.min(0, cow.vy);
    const ix = Math.floor(cow.x);
    const iz = Math.floor(cow.z);
    const ty = world.topSupportingSolidY(ix, iz, cow.y);
    if (ty >= 0) {
      const feet = ty + 1 + 0.002;
      if (cow.y < feet) {
        cow.y = feet;
        cow.vy = 0;
      }
    }
  }

  const sp = Math.hypot(mx, mz);
  const { anim } = cow;
  if (sp > 0.05) {
    cow.walkPhase += dt * sp * WALK_PHASE_SPEED;
    const s = Math.sin(cow.walkPhase) * LEG_SWING_MAX;
    const o = Math.sin(cow.walkPhase + Math.PI) * LEG_SWING_MAX;
    anim.legFL.rotation.x = s;
    anim.legBR.rotation.x = s;
    anim.legFR.rotation.x = o;
    anim.legBL.rotation.x = o;
    anim.torso.position.y = anim.baseTorsoY + Math.abs(Math.sin(cow.walkPhase * 2)) * TORSO_BOB_MAX;

    const targetYaw = Math.atan2(mx, mz);
    let dya = targetYaw - cow.smoothedYaw;
    while (dya > Math.PI) dya -= Math.PI * 2;
    while (dya < -Math.PI) dya += Math.PI * 2;
    cow.smoothedYaw += dya * (1 - Math.exp(-dt * YAW_SMOOTH));
    cow.mesh.rotation.y = cow.smoothedYaw;
  } else {
    const decay = Math.exp(-dt * LEG_RETURN_RATE);
    anim.legFL.rotation.x *= decay;
    anim.legFR.rotation.x *= decay;
    anim.legBL.rotation.x *= decay;
    anim.legBR.rotation.x *= decay;
    anim.torso.position.y = anim.baseTorsoY + (anim.torso.position.y - anim.baseTorsoY) * decay;
    cow.walkPhase *= Math.exp(-dt * 3);
  }

  if (stillInWater) {
    cow.waterBobPhase += dt * COW_WATER_BOB_SPEED;
    cow.waterBobY = Math.sin(cow.waterBobPhase) * COW_WATER_BOB_AMP;
  } else {
    cow.waterBobY = 0;
  }

  syncCowMesh(cow);
}

const SPAWN_FLOOR = new Set([
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.SAND,
  BlockId.STONE,
  BlockId.SNOW,
  BlockId.ICE,
]);

/**
 * @param {import('./world.js').World} world
 * @param {THREE.Scene} scene
 * @param {Array<{ mesh: THREE.Group }>} cows
 * @param {number} [count]
 * @param {number} [centerX]
 * @param {number} [centerZ]
 */
export function spawnCowsAroundWorld(world, scene, cows, count = 10, centerX?, centerZ?) {
  const cx =
    centerX !== undefined && Number.isFinite(centerX) ? Math.floor(centerX) : 0;
  const cz =
    centerZ !== undefined && Number.isFinite(centerZ) ? Math.floor(centerZ) : 0;
  const minR = 6;
  const maxR = 92;
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 200;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const ix = Math.floor(cx + Math.cos(ang) * r);
    const iz = Math.floor(cz + Math.sin(ang) * r);
    const ty = world.topSolidY(ix, iz);
    if (ty < 0) continue;
    const bid = world.get(ix, ty, iz);
    if (!SPAWN_FLOOR.has(bid)) continue;
    if (landSpawnColumnHasFluid(world, ix, ty, iz)) continue;
    const cow = createCow(ix + 0.5, ty + 1 + 0.02, iz + 0.5);
    scene.add(cow.mesh);
    syncCowMesh(cow);
    cows.push(cow);
    placed++;
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {Array<{ mesh: THREE.Group }>} cows
 * @param {number} index
 * @param {THREE.Texture} atlasTex
 * @param {Array<{ mesh: THREE.Mesh, x: number, y: number, z: number, blockId: number, count: number }>} drops
 * @param {import('./world.js').World} world
 */
export function finalizeDeadCow(scene, cows, index, atlasTex, drops, world) {
  const cow = cows[index];
  const dropBeef = createGroundDrop(cow.x, cow.y + 0.2, cow.z, BlockId.BEEF, 1, atlasTex, world);
  scene.add(dropBeef.mesh);
  drops.push(dropBeef);
  if (Math.random() < 0.5) {
    const dropLeather = createGroundDrop(
      cow.x + 0.22,
      cow.y + 0.22,
      cow.z + 0.08,
      BlockId.LEATHER,
      1,
      atlasTex,
    );
    scene.add(dropLeather.mesh);
    drops.push(dropLeather);
  }
  scene.remove(cow.mesh);
  disposeCowMobGroup(cow.mesh);
  cows.splice(index, 1);
}

/**
 * @returns {boolean} true if a cow was hit (including starting death)
 */
export function damageNearestCow(_scene, cows, damage, _atlasTex, _drops, cow, knockDx, knockDz) {
  const idx = cows.indexOf(cow);
  if (idx < 0 || cow.hp <= 0 || cow.state === 'dying') return false;
  cow.hp -= damage;
  cow.hitFlash = HIT_FLASH_DUR;
  playSound('mobMoo');
  const kdx = knockDx ?? 0;
  const kdz = knockDz ?? 0;
  const hlen = Math.hypot(kdx, kdz);
  if (hlen > 1e-5) {
    cow.kvx += (kdx / hlen) * KNOCKBACK_STRENGTH;
    cow.kvz += (kdz / hlen) * KNOCKBACK_STRENGTH;
  }
  if (cow.hp > 0) {
    if (hlen > 1e-5) {
      cow.fleeDirX = kdx / hlen;
      cow.fleeDirZ = kdz / hlen;
    } else {
      const fa = Math.random() * Math.PI * 2;
      cow.fleeDirX = Math.cos(fa);
      cow.fleeDirZ = Math.sin(fa);
    }
    cow.fleeT = 2.5 + Math.random() * 1.5;
    return true;
  }
  cow.state = 'dying';
  cow.deathT = 0;
  cow.hp = 0;
  cow.targetVx = 0;
  cow.targetVz = 0;
  cow.vx *= 0.28;
  cow.vz *= 0.28;
  cow.kvx *= 0.55;
  cow.kvz *= 0.55;
  cow.hitFlash = Math.max(cow.hitFlash, HIT_FLASH_DUR * 0.9);
  cow.mesh.rotation.order = 'YXZ';
  cow.pendingDeathCleanup = false;
  return true;
}
