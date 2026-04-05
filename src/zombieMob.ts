/**
 * Zombie hostile mob — spawns at night, chases the player, deals contact damage.
 */
import * as THREE from 'three';
import { collidesAABB } from './physics';
import { BlockId } from './blocktypes';
import { playSound } from './sound';
import { createGroundDrop } from './mobDrops';
import { getZombieMaterialBundle } from './zombieTextures';
import { rayAabbEnterDistance } from './mobRaycast';
import { raycastBlocks } from './raycast';
import {
  updateMobHitFlash,
  HIT_FLASH_DUR,
  KNOCKBACK_STRENGTH,
  KNOCKBACK_DECAY,
  DEATH_DUR,
  YAW_SMOOTH,
  landSpawnColumnHasFluid,
} from './mobShared';

export const ZOMBIE_HP = 20;
export const ZOMBIE_ATTACK_DAMAGE = 8;
const ZOMBIE_SPEED = 2.2;
const ZOMBIE_AGGRO_RANGE = 18;
const ZOMBIE_ATTACK_RANGE = 1.4;
const ZOMBIE_ATTACK_COOLDOWN = 1.0;
const GRAVITY = -28;

const HW = 0.28;
const H = 1.7;
const HD = 0.28;

const WALK_PHASE_SPEED = 8;
const LEG_SWING_MAX = 0.5;
const ARM_SWING_MAX = 0.8;

const SPAWN_FLOOR = new Set([
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.STONE,
  BlockId.SAND,
  BlockId.PLANKS,
  BlockId.COBBLE,
  BlockId.GLASS,
]);

/**
 * Zombies spawn on outdoor surfaces (open column to sky) so caves stay safer.
 * @param {import('./world.js').World} world
 */
export function zombieSpawnSkyClear(world, ix, iz, groundY) {
  const h = world.height;
  for (let y = groundY + 1; y < h; y++) {
    const id = world.get(ix, y, iz);
    if (id === BlockId.AIR || id === BlockId.WATER) continue;
    if (id === BlockId.LEAVES) continue;
    return false;
  }
  return true;
}

export function getZombieBodyAABB(z) {
  return {
    min: [z.x - HW, z.y, z.z - HD],
    max: [z.x + HW, z.y + H, z.z + HD],
  };
}

export function raycastNearestZombieWithT(ox, oy, oz, dx, dy, dz, maxDist, zombies) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.state === 'dying' || z.hp <= 0) continue;
    const { min, max } = getZombieBodyAABB(z);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = { zombie: z, t };
    }
  }
  return best;
}

function createZombieMesh() {
  const { bodyMat } = getZombieMaterialBundle();
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.18);
  const leftLeg = new THREE.Mesh(legGeo, bodyMat);
  leftLeg.position.set(-0.12, 0.3, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, bodyMat);
  rightLeg.position.set(0.12, 0.3, 0);
  rightLeg.castShadow = true;
  group.add(leftLeg, rightLeg);

  // Arms (extended forward — zombie pose)
  const armGeo = new THREE.BoxGeometry(0.15, 0.55, 0.15);
  const leftArm = new THREE.Mesh(armGeo, bodyMat);
  leftArm.position.set(-0.35, 1.15, -0.3);
  leftArm.rotation.x = -Math.PI / 2.2;
  leftArm.castShadow = true;
  const rightArm = new THREE.Mesh(armGeo, bodyMat);
  rightArm.position.set(0.35, 1.15, -0.3);
  rightArm.rotation.x = -Math.PI / 2.2;
  rightArm.castShadow = true;
  group.add(leftArm, rightArm);

  group.userData = { leftLeg, rightLeg, leftArm, rightArm, head };
  return group;
}

export function disposeZombieMobGroup(mesh) {
  mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
}

export function createZombie(x, y, z, hp = ZOMBIE_HP) {
  const mesh = createZombieMesh();
  const { bodyMat } = getZombieMaterialBundle();
  return {
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    kbVx: 0,
    kbVz: 0,
    hp,
    yaw: Math.random() * Math.PI * 2,
    mesh,
    state: 'idle',
    walkPhase: 0,
    hitFlash: 0,
    deathTimer: 0,
    pendingDeathCleanup: false,
    attackCooldown: 0,
    materials: [bodyMat],
  };
}

export function syncZombieMesh(z) {
  z.mesh.position.set(z.x, z.y, z.z);
  z.mesh.rotation.y = z.yaw;
}

