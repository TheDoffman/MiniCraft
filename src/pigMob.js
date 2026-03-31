import * as THREE from 'three';
import { collidesAABB, aabbOverlapsFluid } from './physics.js';
import { BlockId } from './blocktypes.js';
import { getPigMaterialBundle } from './pigTextures.js';
import { rayAabbEnterDistance } from './mobRaycast.js';
import {
  updateMobHitFlash,
  HIT_FLASH_DUR,
  KNOCKBACK_STRENGTH,
  KNOCKBACK_DECAY,
  DEATH_DUR,
  YAW_SMOOTH,
  MOB_PUNCH_DAMAGE,
  landSpawnColumnHasFluid,
} from './mobShared.js';
import { createGroundDrop } from './mobDrops.js';

export const PIG_HP = 10;
/** @deprecated Prefer {@link MOB_PUNCH_DAMAGE} from `mobShared.js`; kept for callers importing from `mobs.js`. */
export const PIG_PUNCH_DAMAGE = MOB_PUNCH_DAMAGE;

const WALK_PHASE_SPEED = 12;
const LEG_SWING_MAX = 0.48;
const TORSO_BOB_MAX = 0.022;
const LEG_RETURN_RATE = 10;

const PIG_FLOAT_SUBMERGE = 0.38;
const PIG_WATER_SPRING = 14;
const PIG_WATER_VDAMP = 5.5;
const PIG_WATER_VY_MAX = 3.8;
const PIG_WATER_H_DRAG = 2.2;
/** Visual bob while floating (rad/s and meters); does not affect physics. */
const PIG_WATER_BOB_SPEED = 5.2;
const PIG_WATER_BOB_AMP = 0.042;

const HW = 0.35;
const H = 0.62;
const HD = 0.48;

const PIG_LEG_LEN = 0.2;
const PIG_LEG_W = 0.1;
const PIG_LEG_D = 0.1;
const PIG_HIP_Y = PIG_LEG_LEN;

/** @param {{ x: number, y: number, z: number }} pig */
export function getPigBodyAABB(pig) {
  return {
    min: [pig.x - HW, pig.y, pig.z - HD],
    max: [pig.x + HW, pig.y + H, pig.z + HD],
  };
}

/**
 * @param {Array<{ x: number, y: number, z: number, hp: number }>} pigs
 */
export function raycastNearestPig(ox, oy, oz, dx, dy, dz, maxDist, pigs) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < pigs.length; i++) {
    const pig = pigs[i];
    if (pig.hp <= 0 || pig.state === 'dying') continue;
    const { min, max } = getPigBodyAABB(pig);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = pig;
    }
  }
  return best !== null && bestT <= maxDist ? best : null;
}

/**
 * @param {Array<{ x: number, y: number, z: number, hp: number }>} pigs
 * @returns {{ pig: typeof pigs[0], t: number } | null}
 */
export function raycastNearestPigWithT(ox, oy, oz, dx, dy, dz, maxDist, pigs) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < pigs.length; i++) {
    const pig = pigs[i];
    if (pig.hp <= 0 || pig.state === 'dying') continue;
    const { min, max } = getPigBodyAABB(pig);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = pig;
    }
  }
  return best !== null && bestT <= maxDist ? { pig: best, t: bestT } : null;
}

/**
 * @returns {{ group: THREE.Group, anim: { torso: THREE.Group, legFL: THREE.Group, legFR: THREE.Group, legBL: THREE.Group, legBR: THREE.Group, baseTorsoY: number }, materials: THREE.MeshLambertMaterial[] }}
 */
