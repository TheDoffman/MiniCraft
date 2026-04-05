import * as THREE from 'three';
import { collidesAABB, aabbOverlapsFluid } from './physics';
import { BlockId } from './blocktypes';
import { getColumnWaterSurfaceY } from './mobFluid';
import { getSheepMaterialBundle } from './sheepTextures';
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

export const SHEEP_HP = 10;
export const SHEEP_PUNCH_DAMAGE = MOB_PUNCH_DAMAGE;

const WALK_PHASE_SPEED = 11;
const LEG_SWING_MAX = 0.44;
const TORSO_BOB_MAX = 0.02;
const LEG_RETURN_RATE = 10;

const SHEEP_FLOAT_SUBMERGE = 0.38;
const SHEEP_WATER_SPRING = 14;
const SHEEP_WATER_VDAMP = 5.5;
const SHEEP_WATER_VY_MAX = 3.6;
const SHEEP_WATER_H_DRAG = 2.2;
const SHEEP_WATER_BOB_SPEED = 5.0;
const SHEEP_WATER_BOB_AMP = 0.04;

const HW = 0.36;
const H = 0.64;
const HD = 0.5;

const SHEEP_LEG_LEN = 0.19;
const SHEEP_LEG_W = 0.09;
const SHEEP_LEG_D = 0.09;
const SHEEP_HIP_Y = SHEEP_LEG_LEN;

export function getSheepBodyAABB(sheep: { x: number; y: number; z: number }) {
  return {
    min: [sheep.x - HW, sheep.y, sheep.z - HD] as [number, number, number],
    max: [sheep.x + HW, sheep.y + H, sheep.z + HD] as [number, number, number],
  };
}

export function raycastNearestSheep(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  sheepList: { x: number; y: number; z: number; hp: number; state?: string }[],
) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < sheepList.length; i++) {
    const sheep = sheepList[i];
    if (sheep.hp <= 0 || sheep.state === 'dying') continue;
    const { min, max } = getSheepBodyAABB(sheep);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = sheep;
    }
  }
  return best !== null && bestT <= maxDist ? best : null;
}

export function raycastNearestSheepWithT(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  sheepList: { x: number; y: number; z: number; hp: number; state?: string }[],
) {
  let best = null;
  let bestT = maxDist + 1;
  for (let i = 0; i < sheepList.length; i++) {
    const sheep = sheepList[i];
    if (sheep.hp <= 0 || sheep.state === 'dying') continue;
    const { min, max } = getSheepBodyAABB(sheep);
    const t = rayAabbEnterDistance(ox, oy, oz, dx, dy, dz, min, max, maxDist);
    if (t !== null && t < bestT) {
      bestT = t;
      best = sheep;
    }
  }
  return best !== null && bestT <= maxDist ? { sheep: best, t: bestT } : null;
}

export function createSheepMesh() {
  const b = getSheepMaterialBundle();
  const woolMat = b.woolMat.clone();
  const faceMat = b.faceMat.clone();
  const hoofMat = b.hoofMat.clone();
  for (const m of [woolMat, faceMat, hoofMat]) {
    m.emissive = new THREE.Color(0);
    m.emissiveIntensity = 0;
  }

  const group = new THREE.Group();
  const baseTorsoY = 0.28;
  const torso = new THREE.Group();
  torso.position.set(0, baseTorsoY, 0);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.46, 1.08), woolMat);
  body.castShadow = true;
  body.receiveShadow = true;
  torso.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.42), faceMat);
  head.position.set(0, 0.24, 0.54);
  head.castShadow = true;
  head.receiveShadow = true;
  torso.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.16), faceMat);
  snout.position.set(0, 0.18, 0.82);
  snout.castShadow = true;
  snout.receiveShadow = true;
  torso.add(snout);

  function legPivot(lx: number, lz: number) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, SHEEP_HIP_Y, lz);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(SHEEP_LEG_W, SHEEP_LEG_LEN, SHEEP_LEG_D),
      hoofMat,
    );
    mesh.position.set(0, -SHEEP_LEG_LEN / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const legFL = legPivot(0.23, 0.35);
  const legFR = legPivot(-0.23, 0.35);
  const legBL = legPivot(0.23, -0.35);
  const legBR = legPivot(-0.23, -0.35);
  group.add(torso);

  return {
    group,
    anim: { torso, legFL, legFR, legBL, legBR, baseTorsoY },
    materials: [woolMat, faceMat, hoofMat],
  };
}

