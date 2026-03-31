/**
 * Mob system barrel: re-exports per-mob modules and scene-wide helpers.
 * Game code may import from `./mobs.js` or directly from `pigMob.js` / `cowMob.js` / `squidMob.js`.
 */
import { disposePigMobGroup, createPig, syncPigMesh } from './pigMob.js';
import { disposeCowMobGroup, createCow, syncCowMesh } from './cowMob.js';
import { disposeSquidMobGroup, createSquid, syncSquidMesh } from './squidMob.js';
import { disposeZombieMobGroup, createZombie, syncZombieMesh } from './zombieMob.js';
import { createGroundDrop } from './mobDrops.js';

export { rayAabbEnterDistance } from './mobRaycast.js';
export { MOB_PUNCH_DAMAGE } from './mobShared.js';

export * from './pigMob.js';
export * from './cowMob.js';
export * from './squidMob.js';
export * from './zombieMob.js';
export * from './mobDrops.js';

/**
 * @param {import('three').Scene} scene
 * @param {Array<{ mesh: import('three').Group }>} pigs
 * @param {Array<{ mesh: import('three').Group }>} cows
 * @param {Array<{ mesh: import('three').Group }>} squids
 * @param {Array<{ mesh: import('three').Mesh }>} drops
 */
export function clearMobsFromScene(scene, pigs, cows, squids, drops, zombies = []) {
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
export function restoreMobsFromSave(scene, atlasTex, pigs, cows, squids, drops, data, zombies = [], world = null) {
  const pl = data.pigs || [];
  for (let i = 0; i < pl.length; i++) {
    const s = pl[i];
    const pig = createPig(s.x, s.y, s.z, s.hp);
    scene.add(pig.mesh);
    syncPigMesh(pig);
    pigs.push(pig);
  }
  const cl = data.cows || [];
  for (let i = 0; i < cl.length; i++) {
    const s = cl[i];
    const cow = createCow(s.x, s.y, s.z, s.hp);
    scene.add(cow.mesh);
    syncCowMesh(cow);
    cows.push(cow);
  }
  const sl = data.squids || [];
  for (let i = 0; i < sl.length; i++) {
    const s = sl[i];
    const squid = createSquid(s.x, s.y, s.z, s.hp);
    scene.add(squid.mesh);
    syncSquidMesh(squid);
    squids.push(squid);
  }
  const dl = data.drops || [];
  for (let i = 0; i < dl.length; i++) {
    const s = dl[i];
    const drop = createGroundDrop(s.x, s.y, s.z, s.blockId, s.count, atlasTex, world, s.attach);
    scene.add(drop.mesh);
    drops.push(drop);
  }
  const zl = data.zombies || [];
  for (let i = 0; i < zl.length; i++) {
    const s = zl[i];
    const zombie = createZombie(s.x, s.y, s.z, s.hp);
    scene.add(zombie.mesh);
    syncZombieMesh(zombie);
    zombies.push(zombie);
  }
}

/**
 * @param {Array<{ mesh: import('three').Group }>} pigs
 * @param {Array<{ mesh: import('three').Group }>} cows
 * @param {Array<{ mesh: import('three').Group }>} squids
 * @param {Array<{ x: number, y: number, z: number, blockId: number, count: number }>} drops
 */
export function serializeMobsState(pigs, cows, squids, drops, zombies = []) {
  return {
    pigs: pigs
      .filter((p) => p.state !== 'dying')
      .map((p) => ({ x: p.x, y: p.y, z: p.z, hp: p.hp })),
    cows: cows
      .filter((c) => c.state !== 'dying')
      .map((c) => ({ x: c.x, y: c.y, z: c.z, hp: c.hp })),
    squids: squids
      .filter((s) => s.state !== 'dying')
      .map((s) => ({ x: s.x, y: s.y, z: s.z, hp: s.hp })),
    zombies: zombies
      .filter((z) => z.state !== 'dying')
      .map((z) => ({ x: z.x, y: z.y, z: z.z, hp: z.hp })),
    drops: drops.map((d) => {
      const o = { x: d.x, y: d.y, z: d.z, blockId: d.blockId, count: d.count };
      if (d.attach && d.attach > 0) o.attach = d.attach;
      return o;
    }),
  };
}