/**
 * @param {{ x: number, y: number, z: number }} playerPos
 */
export function updateZombie(zombie, world, dt, playerPos) {
  if (zombie.state === 'dying') {
    zombie.deathTimer += dt;
    zombie.mesh.rotation.x = Math.min(Math.PI / 2, zombie.deathTimer / DEATH_DUR * (Math.PI / 2));
    zombie.mesh.position.y = zombie.y - zombie.deathTimer * 0.3;
    if (zombie.deathTimer >= DEATH_DUR) {
      zombie.pendingDeathCleanup = true;
    }
    updateMobHitFlash(zombie, dt);
    return;
  }

  zombie.kbVx ??= 0;
  zombie.kbVz ??= 0;

  zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);

  zombie.kbVx *= Math.exp(-KNOCKBACK_DECAY * dt);
  zombie.kbVz *= Math.exp(-KNOCKBACK_DECAY * dt);
  if (Math.abs(zombie.kbVx) < 0.02) zombie.kbVx = 0;
  if (Math.abs(zombie.kbVz) < 0.02) zombie.kbVz = 0;

  // Chase player if in range
  const dx = playerPos.x - zombie.x;
  const dz = playerPos.z - zombie.z;
  const dist = Math.hypot(dx, dz);
  let moving = false;

  if (dist < ZOMBIE_AGGRO_RANGE && dist > 0.3) {
    const nx = dx / dist;
    const nz = dz / dist;
    const targetYaw = Math.atan2(-nx, -nz);
    let diff = targetYaw - zombie.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    zombie.yaw += diff * Math.min(1, dt * YAW_SMOOTH);

    const chaseVx = -Math.sin(zombie.yaw) * ZOMBIE_SPEED;
    const chaseVz = -Math.cos(zombie.yaw) * ZOMBIE_SPEED;
    zombie.vx = chaseVx + zombie.kbVx;
    zombie.vz = chaseVz + zombie.kbVz;
    moving = true;
  } else {
    zombie.vx = zombie.kbVx * 0.85;
    zombie.vz = zombie.kbVz * 0.85;
    if (Math.hypot(zombie.vx, zombie.vz) < 0.05) {
      zombie.vx = 0;
      zombie.vz = 0;
    }
  }

  // Gravity
  zombie.vy += GRAVITY * dt;

  // Move with collision
  tryMoveZombie(zombie, world, zombie.vx * dt, 0, 0);
  tryMoveZombie(zombie, world, 0, zombie.vy * dt, 0);
  tryMoveZombie(zombie, world, 0, 0, zombie.vz * dt);

  // Auto-jump when blocked horizontally
  if (moving) {
    const { min, max } = getZombieBodyAABB(zombie);
    const fwd = 0.15;
    const fx = zombie.x - Math.sin(zombie.yaw) * fwd;
    const fz = zombie.z - Math.cos(zombie.yaw) * fwd;
    const blocked = collidesAABB(world,
      [fx - HW, zombie.y + 0.1, fz - HD],
      [fx + HW, zombie.y + H * 0.5, fz + HD]
    );
    const groundBelow = collidesAABB(world,
      [min[0], min[1] - 0.05, min[2]],
      [max[0], min[1], max[2]]
    );
    if (blocked && groundBelow) {
      zombie.vy = 7.5;
    }
  }

  // Walk animation (legs + slight arm swing)
  if (moving) {
    zombie.walkPhase += dt * WALK_PHASE_SPEED;
    const swing = Math.sin(zombie.walkPhase);
    const ud = zombie.mesh.userData;
    if (ud.leftLeg) ud.leftLeg.rotation.x = swing * LEG_SWING_MAX;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -swing * LEG_SWING_MAX;
    const armSwing = swing * ARM_SWING_MAX * 0.35;
    if (ud.leftArm) ud.leftArm.rotation.x = -Math.PI / 2.2 + armSwing;
    if (ud.rightArm) ud.rightArm.rotation.x = -Math.PI / 2.2 - armSwing;
  } else {
    const ud = zombie.mesh.userData;
    if (ud.leftLeg) ud.leftLeg.rotation.x *= 0.9;
    if (ud.rightLeg) ud.rightLeg.rotation.x *= 0.9;
    if (ud.leftArm) ud.leftArm.rotation.x += (-Math.PI / 2.2 - ud.leftArm.rotation.x) * 0.12;
    if (ud.rightArm) ud.rightArm.rotation.x += (-Math.PI / 2.2 - ud.rightArm.rotation.x) * 0.12;
  }

  syncZombieMesh(zombie);
  updateMobHitFlash(zombie, dt);
}

