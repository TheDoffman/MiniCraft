import { collidesAABB, aabbIntersects3D, overlapDepths3D } from './physics';
import type { Player } from './player';
import type { World } from './world';
import { getPigBodyAABB } from './pigMob';
import { getCowBodyAABB } from './cowMob';
import { getSheepBodyAABB } from './sheepMob';
import { getChickenBodyAABB } from './chickenMob';
import { getZombieBodyAABB } from './zombieMob';
import { getSquidBodyAABB } from './squidMob';

/** Extra padding so separated boxes do not re-touch next frame. */
const SEP_EPS = 0.02;
/** Ignore vertical overlap this small (no meaningful standing interaction). */
const MIN_VERTICAL_OVERLAP = 0.08;
const BUMP_STRENGTH = 3.4;
const BUMP_PEN_CAP = 0.22;
/** Player takes this fraction of horizontal separation vs a mob (mob gets the rest). */
const PLAYER_SEP_SHARE = 0.22;

type MobBox = { min: number[]; max: number[] };

const landMobColliderPool: MobBox[] = [];
let landMobColliderCount = 0;

function borrowMobBox(min: number[], max: number[]): MobBox {
  let b = landMobColliderPool[landMobColliderCount];
  if (!b) {
    b = { min: [0, 0, 0], max: [0, 0, 0] };
    landMobColliderPool[landMobColliderCount] = b;
  }
  b.min[0] = min[0];
  b.min[1] = min[1];
  b.min[2] = min[2];
  b.max[0] = max[0];
  b.max[1] = max[1];
  b.max[2] = max[2];
  landMobColliderCount += 1;
  return b;
}

export type LandMobColliderList = { boxes: MobBox[]; count: number };

/** Shared shape for land mobs in collision lists (vx/vz for bump impulses). */
export type LandMobLike = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  state?: string;
};

function aliveMob(m: { hp: number; state?: string }) {
  return m.hp > 0 && m.state !== 'dying';
}

/**
 * Static mob AABBs for the player’s movement test (same frame, before mobs step).
 */
export function buildLandMobColliderBoxes(
  pigs: LandMobLike[],
  cows: LandMobLike[],
  sheep: LandMobLike[],
  chickens: LandMobLike[],
  zombies: LandMobLike[],
  squids: LandMobLike[],
): LandMobColliderList {
  landMobColliderCount = 0;
  const push = (m: LandMobLike, getAabb: (o: LandMobLike) => { min: number[]; max: number[] }) => {
    if (!aliveMob(m)) return;
    const { min, max } = getAabb(m);
    borrowMobBox(min, max);
  };
  for (let i = 0; i < pigs.length; i++) push(pigs[i], getPigBodyAABB);
  for (let i = 0; i < cows.length; i++) push(cows[i], getCowBodyAABB);
  for (let i = 0; i < sheep.length; i++) push(sheep[i], getSheepBodyAABB);
  for (let i = 0; i < chickens.length; i++) push(chickens[i], getChickenBodyAABB);
  for (let i = 0; i < zombies.length; i++) push(zombies[i], getZombieBodyAABB);
  for (let i = 0; i < squids.length; i++) push(squids[i], getSquidBodyAABB);
  return { boxes: landMobColliderPool, count: landMobColliderCount };
}

type ColBody = {
  isPlayer: boolean;
  getAabb: () => { min: number[]; max: number[] };
  tryOffset: (dx: number, dz: number, world: World) => boolean;
  bump: (dvx: number, dvz: number) => void;
};

function addMobCollisionBodies(
  bodies: ColBody[],
  world: World,
  arr: LandMobLike[],
  getAabb: (m: LandMobLike) => { min: number[]; max: number[] },
) {
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (!aliveMob(m)) continue;
    bodies.push({
      isPlayer: false,
      getAabb: () => getAabb(m),
      tryOffset(dx, dz, w) {
        m.x += dx;
        m.z += dz;
        const { min, max } = getAabb(m);
        if (collidesAABB(w, min, max)) {
          m.x -= dx;
          m.z -= dz;
          return false;
        }
        return true;
      },
      bump(dvx, dvz) {
        m.vx += dvx;
        m.vz += dvz;
      },
    });
  }
}

/** Zombies overwrite `vx`/`vz` from chase AI each frame — route separation bumps into knockback so they persist. */
function addZombieCollisionBodies(
  bodies: ColBody[],
  world: World,
  arr: LandMobLike[],
  getAabb: (m: LandMobLike) => { min: number[]; max: number[] },
) {
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i] as LandMobLike & { kbVx?: number; kbVz?: number };
    if (!aliveMob(m)) continue;
    bodies.push({
      isPlayer: false,
      getAabb: () => getAabb(m),
      tryOffset(dx, dz, w) {
        m.x += dx;
        m.z += dz;
        const { min, max } = getAabb(m);
        if (collidesAABB(w, min, max)) {
          m.x -= dx;
          m.z -= dz;
          return false;
        }
        return true;
      },
      bump(dvx, dvz) {
        m.kbVx = (m.kbVx ?? 0) + dvx;
        m.kbVz = (m.kbVz ?? 0) + dvz;
      },
    });
  }
}

