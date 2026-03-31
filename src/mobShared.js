import { BLOCKS } from './blocktypes.js';

/** Punch damage for pigs, squids, and any future mobs that share this rule. */
export const MOB_PUNCH_DAMAGE = 4;

export const HIT_FLASH_DUR = 0.22;
export const KNOCKBACK_STRENGTH = 2.15;
export const KNOCKBACK_DECAY = 5.8;
export const DEATH_DUR = 0.52;
export const YAW_SMOOTH = 9;

/**
 * True if a land mob should not spawn here: `floorY` is top solid underfoot; fluid in the column
 * above would put the mob in water (e.g. ocean floor with water above).
 *
 * @param {import('./world.js').World} world
 */
export function landSpawnColumnHasFluid(world, ix, floorY, iz) {
  const h = world.height;
  for (let y = floorY + 1; y < h && y <= floorY + 3; y++) {
    const id = world.get(ix, y, iz);
    if (id !== 0 && BLOCKS[id]?.fluid) return true;
  }
  return false;
}

/**
 * @param {{ materials?: import('three').MeshLambertMaterial[], hitFlash: number, state?: string }} mob
 */
export function updateMobHitFlash(mob, dt) {
  const mats = mob.materials;
  if (!mats || mats.length === 0) return;
  if (mob.hitFlash > 0) {
    mob.hitFlash -= dt;
    const t = Math.max(0, mob.hitFlash);
    const pulse = t / HIT_FLASH_DUR;
    const intensity = Math.min(1.15, 0.2 + pulse * 0.95);
    for (let i = 0; i < mats.length; i++) {
      mats[i].emissive.setRGB(0.92, 0.08, 0.06);
      mats[i].emissiveIntensity = intensity;
    }
  } else {
    for (let i = 0; i < mats.length; i++) {
      mats[i].emissive.setRGB(0, 0, 0);
      mats[i].emissiveIntensity = 0;
    }
  }
}