function tryMoveZombie(zombie, world, dx, dy, dz) {
  const { min, max } = getZombieBodyAABB(zombie);
  const nmin = [min[0] + dx, min[1] + dy, min[2] + dz];
  const nmax = [max[0] + dx, max[1] + dy, max[2] + dz];
  if (!collidesAABB(world, nmin, nmax)) {
    zombie.x += dx;
    zombie.y += dy;
    zombie.z += dz;
  } else if (dy < 0) {
    zombie.vy = 0;
  }
}

/**
 * Check if zombie is touching the player and deal damage.
 * @returns {number} damage dealt this frame (0 if none)
 */
export function zombieContactDamage(zombie, player, world) {
  if (zombie.state === 'dying' || zombie.attackCooldown > 0) return 0;
  const dx = player.x - zombie.x;
  const dz = player.z - zombie.z;
  const dy = (player.y + player.height * 0.5) - (zombie.y + H * 0.5);
  const hDist = Math.hypot(dx, dz);
  if (hDist >= ZOMBIE_ATTACK_RANGE || Math.abs(dy) >= H) return 0;

  const ox = zombie.x;
  const oy = zombie.y + H * 0.85;
  const oz = zombie.z;
  const px = player.x;
  const py = player.y + player.height * 0.9;
  const pz = player.z;
  const rdx = px - ox;
  const rdy = py - oy;
  const rdz = pz - oz;
  const reach = Math.hypot(rdx, rdy, rdz) + 0.01;
  const hit = raycastBlocks(world, ox, oy, oz, rdx, rdy, rdz, reach);
  if (hit && hit.t < reach - 0.12) return 0;

  zombie.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
  return ZOMBIE_ATTACK_DAMAGE;
}

export function damageZombie(scene, zombies, damage, zombie, dx, dz) {
  zombie.hp = Math.max(0, zombie.hp - damage);
  zombie.hitFlash = HIT_FLASH_DUR;
  playSound('zombieHurt');
  const len = Math.hypot(dx, dz) || 1;
  zombie.kbVx += (dx / len) * KNOCKBACK_STRENGTH;
  zombie.kbVz += (dz / len) * KNOCKBACK_STRENGTH;
  if (zombie.hp <= 0) {
    zombie.state = 'dying';
    zombie.deathTimer = 0;
  }
}

/**
 * @param {import('three').Scene} scene
 * @param {unknown[]} zombies
 * @param {number} index
 * @param {import('three').Texture} atlasTex
 * @param {Array<{ mesh: import('three').Object3D }>} drops
 */
export function finalizeDeadZombie(scene, zombies, index, atlasTex, drops) {
  const z = zombies[index];
  const rf = createGroundDrop(z.x, z.y + 0.35, z.z, BlockId.ROTTEN_FLESH, 1 + Math.floor(Math.random() * 2), atlasTex);
  scene.add(rf.mesh);
  drops.push(rf);
  if (Math.random() < 0.33) {
    const ng = createGroundDrop(
      z.x + 0.18,
      z.y + 0.32,
      z.z + 0.06,
      BlockId.IRON_NUGGET,
      1,
      atlasTex,
    );
    scene.add(ng.mesh);
    drops.push(ng);
  }
  scene.remove(z.mesh);
  disposeZombieMobGroup(z.mesh);
  zombies.splice(index, 1);
}

export function spawnZombiesAroundPlayer(world, scene, zombies, count, px, pz) {
  const margin = 2;
  const minR = 16;
  const maxR = 42;
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 150;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const ix = Math.floor(px + Math.cos(ang) * r);
    const iz = Math.floor(pz + Math.sin(ang) * r);
    const ty = world.topSolidY(ix, iz);
    if (ty < 0) continue;
    const bid = world.get(ix, ty, iz);
    if (!SPAWN_FLOOR.has(bid)) continue;
    if (landSpawnColumnHasFluid(world, ix, ty, iz)) continue;
    if (!zombieSpawnSkyClear(world, ix, iz, ty)) continue;
    const z = createZombie(ix + 0.5, ty + 1 + 0.02, iz + 0.5);
    scene.add(z.mesh);
    syncZombieMesh(z);
    zombies.push(z);
    placed++;
  }
}
