/**
 * Mob system barrel: re-exports per-mob modules and scene-wide helpers.
 * Game code may import from `./mobs` or directly from `pigMob` / `cowMob` / `sheepMob` / `chickenMob` / `squidMob`.
 */
import { disposePigMobGroup, createPig, syncPigMesh } from './pigMob';
import { disposeCowMobGroup, createCow, syncCowMesh } from './cowMob';
import { disposeSquidMobGroup, createSquid, syncSquidMesh } from './squidMob';
import { disposeZombieMobGroup, createZombie, syncZombieMesh } from './zombieMob';
import { disposeSheepMobGroup, createSheep, syncSheepMesh } from './sheepMob';
import { disposeChickenMobGroup, createChicken, syncChickenMesh } from './chickenMob';
import { createGroundDrop } from './mobDrops';

export { rayAabbEnterDistance } from './mobRaycast';
export { MOB_PUNCH_DAMAGE } from './mobShared';
export { disposeZombieMobGroup } from './zombieMob';

export * from './pigMob';
export * from './cowMob';
export * from './squidMob';
export * from './zombieMob';
export * from './sheepMob';
export * from './chickenMob';
export * from './mobDrops';

/**
 * @param {import('three').Scene} scene
 * @param {Array<{ mesh: import('three').Group }>} pigs
 * @param {Array<{ mesh: import('three').Group }>} cows
 * @param {Array<{ mesh: import('three').Group }>} squids
 * @param {Array<{ mesh: import('three').Mesh }>} drops
 */
export function clearMobsFromScene(scene, pigs, cows, squids, drops, zombies = [], sheep = [], chickens = []) {
  for (let i = 0; i < pigs.length; i++) {
    scene.remove(pigs[i].mesh);
    disposePigMobGroup(pigs[i].mesh);
  }
  pigs.length = 0;
  for (let i = 0; i < cows.length; i++) {
    scene.remove(cows[i].mesh);
    disposeCowMobGroup(cows[i].mesh);
  }
  cows.length = 0;
  for (let i = 0; i < squids.length; i++) {
    scene.remove(squids[i].mesh);
    disposeSquidMobGroup(squids[i].mesh);
  }
  squids.length = 0;
  for (let i = 0; i < zombies.length; i++) {
    scene.remove(zombies[i].mesh);
    disposeZombieMobGroup(zombies[i].mesh);
  }
  zombies.length = 0;
  for (let i = 0; i < sheep.length; i++) {
    scene.remove(sheep[i].mesh);
    disposeSheepMobGroup(sheep[i].mesh);
  }
  sheep.length = 0;
  for (let i = 0; i < chickens.length; i++) {
    scene.remove(chickens[i].mesh);
    disposeChickenMobGroup(chickens[i].mesh);
  }
  chickens.length = 0;
  for (let i = 0; i < drops.length; i++) {
    scene.remove(drops[i].mesh);
  }
  drops.length = 0;
}

/**
 * @param {import('three').Scene} scene
 * @param {import('three').Texture} atlasTex
 * @param {Array<{ mesh: import('three').Group }>} pigs
 * @param {Array<{ mesh: import('three').Group }>} cows
 * @param {Array<{ mesh: import('three').Group }>} squids
 * @param {Array<{ mesh: import('three').Mesh, x: number, y: number, z: number, blockId: number, count: number }>} drops
 * @param {{ pigs: { x: number, y: number, z: number, hp: number }[], cows?: { x: number, y: number, z: number, hp: number }[], squids?: { x: number, y: number, z: number, hp: number }[], drops: { x: number, y: number, z: number, blockId: number, count: number, attach?: number }[] }} data
 * @param {import('./world.js').World} world
 */
function applyLandMobMotion(m: Record<string, unknown>, s: Record<string, unknown>) {
  if (typeof s.vx === 'number') m.vx = s.vx;
  if (typeof s.vy === 'number') m.vy = s.vy;
  if (typeof s.vz === 'number') m.vz = s.vz;
  if (typeof s.tvx === 'number') m.targetVx = s.tvx;
  if (typeof s.tvz === 'number') m.targetVz = s.tvz;
  if (typeof s.wT === 'number') m.wanderT = s.wT;
  if (typeof s.kvx === 'number') m.kvx = s.kvx;
  if (typeof s.kvz === 'number') m.kvz = s.kvz;
  if (typeof s.fT === 'number') m.fleeT = s.fT;
  if (typeof s.fdx === 'number') m.fleeDirX = s.fdx;
  if (typeof s.fdz === 'number') m.fleeDirZ = s.fdz;
}

