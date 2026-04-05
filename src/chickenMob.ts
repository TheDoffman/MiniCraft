import * as THREE from 'three';
import { collidesAABB, aabbOverlapsFluid } from './physics';
import { BlockId } from './blocktypes';
import { getColumnWaterSurfaceY } from './mobFluid';
import { getChickenMaterialBundle } from './chickenTextures';
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

export const CHICKEN_HP = 4;
export const CHICKEN_PUNCH_DAMAGE = MOB_PUNCH_DAMAGE;

const WALK_PHASE_SPEED = 14;
const LEG_SWING_MAX = 0.55;
const TORSO_BOB_MAX = 0.028;
const LEG_RETURN_RATE = 11;

const CH_FLOAT_SUBMERGE = 0.42;
const CH_WATER_SPRING = 16;
const CH_WATER_VDAMP = 6;
const CH_WATER_VY_MAX = 3.2;
const CH_WATER_H_DRAG = 2.4;
const CH_WATER_BOB_SPEED = 5.5;
const CH_WATER_BOB_AMP = 0.035;

const HW = 0.22;
const H = 0.44;
const HD = 0.3;

const CH_LEG_LEN = 0.14;
const CH_LEG_W = 0.06;
const CH_LEG_D = 0.06;
const CH_HIP_Y = CH_LEG_LEN;

export function getChickenBodyAABB(chicken: { x: number; y: number; z: number }) {
  return {
    min: [chicken.x - HW, chicken.y, chicken.z - HD] as [number, number, number],
    max: [chicken.x + HW, chicken.y + H, chicken.z + HD] as [number, number, number],
  };
}

export function raycastNearestChicken(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  chickens: { x: number; y: number; z: number; hp: number; state?: string }[],
) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < chickens.length; i++) {
    const c = chickens[i];
    if (c.hp <= 0 || c.state === 'dying') continue;
    const { min, max } = getChickenBodyAABB(c);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = c;
    }
  }
  return best !== null && bestT <= maxDist ? best : null;
}

export function raycastNearestChickenWithT(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  chickens: { x: number; y: number; z: number; hp: number; state?: string }[],
) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < chickens.length; i++) {
    const c = chickens[i];
    if (c.hp <= 0 || c.state === 'dying') continue;
    const { min, max } = getChickenBodyAABB(c);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = c;
    }
  }
  return best !== null && bestT <= maxDist ? { chicken: best, t: bestT } : null;
}

export function createChickenMesh() {
  const b = getChickenMaterialBundle();
  const bodyMat = b.bodyMat.clone();
  const combMat = b.combMat.clone();
  const beakMat = b.beakMat.clone();
  const legMat = b.legMat.clone();
  for (const m of [bodyMat, combMat, beakMat, legMat]) {
    m.emissive = new THREE.Color(0);
    m.emissiveIntensity = 0;
  }

  const group = new THREE.Group();
  const baseTorsoY = 0.2;
  const torso = new THREE.Group();
  torso.position.set(0, baseTorsoY, 0);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.48), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  torso.add(body);

  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), combMat);
  comb.position.set(0, 0.22, 0.12);
  comb.castShadow = true;
  comb.receiveShadow = true;
  torso.add(comb);

  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), beakMat);
  beak.position.set(0, 0.06, 0.32);
  beak.castShadow = true;
  beak.receiveShadow = true;
  torso.add(beak);

  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.28), bodyMat);
  wingL.position.set(0.22, 0.04, 0);
  wingL.castShadow = true;
  wingL.receiveShadow = true;
  torso.add(wingL);

  const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.28), bodyMat);
  wingR.position.set(-0.22, 0.04, 0);
  wingR.castShadow = true;
  wingR.receiveShadow = true;
  torso.add(wingR);

  function legPivot(lx: number, lz: number) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, CH_HIP_Y, lz);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CH_LEG_W, CH_LEG_LEN, CH_LEG_D),
      legMat,
    );
    mesh.position.set(0, -CH_LEG_LEN / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const legL = legPivot(0.1, -0.02);
  const legR = legPivot(-0.1, -0.02);
  group.add(torso);

  return {
    group,
    anim: { torso, legL, legR, wingL, wingR, baseTorsoY },
    materials: [bodyMat, combMat, beakMat, legMat],
  };
}

export function disposeChickenMobGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
}