export function createPigMesh() {
  const b = getPigMaterialBundle();
  const skinMat = b.skinMat.clone();
  const snoutMat = b.snoutMat.clone();
  const hoofMat = b.hoofMat.clone();
  for (const m of [skinMat, snoutMat, hoofMat]) {
    m.emissive = new THREE.Color(0);
    m.emissiveIntensity = 0;
  }

  const group = new THREE.Group();

  const baseTorsoY = 0.27;
  const torso = new THREE.Group();
  torso.position.set(0, baseTorsoY, 0);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 1.05), skinMat);
  body.castShadow = true;
  body.receiveShadow = true;
  torso.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.44), skinMat);
  head.position.set(0, 0.25, 0.52);
  head.castShadow = true;
  head.receiveShadow = true;

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.18), snoutMat);
  snout.position.set(0, 0.21, 0.84);
  snout.castShadow = true;
  snout.receiveShadow = true;
  torso.add(head, snout);

  function legPivot(lx, lz) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, PIG_HIP_Y, lz);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(PIG_LEG_W, PIG_LEG_LEN, PIG_LEG_D),
      hoofMat,
    );
    mesh.position.set(0, -PIG_LEG_LEN / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const legFL = legPivot(0.24, 0.34);
  const legFR = legPivot(-0.24, 0.34);
  const legBL = legPivot(0.24, -0.34);
  const legBR = legPivot(-0.24, -0.34);

  group.add(torso);

  return {
    group,
    anim: { torso, legFL, legFR, legBL, legBR, baseTorsoY },
    materials: [skinMat, snoutMat, hoofMat],
  };
}

