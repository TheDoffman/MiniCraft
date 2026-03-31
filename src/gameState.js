/**
 * Player vitals, world tuning, and game state constants.
 * Centralizes magic numbers so main.js stays smaller.
 */

/** Vertical world height in blocks; horizontal extent is infinite (chunk streaming). */
export const WORLD_H = 200;

/**
 * Ocean and river surface height. Chosen so typical land ({@link SURFACE_Y_OFFSET} terrain) sits a few
 * blocks above sea, with ~120–130 blocks from mean surface down to bedrock (y=0).
 */
export const SEA_LEVEL = 123;

/**
 * Added to the raw surface formula in {@link surfaceHeight} so average surface Y ≈ {@link SEA_LEVEL} + 2.
 */
export const SURFACE_Y_OFFSET = 103;

/**
 * Nominal gameplay visibility radius in chunks (fog vs streaming).
 * Meshes are built out to CHUNK_RENDER_RADIUS + CHUNK_MESH_MARGIN.
 */
export const CHUNK_RENDER_RADIUS = 7;

/** Extra chunk rings beyond RENDER_RADIUS to pre-mesh (hidden in distance fog). */
export const CHUNK_MESH_MARGIN = 2;

export const MAX_HEALTH = 100;
export const MAX_STAMINA = 100;
export const MAX_HUNGER = 100;

export const STAMINA_DRAIN_PER_SEC = 28;
export const STAMINA_REGEN_PER_SEC = 20;

export const HUNGER_DRAIN_PER_SEC = 0.8;
export const HUNGER_SPRINT_DRAIN_PER_SEC = 3.5;
export const HEALTH_REGEN_PER_SEC = 2.5;
export const HUNGER_REGEN_THRESHOLD = 60;
export const HUNGER_STARVE_THRESHOLD = 5;
export const STARVE_DAMAGE_PER_SEC = 1.5;

export const PORKCHOP_HUNGER_RESTORE = 35;
export const BEEF_HUNGER_RESTORE = 50;
export const PORKCHOP_HEAL = 20;
export const BEEF_HEAL = 32;

/** Mob respawn timer interval in seconds. */
export const MOB_RESPAWN_INTERVAL = 30;
export const TARGET_PIG_COUNT = 14;
export const TARGET_COW_COUNT = 10;
export const TARGET_SQUID_COUNT = 10;
export const TARGET_ZOMBIE_COUNT_NIGHT = 8;

/** Mining base time for hardness=1 with bare hands. */
export const BASE_MINE_TIME = 0.5;

export const REACH = 5.5;

/** Camera shake constants. */
export const FALL_SHAKE_MAX = 0.038;
export const FALL_SHAKE_DECAY = 12.5;
export const FALL_SHAKE_PER_DAMAGE = 0.0009;

/** Walk/sprint bob constants. */
export const WALK_BOB_LERP = 14;
export const WALK_BOB_FREQ = 7.1;
export const SPRINT_BOB_FREQ = 11.2;
export const WALK_BOB_VERT = 0.024;
export const WALK_BOB_LAT = 0.011;
export const SPRINT_BOB_MUL = 1.38;

/** Sprint double-tap window in ms. */
export const W_DOUBLE_TAP_MS = 320;

/** Double-tap Space window in ms (creative flight toggle). */
export const SPACE_DOUBLE_TAP_MS = 320;

/**
 * Game mode: 'survival' or 'creative'.
 * Set once at world start via the menu; read by main.js to gate mechanics.
 * @type {'survival' | 'creative'}
 */
export let gameMode = 'survival';

/** Called from main.js when the player clicks Play / New World. */
export function setGameMode(/** @type {'survival' | 'creative'} */ mode) {
  gameMode = mode;
}