export function disposeSheepMobGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
}

export function createSheep(x: number, y: number, z: number, hp = SHEEP_HP) {
  const { group, anim, materials } = createSheepMesh();
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
    mesh: group,
    anim,
    materials,
  };
}

export function syncSheepMesh(sheep: {
  deathSinkY?: number;
  state: string;
  waterBobY?: number;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Group;
}) {
  const sink = sheep.deathSinkY ?? 0;
  const bob = sheep.state === 'dying' ? 0 : sheep.waterBobY ?? 0;
  sheep.mesh.position.set(sheep.x, sheep.y + sink + bob, sheep.z);
}

function sheepTryAxis(
  world: import('./world').World,
  sheep: { x: number; y: number; z: number },
  dx: number,
  dy: number,
  dz: number,
) {
  const { min, max } = getSheepBodyAABB(sheep);
  const nx = min[0] + dx;
  const ny = min[1] + dy;
  const nz = min[2] + dz;
  const nmax = [max[0] + dx, max[1] + dy, max[2] + dz];
  if (!collidesAABB(world, [nx, ny, nz], nmax)) {
    sheep.x += dx;
    sheep.y += dy;
    sheep.z += dz;
    return true;
  }
  return false;
}

export function updateSheep(
  sheep: ReturnType<typeof createSheep>,
  world: import('./world').World,
  dt: number,
) {
  updateMobHitFlash(sheep, dt);

  if (sheep.state === 'dying') {
    sheep.deathT += dt;
    const u = Math.min(1, sheep.deathT / DEATH_DUR);
    const e = u * u * (3 - 2 * u);
    sheep.mesh.rotation.x = -e * (Math.PI / 2 * 0.92);
    sheep.mesh.rotation.z = Math.sin(e * Math.PI) * 0.32;
    sheep.mesh.scale.setScalar(Math.max(0.08, 1 - e * 0.82));
    sheep.deathSinkY = -e * e * 0.11;
    const { anim } = sheep;
    const legDecay = Math.exp(-dt * 14);
    anim.legFL.rotation.x *= legDecay;
    anim.legFR.rotation.x *= legDecay;
    anim.legBL.rotation.x *= legDecay;
    anim.legBR.rotation.x *= legDecay;
    anim.torso.position.y = anim.baseTorsoY;
    if (u >= 1) sheep.pendingDeathCleanup = true;
    syncSheepMesh(sheep);
    return;
  }

  if (sheep.hp <= 0) return;

  sheep.fleeT = (sheep.fleeT ?? 0) - dt;
  if (sheep.fleeT > 0) {
    const fleeSpeed = 2.2;
    sheep.targetVx = (sheep.fleeDirX ?? 0) * fleeSpeed;
    sheep.targetVz = (sheep.fleeDirZ ?? 0) * fleeSpeed;
    sheep.wanderT = 1 + Math.random() * 2;
  } else {
    sheep.wanderT -= dt;
    if (sheep.wanderT <= 0) {
      sheep.wanderT = 2 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      sheep.targetVx = Math.cos(a) * 0.58;
      sheep.targetVz = Math.sin(a) * 0.58;
    }
  }

  const k = 1 - Math.exp(-dt * 2.8);
  sheep.vx += (sheep.targetVx - sheep.vx) * k;
  sheep.vz += (sheep.targetVz - sheep.vz) * k;

  const kDecay = Math.exp(-dt * KNOCKBACK_DECAY);
  sheep.kvx *= kDecay;
  sheep.kvz *= kDecay;

  const aabbPre = getSheepBodyAABB(sheep);
  const inWater = aabbOverlapsFluid(world, aabbPre.min, aabbPre.max);
  if (inWater) {
    const hDrag = Math.exp(-dt * SHEEP_WATER_H_DRAG);
    sheep.vx *= hDrag;
    sheep.vz *= hDrag;
    sheep.targetVx *= hDrag;
    sheep.targetVz *= hDrag;
    sheep.kvx *= hDrag;
    sheep.kvz *= hDrag;
  }

  const mx = sheep.vx + sheep.kvx;
  const mz = sheep.vz + sheep.kvz;

  const step = (v: number, axis: 'x' | 'z') => {
    const dist = v * dt;
    const n = Math.ceil(Math.abs(dist) / 0.04);
    const stepV = dist / n;
    for (let i = 0; i < n; i++) {
      if (axis === 'x' && !sheepTryAxis(world, sheep, stepV, 0, 0)) {
        sheep.vx *= -0.4;
        sheep.targetVx *= -0.3;
        sheep.kvx *= -0.35;
        break;
      }
      if (axis === 'z' && !sheepTryAxis(world, sheep, 0, 0, stepV)) {
        sheep.vz *= -0.4;
        sheep.targetVz *= -0.3;
        sheep.kvz *= -0.35;
        break;
      }
    }
  };
  step(mx, 'x');
  step(mz, 'z');

  if (inWater) {
    const surf = getColumnWaterSurfaceY(world, sheep.x, sheep.z);
    if (surf !== null) {
      const targetY = surf - H * SHEEP_FLOAT_SUBMERGE;
      sheep.vy += ((targetY - sheep.y) * SHEEP_WATER_SPRING - sheep.vy * SHEEP_WATER_VDAMP) * dt;
      sheep.vy = Math.max(-SHEEP_WATER_VY_MAX, Math.min(SHEEP_WATER_VY_MAX, sheep.vy));
    } else {
      sheep.vy -= 22 * dt;
    }
  } else {
    sheep.vy -= 22 * dt;
  }

  const dy = sheep.vy * dt;
  const ny = Math.max(1, Math.ceil(Math.abs(dy) / 0.05));
  const sy = dy / ny;
  let landed = false;
  for (let i = 0; i < ny; i++) {
    if (sheepTryAxis(world, sheep, 0, sy, 0)) {
      /* moved */
    } else {
      sheep.vy = 0;
      landed = true;
      break;
    }
  }

  const aabbPost = getSheepBodyAABB(sheep);
  const onGround = collidesAABB(
    world,
    [aabbPost.min[0] + 0.02, aabbPost.min[1] - 0.1, aabbPost.min[2] + 0.02],
    [aabbPost.max[0] - 0.02, aabbPost.min[1] + 0.02, aabbPost.max[2] - 0.02],
  );
  const stillInWater = aabbOverlapsFluid(world, aabbPost.min, aabbPost.max);
  if (!stillInWater && (onGround || landed)) {
    sheep.vy = Math.min(0, sheep.vy);
    const ix = Math.floor(sheep.x);
    const iz = Math.floor(sheep.z);
    const ty = world.topSupportingSolidY(ix, iz, sheep.y);
    if (ty >= 0) {
      const feet = ty + 1 + 0.002;
      if (sheep.y < feet) {
        sheep.y = feet;
        sheep.vy = 0;
      }
    }
  }

  const sp = Math.hypot(mx, mz);
  const { anim } = sheep;
  if (sp > 0.055) {
    sheep.walkPhase += dt * sp * WALK_PHASE_SPEED;
    const s = Math.sin(sheep.walkPhase) * LEG_SWING_MAX;
    const o = Math.sin(sheep.walkPhase + Math.PI) * LEG_SWING_MAX;
    anim.legFL.rotation.x = s;
    anim.legBR.rotation.x = s;
    anim.legFR.rotation.x = o;
    anim.legBL.rotation.x = o;
    anim.torso.position.y = anim.baseTorsoY + Math.abs(Math.sin(sheep.walkPhase * 2)) * TORSO_BOB_MAX;

    const targetYaw = Math.atan2(mx, mz);
    let dya = targetYaw - sheep.smoothedYaw;
    while (dya > Math.PI) dya -= Math.PI * 2;
    while (dya < -Math.PI) dya += Math.PI * 2;
    sheep.smoothedYaw += dya * (1 - Math.exp(-dt * YAW_SMOOTH));
    sheep.mesh.rotation.y = sheep.smoothedYaw;
  } else {
    const decay = Math.exp(-dt * LEG_RETURN_RATE);
    anim.legFL.rotation.x *= decay;
    anim.legFR.rotation.x *= decay;
    anim.legBL.rotation.x *= decay;
    anim.legBR.rotation.x *= decay;
    anim.torso.position.y = anim.baseTorsoY + (anim.torso.position.y - anim.baseTorsoY) * decay;
    sheep.walkPhase *= Math.exp(-dt * 3);
  }

  if (stillInWater) {
    sheep.waterBobPhase += dt * SHEEP_WATER_BOB_SPEED;
    sheep.waterBobY = Math.sin(sheep.waterBobPhase) * SHEEP_WATER_BOB_AMP;
  } else {
    sheep.waterBobY = 0;
  }

  syncSheepMesh(sheep);
}