function buildBodies(
  world: World,
  player: Player,
  includePlayer: boolean,
  pigs: LandMobLike[],
  cows: LandMobLike[],
  sheep: LandMobLike[],
  chickens: LandMobLike[],
  zombies: LandMobLike[],
  squids: LandMobLike[],
): ColBody[] {
  const bodies: ColBody[] = [];
  if (includePlayer) {
    bodies.push({
      isPlayer: true,
      getAabb: () => player.aabb(),
      tryOffset(dx, dz, w) {
        player.x += dx;
        player.z += dz;
        const { min, max } = player.aabb();
        if (collidesAABB(w, min, max)) {
          player.x -= dx;
          player.z -= dz;
          return false;
        }
        return true;
      },
      bump(dvx, dvz) {
        player.vx += dvx;
        player.vz += dvz;
      },
    });
  }

  addMobCollisionBodies(bodies, world, pigs, getPigBodyAABB);
  addMobCollisionBodies(bodies, world, cows, getCowBodyAABB);
  addMobCollisionBodies(bodies, world, sheep, getSheepBodyAABB);
  addMobCollisionBodies(bodies, world, chickens, getChickenBodyAABB);
  addZombieCollisionBodies(bodies, world, zombies, getZombieBodyAABB);
  addMobCollisionBodies(bodies, world, squids, getSquidBodyAABB);

  return bodies;
}

/**
 * Push apart overlapping land mobs and the player on X/Z, with a small velocity bump.
 * Call once per frame after all mob AI movement.
 */
export function resolveLandMobEntityCollisions(
  world: World,
  player: Player,
  opts: {
    playerDead: boolean;
    playerFlying: boolean;
    pigs: LandMobLike[];
    cows: LandMobLike[];
    sheep: LandMobLike[];
    chickens: LandMobLike[];
    zombies: LandMobLike[];
    squids: LandMobLike[];
  },
) {
  const includePlayer = !opts.playerDead && !opts.playerFlying;
  const bodies = buildBodies(
    world,
    player,
    includePlayer,
    opts.pigs,
    opts.cows,
    opts.sheep,
    opts.chickens,
    opts.zombies,
    opts.squids,
  );
  if (bodies.length < 2) return;

  const iterations = 5;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const A = bodies[i];
        const B = bodies[j];
        const { min: amin, max: amax } = A.getAabb();
        const { min: bmin, max: bmax } = B.getAabb();
        if (!aabbIntersects3D(amin, amax, bmin, bmax)) continue;

        const { ox, oy, oz } = overlapDepths3D(amin, amax, bmin, bmax);
        if (ox <= 0 || oy <= 0 || oz <= 0) continue;
        if (oy < MIN_VERTICAL_OVERLAP) continue;

        const useX = ox < oz;
        const pen = useX ? ox : oz;
        if (pen <= 0) continue;

        const sep = pen + SEP_EPS;
        const axis = useX ? 0 : 2;
        const cA = (amin[axis] + amax[axis]) * 0.5;
        const cB = (bmin[axis] + bmax[axis]) * 0.5;
        let sign = Math.sign(cB - cA);
        if (sign === 0) sign = axis === 0 ? 1 : -1;

        let shareA: number;
        let shareB: number;
        if (A.isPlayer && !B.isPlayer) {
          shareA = PLAYER_SEP_SHARE;
          shareB = 1 - PLAYER_SEP_SHARE;
        } else if (!A.isPlayer && B.isPlayer) {
          shareA = 1 - PLAYER_SEP_SHARE;
          shareB = PLAYER_SEP_SHARE;
        } else {
          shareA = 0.5;
          shareB = 0.5;
        }

        const dAx = useX ? -sign * sep * shareA : 0;
        const dAz = useX ? 0 : -sign * sep * shareA;
        const dBx = useX ? sign * sep * shareB : 0;
        const dBz = useX ? 0 : sign * sep * shareB;

        const okA = A.tryOffset(dAx, dAz, world);
        const okB = B.tryOffset(dBx, dBz, world);
        if (!okA && !okB) continue;
        if (!okA && okB) {
          B.tryOffset(useX ? sign * sep * shareA : 0, useX ? 0 : sign * sep * shareA, world);
        } else         if (!okB && okA) {
          A.tryOffset(useX ? -sign * sep * shareB : 0, useX ? 0 : -sign * sep * shareB, world);
        }

        if (it === 0) {
          const bumpMag = Math.min(pen, BUMP_PEN_CAP) * BUMP_STRENGTH;
          const bx = useX ? sign * bumpMag : 0;
          const bz = useX ? 0 : sign * bumpMag;
          A.bump(-bx * shareA * 2, -bz * shareA * 2);
          B.bump(bx * shareB * 2, bz * shareB * 2);
        }
      }
    }
  }
}