export function restoreMobsFromSave(
  scene,
  atlasTex,
  pigs,
  cows,
  squids,
  drops,
  data,
  zombies = [],
  world = null,
  sheep = [],
  chickens = [],
) {
  const pl = data.pigs || [];
  for (let i = 0; i < pl.length; i++) {
    const s = pl[i] as Record<string, unknown>;
    const pig = createPig(s.x as number, s.y as number, s.z as number, s.hp as number);
    applyLandMobMotion(pig as unknown as Record<string, unknown>, s);
    scene.add(pig.mesh);
    syncPigMesh(pig);
    pigs.push(pig);
  }
  const cl = data.cows || [];
  for (let i = 0; i < cl.length; i++) {
    const s = cl[i] as Record<string, unknown>;
    const cow = createCow(s.x as number, s.y as number, s.z as number, s.hp as number);
    applyLandMobMotion(cow as unknown as Record<string, unknown>, s);
    scene.add(cow.mesh);
    syncCowMesh(cow);
    cows.push(cow);
  }
  const sl = data.squids || [];
  for (let i = 0; i < sl.length; i++) {
    const s = sl[i] as Record<string, unknown>;
    const squid = createSquid(s.x as number, s.y as number, s.z as number, s.hp as number);
    if (typeof s.vx === 'number') squid.vx = s.vx;
    if (typeof s.vy === 'number') squid.vy = s.vy;
    if (typeof s.vz === 'number') squid.vz = s.vz;
    if (typeof s.tvx === 'number') squid.targetVx = s.tvx;
    if (typeof s.tvy === 'number') squid.targetVy = s.tvy;
    if (typeof s.tvz === 'number') squid.targetVz = s.tvz;
    if (typeof s.wT === 'number') squid.wanderT = s.wT;
    if (typeof s.tp === 'number') squid.tentaclePhase = s.tp;
    if (typeof s.sy === 'number') squid.smoothedYaw = s.sy;
    if (typeof s.kvx === 'number') squid.kvx = s.kvx;
    if (typeof s.kvz === 'number') squid.kvz = s.kvz;
    scene.add(squid.mesh);
    syncSquidMesh(squid);
    squids.push(squid);
  }
  const dl = data.drops || [];
  for (let i = 0; i < dl.length; i++) {
    const s = dl[i] as Record<string, unknown>;
    const drop = createGroundDrop(
      s.x as number,
      s.y as number,
      s.z as number,
      s.blockId as number,
      s.count as number,
      atlasTex,
      world,
      s.attach as number | undefined,
    );
    if (typeof s.vx === 'number') drop.vx = s.vx;
    if (typeof s.vy === 'number') drop.vy = s.vy;
    if (typeof s.vz === 'number') drop.vz = s.vz;
    if (typeof s.pickupDelay === 'number') drop.pickupDelay = s.pickupDelay;
    scene.add(drop.mesh);
    drops.push(drop);
  }
  const zl = data.zombies || [];
  for (let i = 0; i < zl.length; i++) {
    const s = zl[i] as Record<string, unknown>;
    const zombie = createZombie(s.x as number, s.y as number, s.z as number, s.hp as number);
    if (typeof s.yaw === 'number') zombie.yaw = s.yaw;
    if (typeof s.vx === 'number') zombie.vx = s.vx;
    if (typeof s.vy === 'number') zombie.vy = s.vy;
    if (typeof s.vz === 'number') zombie.vz = s.vz;
    if (typeof s.kbVx === 'number') zombie.kbVx = s.kbVx;
    if (typeof s.kbVz === 'number') zombie.kbVz = s.kbVz;
    if (typeof s.ac === 'number') zombie.attackCooldown = s.ac;
    scene.add(zombie.mesh);
    syncZombieMesh(zombie);
    zombies.push(zombie);
  }
  const shl = data.sheep || [];
  for (let i = 0; i < shl.length; i++) {
    const s = shl[i] as Record<string, unknown>;
    const sh = createSheep(s.x as number, s.y as number, s.z as number, s.hp as number);
    applyLandMobMotion(sh as unknown as Record<string, unknown>, s);
    scene.add(sh.mesh);
    syncSheepMesh(sh);
    sheep.push(sh);
  }
  const chl = data.chickens || [];
  for (let i = 0; i < chl.length; i++) {
    const s = chl[i] as Record<string, unknown>;
    const ch = createChicken(s.x as number, s.y as number, s.z as number, s.hp as number);
    applyLandMobMotion(ch as unknown as Record<string, unknown>, s);
    if (typeof s.eggT === 'number') ch.eggTimer = s.eggT;
    scene.add(ch.mesh);
    syncChickenMesh(ch);
    chickens.push(ch);
  }
}