export function createChicken(x: number, y: number, z: number, hp = CHICKEN_HP) {
  const { group, anim, materials } = createChickenMesh();
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
    state: 'alive' as 'alive' | 'dying',
    deathT: 0,
    deathSinkY: 0,
    pendingDeathCleanup: false,
    pendingEgg: false,
    eggTimer: 120 + Math.random() * 240,
    mesh: group,
    anim,
    materials,
  };
}

export function syncChickenMesh(chicken: {
  deathSinkY?: number;
  state: string;
  waterBobY?: number;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Group;
}) {
  const sink = chicken.deathSinkY ?? 0;
  const bob = chicken.state === 'dying' ? 0 : chicken.waterBobY ?? 0;
  chicken.mesh.position.set(chicken.x, chicken.y + sink + bob, chicken.z);
}

function chickenTryAxis(
  world: import('./world').World,
  chicken: { x: number; y: number; z: number },
  dx: number,
  dy: number,
  dz: number,
) {
  const { min, max } = getChickenBodyAABB(chicken);
  const nx = min[0] + dx;
  const ny = min[1] + dy;
  const nz = min[2] + dz;
  const nmax = [max[0] + dx, max[1] + dy, max[2] + dz];
  if (!collidesAABB(world, [nx, ny, nz], nmax)) {
    chicken.x += dx;
    chicken.y += dy;
    chicken.z += dz;
    return true;
  }
  return false;
}