const SPAWN_FLOOR = new Set([
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.SAND,
  BlockId.STONE,
  BlockId.SNOW,
  BlockId.ICE,
]);

export function spawnSheepAroundWorld(
  world: import('./world').World,
  scene: THREE.Scene,
  sheepList: ReturnType<typeof createSheep>[],
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
    const sheep = createSheep(ix + 0.5, ty + 1 + 0.02, iz + 0.5);
    scene.add(sheep.mesh);
    syncSheepMesh(sheep);
    sheepList.push(sheep);
    placed++;
  }
}

export function finalizeDeadSheep(
  scene: THREE.Scene,
  sheepList: ReturnType<typeof createSheep>[],
  index: number,
  atlasTex: THREE.Texture,
  drops: ReturnType<typeof createGroundDrop>[],
  world: import('./world').World,
) {
  const sheep = sheepList[index];
  const muttonCount = 1 + (Math.random() < 0.45 ? 1 : 0);
  const d1 = createGroundDrop(sheep.x, sheep.y + 0.2, sheep.z, BlockId.MUTTON, muttonCount, atlasTex, world);
  scene.add(d1.mesh);
  drops.push(d1);
  const d2 = createGroundDrop(sheep.x + 0.12, sheep.y + 0.18, sheep.z + 0.08, BlockId.WOOL, 1, atlasTex, world);
  scene.add(d2.mesh);
  drops.push(d2);
  scene.remove(sheep.mesh);
  disposeSheepMobGroup(sheep.mesh);
  sheepList.splice(index, 1);
}