export function disposePigMobGroup(group) {
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
export function createPig(x, y, z, hp = PIG_HP) {
  const { group, anim, materials } = createPigMesh();
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

export function syncPigMesh(pig) {
  const sink = pig.deathSinkY ?? 0;
  const bob = pig.state === 'dying' ? 0 : pig.waterBobY ?? 0;
  pig.mesh.position.set(pig.x, pig.y + sink + bob, pig.z);
}

/** Top Y (world) of the highest water block in this column, or null. */
function getWaterSurfaceY(world, x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  if (!world.inBounds(ix, 0, iz)) return null;
  let top = -1;
  const h = world.height;
  for (let yy = 0; yy < h; yy++) {
    if (world.get(ix, yy, iz) === BlockId.WATER) top = yy;
  }
  return top < 0 ? null : top + 1;
}

function pigTryAxis(world, pig, dx, dy, dz) {
  const { min, max } = getPigBodyAABB(pig);
  const nx = min[0] + dx;
  const ny = min[1] + dy;
  const nz = min[2] + dz;
  const nmax = [max[0] + dx, max[1] + dy, max[2] + dz];
  if (!collidesAABB(world, [nx, ny, nz], nmax)) {
    pig.x += dx;
    pig.y += dy;
    pig.z += dz;
    return true;
  }
  return false;
}

/**
 * @param {import('./world.js').World} world
 */
export function updatePig(pig, world, dt) {
  updateMobHitFlash(pig, dt);

  if (pig.state === 'dying') {
    pig.deathT += dt;
    const u = Math.min(1, pig.deathT / DEATH_DUR);
    const e = u * u * (3 - 2 * u);
    pig.mesh.rotation.x = -e * (Math.PI / 2 * 0.92);
    pig.mesh.rotation.z = Math.sin(e * Math.PI) * 0.32;
    pig.mesh.scale.setScalar(Math.max(0.08, 1 - e * 0.82));
    pig.deathSinkY = -e * e * 0.11;
    const { anim } = pig;
    const legDecay = Math.exp(-dt * 14);
    anim.legFL.rotation.x *= legDecay;
    anim.legFR.rotation.x *= legDecay;
    anim.legBL.rotation.x *= legDecay;
    anim.legBR.rotation.x *= legDecay;
    anim.torso.position.y = anim.baseTorsoY;
    if (u >= 1) pig.pendingDeathCleanup = true;
    syncPigMesh(pig);
    return;
  }

  if (pig.hp <= 0) return;

  pig.wanderT -= dt;
  if (pig.wanderT <= 0) {
    pig.wanderT = 2 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2;
    pig.targetVx = Math.cos(a) * 0.62;
    pig.targetVz = Math.sin(a) * 0.62;
  }

  const k = 1 - Math.exp(-dt * 2.8);
  pig.vx += (pig.targetVx - pig.vx) * k;
  pig.vz += (pig.targetVz - pig.vz) * k;

  const kDecay = Math.exp(-dt * KNOCKBACK_DECAY);
  pig.kvx *= kDecay;
  pig.kvz *= kDecay;

  const aabbPre = getPigBodyAABB(pig);
  const inWater = aabbOverlapsFluid(world, aabbPre.min, aabbPre.max);
  if (inWater) {
    const hDrag = Math.exp(-dt * PIG_WATER_H_DRAG);
    pig.vx *= hDrag;
    pig.vz *= hDrag;
    pig.targetVx *= hDrag;
    pig.targetVz *= hDrag;
    pig.kvx *= hDrag;
    pig.kvz *= hDrag;
  }

  const mx = pig.vx + pig.kvx;
  const mz = pig.vz + pig.kvz;

  const step = (v, axis) => {
    const dist = v * dt;
    const n = Math.ceil(Math.abs(dist) / 0.04);
    const stepV = dist / n;
    for (let i = 0; i < n; i++) {
      if (axis === 'x' && !pigTryAxis(world, pig, stepV, 0, 0)) {
        pig.vx *= -0.4;
        pig.targetVx *= -0.3;
        pig.kvx *= -0.35;
        break;
      }
      if (axis === 'z' && !pigTryAxis(world, pig, 0, 0, stepV)) {
        pig.vz *= -0.4;
        pig.targetVz *= -0.3;
        pig.kvz *= -0.35;
        break;
      }
    }
  };
  step(mx, 'x');
  step(mz, 'z');

  if (inWater) {
    const surf = getWaterSurfaceY(world, pig.x, pig.z);
    if (surf !== null) {
      const targetY = surf - H * PIG_FLOAT_SUBMERGE;
      pig.vy += ((targetY - pig.y) * PIG_WATER_SPRING - pig.vy * PIG_WATER_VDAMP) * dt;
      pig.vy = Math.max(-PIG_WATER_VY_MAX, Math.min(PIG_WATER_VY_MAX, pig.vy));
    } else {
      pig.vy -= 22 * dt;
    }
  } else {
    pig.vy -= 22 * dt;
  }

  const dy = pig.vy * dt;
  const n = Math.max(1, Math.ceil(Math.abs(dy) / 0.05));
  const sy = dy / n;
  let landed = false;
  for (let i = 0; i < n; i++) {
    if (pigTryAxis(world, pig, 0, sy, 0)) {
      /* moved */
    } else {
      pig.vy = 0;
      landed = true;
      break;
    }
  }

  const aabbPost = getPigBodyAABB(pig);
  const onGround = collidesAABB(
    world,
    [aabbPost.min[0] + 0.02, aabbPost.min[1] - 0.1, aabbPost.min[2] + 0.02],
    [aabbPost.max[0] - 0.02, aabbPost.min[1] + 0.02, aabbPost.max[2] - 0.02],
  );
  const stillInWater = aabbOverlapsFluid(world, aabbPost.min, aabbPost.max);
  if (!stillInWater && (onGround || landed)) {
    pig.vy = Math.min(0, pig.vy);
    const ix = Math.floor(pig.x);
    const iz = Math.floor(pig.z);
    const ty = world.topSolidY(ix, iz);
    if (ty >= 0) {
      const feet = ty + 1 + 0.002;
      if (pig.y < feet) {
        pig.y = feet;
        pig.vy = 0;
      }
    }
  }

  const sp = Math.hypot(mx, mz);
  const { anim } = pig;
  if (sp > 0.055) {
    pig.walkPhase += dt * sp * WALK_PHASE_SPEED;
    const s = Math.sin(pig.walkPhase) * LEG_SWING_MAX;
    const o = Math.sin(pig.walkPhase + Math.PI) * LEG_SWING_MAX;
    anim.legFL.rotation.x = s;
    anim.legBR.rotation.x = s;
    anim.legFR.rotation.x = o;
    anim.legBL.rotation.x = o;
    anim.torso.position.y = anim.baseTorsoY + Math.abs(Math.sin(pig.walkPhase * 2)) * TORSO_BOB_MAX;

    const targetYaw = Math.atan2(mx, mz);
    let dya = targetYaw - pig.smoothedYaw;
    while (dya > Math.PI) dya -= Math.PI * 2;
    while (dya < -Math.PI) dya += Math.PI * 2;
    pig.smoothedYaw += dya * (1 - Math.exp(-dt * YAW_SMOOTH));
    pig.mesh.rotation.y = pig.smoothedYaw;
  } else {
    const decay = Math.exp(-dt * LEG_RETURN_RATE);
    anim.legFL.rotation.x *= decay;
    anim.legFR.rotation.x *= decay;
    anim.legBL.rotation.x *= decay;
    anim.legBR.rotation.x *= decay;
    anim.torso.position.y = anim.baseTorsoY + (anim.torso.position.y - anim.baseTorsoY) * decay;
    pig.walkPhase *= Math.exp(-dt * 3);
  }

  if (stillInWater) {
    pig.waterBobPhase += dt * PIG_WATER_BOB_SPEED;
    pig.waterBobY = Math.sin(pig.waterBobPhase) * PIG_WATER_BOB_AMP;
  } else {
    pig.waterBobY = 0;
  }

  syncPigMesh(pig);
}

const SPAWN_FLOOR = new Set([
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.SAND,
  BlockId.STONE,
]);

/**
 * @param {import('./world.js').World} world
 * @param {THREE.Scene} scene
 * @param {Array<{ mesh: THREE.Group }>} pigs
 * @param {number} [count]
 * @param {number} [centerX]
 * @param {number} [centerZ]
 */
export function spawnPigsAroundWorld(world, scene, pigs, count = 14, centerX, centerZ) {
  const cx =
    centerX !== undefined && Number.isFinite(centerX) ? Math.floor(centerX) : 0;
  const cz =
    centerZ !== undefined && Number.isFinite(centerZ) ? Math.floor(centerZ) : 0;
  const minR = 4;
  const maxR = 88;
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
    const pig = createPig(ix + 0.5, ty + 1 + 0.02, iz + 0.5);
    scene.add(pig.mesh);
    syncPigMesh(pig);
    pigs.push(pig);
    placed++;
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {Array<{ mesh: THREE.Group }>} pigs
 * @param {number} index
 * @param {THREE.Texture} atlasTex
 * @param {Array<{ mesh: THREE.Mesh, x: number, y: number, z: number, blockId: number, count: number }>} drops
 * @param {import('./world.js').World} world
 */
export function finalizeDeadPig(scene, pigs, index, atlasTex, drops, world) {
  const pig = pigs[index];
  const drop = createGroundDrop(pig.x, pig.y + 0.2, pig.z, BlockId.PORKCHOP, 1, atlasTex, world);
  scene.add(drop.mesh);
  drops.push(drop);
  scene.remove(pig.mesh);
  disposePigMobGroup(pig.mesh);
  pigs.splice(index, 1);
}

/**
 * @returns {boolean} true if a pig was hit (including starting death)
 */
export function damageNearestPig(_scene, pigs, damage, _atlasTex, _drops, pig, knockDx, knockDz) {
  const idx = pigs.indexOf(pig);
  if (idx < 0 || pig.hp <= 0 || pig.state === 'dying') return false;
  pig.hp -= damage;
  pig.hitFlash = HIT_FLASH_DUR;
  const kdx = knockDx ?? 0;
  const kdz = knockDz ?? 0;
  const hlen = Math.hypot(kdx, kdz);
  if (hlen > 1e-5) {
    pig.kvx += (kdx / hlen) * KNOCKBACK_STRENGTH;
    pig.kvz += (kdz / hlen) * KNOCKBACK_STRENGTH;
  }
  if (pig.hp > 0) return true;
  pig.state = 'dying';
  pig.deathT = 0;
  pig.hp = 0;
  pig.targetVx = 0;
  pig.targetVz = 0;
  pig.vx *= 0.28;
  pig.vz *= 0.28;
  pig.kvx *= 0.55;
  pig.kvz *= 0.55;
  pig.hitFlash = Math.max(pig.hitFlash, HIT_FLASH_DUR * 0.9);
  pig.mesh.rotation.order = 'YXZ';
  pig.pendingDeathCleanup = false;
  return true;
}