export function updateChicken(
  chicken: ReturnType<typeof createChicken>,
  world: import('./world').World,
  dt: number,
) {
  updateMobHitFlash(chicken, dt);

  if (chicken.state === 'dying') {
    chicken.deathT += dt;
    const u = Math.min(1, chicken.deathT / DEATH_DUR);
    const e = u * u * (3 - 2 * u);
    chicken.mesh.rotation.x = -e * (Math.PI / 2 * 0.88);
    chicken.mesh.rotation.z = Math.sin(e * Math.PI) * 0.35;
    chicken.mesh.scale.setScalar(Math.max(0.06, 1 - e * 0.85));
    chicken.deathSinkY = -e * e * 0.09;
    const { anim } = chicken;
    const legDecay = Math.exp(-dt * 14);
    anim.legL.rotation.x *= legDecay;
    anim.legR.rotation.x *= legDecay;
    anim.torso.position.y = anim.baseTorsoY;
    if (u >= 1) chicken.pendingDeathCleanup = true;
    syncChickenMesh(chicken);
    return;
  }

  if (chicken.hp <= 0) return;

  chicken.fleeT = (chicken.fleeT ?? 0) - dt;
  if (chicken.fleeT > 0) {
    const fleeSpeed = 2.8;
    chicken.targetVx = (chicken.fleeDirX ?? 0) * fleeSpeed;
    chicken.targetVz = (chicken.fleeDirZ ?? 0) * fleeSpeed;
    chicken.wanderT = 0.8 + Math.random() * 1.5;
  } else {
    chicken.wanderT -= dt;
    if (chicken.wanderT <= 0) {
      chicken.wanderT = 1.2 + Math.random() * 2.8;
      const a = Math.random() * Math.PI * 2;
      chicken.targetVx = Math.cos(a) * 0.78;
      chicken.targetVz = Math.sin(a) * 0.78;
    }
  }

  const k = 1 - Math.exp(-dt * 3.2);
  chicken.vx += (chicken.targetVx - chicken.vx) * k;
  chicken.vz += (chicken.targetVz - chicken.vz) * k;

  const kDecay = Math.exp(-dt * KNOCKBACK_DECAY);
  chicken.kvx *= kDecay;
  chicken.kvz *= kDecay;

  const aabbPre = getChickenBodyAABB(chicken);
  const inWater = aabbOverlapsFluid(world, aabbPre.min, aabbPre.max);
  if (inWater) {
    const hDrag = Math.exp(-dt * CH_WATER_H_DRAG);
    chicken.vx *= hDrag;
    chicken.vz *= hDrag;
    chicken.targetVx *= hDrag;
    chicken.targetVz *= hDrag;
    chicken.kvx *= hDrag;
    chicken.kvz *= hDrag;
  }

  const mx = chicken.vx + chicken.kvx;
  const mz = chicken.vz + chicken.kvz;

  const step = (v: number, axis: 'x' | 'z') => {
    const dist = v * dt;
    const n = Math.ceil(Math.abs(dist) / 0.035);
    const stepV = dist / n;
    for (let i = 0; i < n; i++) {
      if (axis === 'x' && !chickenTryAxis(world, chicken, stepV, 0, 0)) {
        chicken.vx *= -0.45;
        chicken.targetVx *= -0.35;
        chicken.kvx *= -0.38;
        break;
      }
      if (axis === 'z' && !chickenTryAxis(world, chicken, 0, 0, stepV)) {
        chicken.vz *= -0.45;
        chicken.targetVz *= -0.35;
        chicken.kvz *= -0.38;
        break;
      }
    }
  };
  step(mx, 'x');
  step(mz, 'z');

  if (inWater) {
    const surf = getColumnWaterSurfaceY(world, chicken.x, chicken.z);
    if (surf !== null) {
      const targetY = surf - H * CH_FLOAT_SUBMERGE;
      chicken.vy += ((targetY - chicken.y) * CH_WATER_SPRING - chicken.vy * CH_WATER_VDAMP) * dt;
      chicken.vy = Math.max(-CH_WATER_VY_MAX, Math.min(CH_WATER_VY_MAX, chicken.vy));
    } else {
      chicken.vy -= 24 * dt;
    }
  } else {
    chicken.vy -= 24 * dt;
  }

  const dy = chicken.vy * dt;
  const ny = Math.max(1, Math.ceil(Math.abs(dy) / 0.045));
  const sy = dy / ny;
  let landed = false;
  for (let i = 0; i < ny; i++) {
    if (chickenTryAxis(world, chicken, 0, sy, 0)) {
      /* moved */
    } else {
      chicken.vy = 0;
      landed = true;
      break;
    }
  }

  const aabbPost = getChickenBodyAABB(chicken);
  const onGround = collidesAABB(
    world,
    [aabbPost.min[0] + 0.015, aabbPost.min[1] - 0.08, aabbPost.min[2] + 0.015],
    [aabbPost.max[0] - 0.015, aabbPost.min[1] + 0.02, aabbPost.max[2] - 0.015],
  );
  const stillInWater = aabbOverlapsFluid(world, aabbPost.min, aabbPost.max);
  if (!stillInWater && (onGround || landed)) {
    chicken.vy = Math.min(0, chicken.vy);
    const ix = Math.floor(chicken.x);
    const iz = Math.floor(chicken.z);
    const ty = world.topSupportingSolidY(ix, iz, chicken.y);
    if (ty >= 0) {
      const feet = ty + 1 + 0.002;
      if (chicken.y < feet) {
        chicken.y = feet;
        chicken.vy = 0;
      }
    }
  }

  const sp = Math.hypot(mx, mz);
  const { anim } = chicken;
  if (sp > 0.06) {
    chicken.walkPhase += dt * sp * WALK_PHASE_SPEED;
    const s = Math.sin(chicken.walkPhase) * LEG_SWING_MAX;
    const o = Math.sin(chicken.walkPhase + Math.PI) * LEG_SWING_MAX;
    anim.legL.rotation.x = s;
    anim.legR.rotation.x = o;
    anim.torso.position.y = anim.baseTorsoY + Math.abs(Math.sin(chicken.walkPhase * 2)) * TORSO_BOB_MAX;
    const flap = Math.sin(chicken.walkPhase * 3) * 0.35;
    anim.wingL.rotation.z = flap;
    anim.wingR.rotation.z = -flap;

    const targetYaw = Math.atan2(mx, mz);
    let dya = targetYaw - chicken.smoothedYaw;
    while (dya > Math.PI) dya -= Math.PI * 2;
    while (dya < -Math.PI) dya += Math.PI * 2;
    chicken.smoothedYaw += dya * (1 - Math.exp(-dt * YAW_SMOOTH));
    chicken.mesh.rotation.y = chicken.smoothedYaw;
  } else {
    const decay = Math.exp(-dt * LEG_RETURN_RATE);
    anim.legL.rotation.x *= decay;
    anim.legR.rotation.x *= decay;
    anim.wingL.rotation.z *= decay;
    anim.wingR.rotation.z *= decay;
    anim.torso.position.y = anim.baseTorsoY + (anim.torso.position.y - anim.baseTorsoY) * decay;
    chicken.walkPhase *= Math.exp(-dt * 3.5);
  }

  if (stillInWater) {
    chicken.waterBobPhase += dt * CH_WATER_BOB_SPEED;
    chicken.waterBobY = Math.sin(chicken.waterBobPhase) * CH_WATER_BOB_AMP;
  } else {
    chicken.waterBobY = 0;
  }

  chicken.eggTimer -= dt;
  if (chicken.eggTimer <= 0) {
    chicken.eggTimer = 120 + Math.random() * 360;
    chicken.pendingEgg = true;
  }

  syncChickenMesh(chicken);
}