/**
 * @param {Array<{ mesh: import('three').Group }>} pigs
 * @param {Array<{ mesh: import('three').Group }>} cows
 * @param {Array<{ mesh: import('three').Group }>} squids
 * @param {Array<{ x: number, y: number, z: number, blockId: number, count: number }>} drops
 */
function landMobSave(
  m: {
    x: number;
    y: number;
    z: number;
    hp: number;
    vx: number;
    vy: number;
    vz: number;
    targetVx: number;
    targetVz: number;
    wanderT: number;
    kvx: number;
    kvz: number;
    fleeT: number;
    fleeDirX: number;
    fleeDirZ: number;
  },
) {
  return {
    x: m.x,
    y: m.y,
    z: m.z,
    hp: m.hp,
    vx: m.vx,
    vy: m.vy,
    vz: m.vz,
    tvx: m.targetVx,
    tvz: m.targetVz,
    wT: m.wanderT,
    kvx: m.kvx,
    kvz: m.kvz,
    fT: m.fleeT,
    fdx: m.fleeDirX,
    fdz: m.fleeDirZ,
  };
}

export function serializeMobsState(pigs, cows, squids, drops, zombies = [], sheep = [], chickens = []) {
  return {
    pigs: pigs.filter((p) => p.state !== 'dying').map((p) => landMobSave(p)),
    cows: cows.filter((c) => c.state !== 'dying').map((c) => landMobSave(c)),
    squids: squids
      .filter((s) => s.state !== 'dying')
      .map((s) => ({
        x: s.x,
        y: s.y,
        z: s.z,
        hp: s.hp,
        vx: s.vx,
        vy: s.vy,
        vz: s.vz,
        tvx: s.targetVx,
        tvy: s.targetVy,
        tvz: s.targetVz,
        wT: s.wanderT,
        tp: s.tentaclePhase,
        sy: s.smoothedYaw,
        kvx: s.kvx,
        kvz: s.kvz,
      })),
    zombies: zombies
      .filter((z) => z.state !== 'dying')
      .map((z) => ({
        x: z.x,
        y: z.y,
        z: z.z,
        hp: z.hp,
        yaw: z.yaw,
        vx: z.vx,
        vy: z.vy,
        vz: z.vz,
        kbVx: z.kbVx,
        kbVz: z.kbVz,
        ac: z.attackCooldown,
      })),
    sheep: sheep.filter((s) => s.state !== 'dying').map((s) => landMobSave(s)),
    chickens: chickens
      .filter((c) => c.state !== 'dying')
      .map((c) => ({ ...landMobSave(c), eggT: c.eggTimer })),
    drops: drops.map((d) => {
      const o: {
        x: number;
        y: number;
        z: number;
        blockId: number;
        count: number;
        attach?: number;
        vx?: number;
        vy?: number;
        vz?: number;
        pickupDelay?: number;
      } = { x: d.x, y: d.y, z: d.z, blockId: d.blockId, count: d.count };
      if (d.attach && d.attach > 0) o.attach = d.attach;
      if (typeof d.vx === 'number' && d.vx !== 0) o.vx = d.vx;
      if (typeof d.vy === 'number' && d.vy !== 0) o.vy = d.vy;
      if (typeof d.vz === 'number' && d.vz !== 0) o.vz = d.vz;
      if (typeof d.pickupDelay === 'number' && d.pickupDelay > 0) o.pickupDelay = d.pickupDelay;
      return o;
    }),
  };
}