export function damageNearestSheep(
  _scene: THREE.Scene,
  sheepList: ReturnType<typeof createSheep>[],
  damage: number,
  _atlasTex: THREE.Texture,
  _drops: unknown[],
  sheep: ReturnType<typeof createSheep>,
  knockDx?: number,
  knockDz?: number,
) {
  const idx = sheepList.indexOf(sheep);
  if (idx < 0 || sheep.hp <= 0 || sheep.state === 'dying') return false;
  sheep.hp -= damage;
  sheep.hitFlash = HIT_FLASH_DUR;
  playSound('mobBaa');
  const kdx = knockDx ?? 0;
  const kdz = knockDz ?? 0;
  const hlen = Math.hypot(kdx, kdz);
  if (hlen > 1e-5) {
    sheep.kvx += (kdx / hlen) * KNOCKBACK_STRENGTH;
    sheep.kvz += (kdz / hlen) * KNOCKBACK_STRENGTH;
  }
  if (sheep.hp > 0) {
    if (hlen > 1e-5) {
      sheep.fleeDirX = kdx / hlen;
      sheep.fleeDirZ = kdz / hlen;
    } else {
      const fa = Math.random() * Math.PI * 2;
      sheep.fleeDirX = Math.cos(fa);
      sheep.fleeDirZ = Math.sin(fa);
    }
    sheep.fleeT = 2.5 + Math.random() * 1.5;
    return true;
  }
  sheep.state = 'dying';
  sheep.deathT = 0;
  sheep.hp = 0;
  sheep.targetVx = 0;
  sheep.targetVz = 0;
  sheep.vx *= 0.28;
  sheep.vz *= 0.28;
  sheep.kvx *= 0.55;
  sheep.kvz *= 0.55;
  sheep.hitFlash = Math.max(sheep.hitFlash, HIT_FLASH_DUR * 0.9);
  sheep.mesh.rotation.order = 'YXZ';
  sheep.pendingDeathCleanup = false;
  return true;
}