const SPAWN_FLOOR = new Set([
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.SAND,
  BlockId.STONE,
  BlockId.SNOW,
  BlockId.ICE,
]);

export function spawnChickensAroundWorld(
  world: import('./world').World,
  scene: THREE.Scene,
  chickens: ReturnType<typeof createChicken>[],
  count = 10,
  centerX?: number,
  centerZ?: number,
) {
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
    const chicken = createChicken(ix + 0.5, ty + 1 + 0.02, iz + 0.5);
    scene.add(chicken.mesh);
    syncChickenMesh(chicken);
    chickens.push(chicken);
    placed++;
  }
}

export function finalizeDeadChicken(
  scene: THREE.Scene,
  chickens: ReturnType<typeof createChicken>[],
  index: number,
  atlasTex: THREE.Texture,
  drops: ReturnType<typeof createGroundDrop>[],
  world: import('./world').World,
) {
  const chicken = chickens[index];
  const meat = createGroundDrop(chicken.x, chicken.y + 0.16, chicken.z, BlockId.RAW_CHICKEN, 1, atlasTex, world);
  scene.add(meat.mesh);
  drops.push(meat);
  const nFeathers = Math.floor(Math.random() * 3);
  for (let i = 0; i < nFeathers; i++) {
    const ox = (Math.random() - 0.5) * 0.2;
    const oz = (Math.random() - 0.5) * 0.2;
    const f = createGroundDrop(
      chicken.x + ox,
      chicken.y + 0.14,
      chicken.z + oz,
      BlockId.FEATHER,
      1,
      atlasTex,
      world,
    );
    scene.add(f.mesh);
    drops.push(f);
  }
  scene.remove(chicken.mesh);
  disposeChickenMobGroup(chicken.mesh);
  chickens.splice(index, 1);
}

export function damageNearestChicken(
  _scene: THREE.Scene,
  chickens: ReturnType<typeof createChicken>[],
  damage: number,
  _atlasTex: THREE.Texture,
  _drops: unknown[],
  chicken: ReturnType<typeof createChicken>,
  knockDx?: number,
  knockDz?: number,
) {
  const idx = chickens.indexOf(chicken);
  if (idx < 0 || chicken.hp <= 0 || chicken.state === 'dying') return false;
  chicken.hp -= damage;
  chicken.hitFlash = HIT_FLASH_DUR;
  playSound('mobCluck');
  const kdx = knockDx ?? 0;
  const kdz = knockDz ?? 0;
  const hlen = Math.hypot(kdx, kdz);
  if (hlen > 1e-5) {
    chicken.kvx += (kdx / hlen) * KNOCKBACK_STRENGTH;
    chicken.kvz += (kdz / hlen) * KNOCKBACK_STRENGTH;
  }
  if (chicken.hp > 0) {
    if (hlen > 1e-5) {
      chicken.fleeDirX = kdx / hlen;
      chicken.fleeDirZ = kdz / hlen;
    } else {
      const fa = Math.random() * Math.PI * 2;
      chicken.fleeDirX = Math.cos(fa);
      chicken.fleeDirZ = Math.sin(fa);
    }
    chicken.fleeT = 2.0 + Math.random() * 1.5;
    return true;
  }
  chicken.state = 'dying';
  chicken.deathT = 0;
  chicken.hp = 0;
  chicken.targetVx = 0;
  chicken.targetVz = 0;
  chicken.vx *= 0.3;
  chicken.vz *= 0.3;
  chicken.kvx *= 0.5;
  chicken.kvz *= 0.5;
  chicken.hitFlash = Math.max(chicken.hitFlash, HIT_FLASH_DUR * 0.9);
  chicken.mesh.rotation.order = 'YXZ';
  chicken.pendingDeathCleanup = false;
  return true;
}
