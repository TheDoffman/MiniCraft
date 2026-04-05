import { World } from './world';
import {
  createInventory,
  createArmorSlots,
  deserializeInventory,
  deserializeArmorSlots,
  deserializeInvSlot,
} from './inventory';
import { CHUNK_XZ } from './chunks';

const STORAGE_KEY = 'minicraft-save-v1';

/**
 * @param {unknown} raw
 * @returns {{ k: string, input: import('./inventory.js').InvSlot, fuel: import('./inventory.js').InvSlot, output: import('./inventory.js').InvSlot, burnLeft: number, smeltProgress: number }[]}
 */
function parseFurnaceStatesArray(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {{ k: string, input: import('./inventory.js').InvSlot, fuel: import('./inventory.js').InvSlot, output: import('./inventory.js').InvSlot, burnLeft: number, smeltProgress: number }[]} */
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.k !== 'string' || !/^\d+,\d+,\d+$/.test(row.k)) continue;
    const burnLeft =
      typeof row.burnLeft === 'number' && Number.isFinite(row.burnLeft) ? Math.max(0, row.burnLeft) : 0;
    const smeltProgress =
      typeof row.smeltProgress === 'number' && Number.isFinite(row.smeltProgress)
        ? Math.max(0, row.smeltProgress)
        : 0;
    out.push({
      k: row.k,
      input: deserializeInvSlot(row.input),
      fuel: deserializeInvSlot(row.fuel),
      output: deserializeInvSlot(row.output),
      burnLeft,
      smeltProgress,
    });
  }
  return out;
}

function uint8ToBase64(u8) {
  const chunk = 0x8000;
  let s = '';
  for (let i = 0; i < u8.length; i += chunk) {
    const sub = u8.subarray(i, i + chunk);
    s += String.fromCharCode.apply(null, sub);
  }
  return btoa(s);
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @param {import('./world.js').World} world
 * @param {import('./inventory.js').InvSlot[]} inventory
 * @param {{ pigs: { x: number, y: number, z: number, hp: number }[], cows?: { x: number, y: number, z: number, hp: number }[], squids?: { x: number, y: number, z: number, hp: number }[], drops: { x: number, y: number, z: number, blockId: number, count: number }[] }} [mobs]
 * @param {import('./inventory.js').InvSlot[]} [armor]
 * @param {unknown} [furnaces] Serialized per-tile furnace rows `{ k, input, fuel, output, burnLeft, smeltProgress }`
 * @param {null | { gameMode?: string, player?: { x: number, y: number, z: number, yaw?: number, pitch?: number }, worldTimeTicks?: number, playerVitals?: { health: number, stamina: number, hunger: number } }} [playerSnapshot]
 */
export function serializeGame(world, inventory, mobs, armor, furnaces, playerSnapshot = null) {
  const perChunk = CHUNK_XZ * world.height * CHUNK_XZ;
  /** @type {Record<string, string>} */
  const chunks = {};
  for (const [k, buf] of world.chunks) {
    if (buf.length === perChunk) {
      chunks[k] = uint8ToBase64(buf);
    }
  }
  /** @type {Record<string, string>} */
  const waterChunks = {};
  for (const [k, wm] of world._waterMeta) {
    if (wm.length === perChunk) {
      waterChunks[k] = uint8ToBase64(wm);
    }
  }
  /** @type {Record<string, string>} */
  const torchChunks = {};
  for (const [k, tm] of world._torchMeta) {
    if (tm.length === perChunk) {
      torchChunks[k] = uint8ToBase64(tm);
    }
  }
  /** @type {Record<string, string>} */
  const doorChunks = {};
  for (const [k, dm] of world._doorMeta) {
    if (dm.length === perChunk) {
      doorChunks[k] = uint8ToBase64(dm);
    }
  }
  const payload: {
    v: number;
    height: number;
    seed: number;
    chunks: Record<string, string>;
    waterChunks: Record<string, string>;
    torchChunks: Record<string, string>;
    doorChunks: Record<string, string>;
    inventory: { blockId: number; count: number; meta?: number }[];
    armor: { blockId: number; count: number }[];
    mobs: unknown;
    furnaces: unknown[];
    gameMode?: string;
    player?: { x: number; y: number; z: number; yaw?: number; pitch?: number };
    worldTimeTicks?: number;
    playerVitals?: { health: number; stamina: number; hunger: number };
  } = {
    v: 8,
    height: world.height,
    seed: world.seed,
    chunks,
    waterChunks,
    torchChunks,
    doorChunks,
    inventory: inventory.map((s) => {
      const o: { blockId: number; count: number; meta?: number } = { blockId: s.blockId, count: s.count };
      if (s.meta !== undefined && typeof s.meta === 'number') o.meta = s.meta;
      return o;
    }),
    armor: (armor ?? createArmorSlots()).map((s) => ({
      blockId: s.blockId,
      count: Math.min(1, s.count),
    })),
    mobs: mobs ?? { pigs: [], cows: [], squids: [], drops: [], zombies: [], sheep: [], chickens: [] },
    furnaces: Array.isArray(furnaces) ? furnaces : [],
  };
  if (playerSnapshot && typeof playerSnapshot === 'object') {
    if (playerSnapshot.gameMode === 'creative' || playerSnapshot.gameMode === 'survival') {
      payload.gameMode = playerSnapshot.gameMode;
    }
    if (
      playerSnapshot.player &&
      typeof playerSnapshot.player.x === 'number' &&
      typeof playerSnapshot.player.y === 'number' &&
      typeof playerSnapshot.player.z === 'number'
    ) {
      payload.player = {
        x: playerSnapshot.player.x,
        y: playerSnapshot.player.y,
        z: playerSnapshot.player.z,
      };
      if (typeof playerSnapshot.player.yaw === 'number') payload.player.yaw = playerSnapshot.player.yaw;
      if (typeof playerSnapshot.player.pitch === 'number') payload.player.pitch = playerSnapshot.player.pitch;
    }
    if (typeof playerSnapshot.worldTimeTicks === 'number' && Number.isFinite(playerSnapshot.worldTimeTicks)) {
      payload.worldTimeTicks = playerSnapshot.worldTimeTicks;
    }
    if (
      playerSnapshot.playerVitals &&
      typeof playerSnapshot.playerVitals.health === 'number' &&
      typeof playerSnapshot.playerVitals.stamina === 'number' &&
      typeof playerSnapshot.playerVitals.hunger === 'number'
    ) {
      payload.playerVitals = {
        health: playerSnapshot.playerVitals.health,
        stamina: playerSnapshot.playerVitals.stamina,
        hunger: playerSnapshot.playerVitals.hunger,
      };
    }
  }
  return JSON.stringify(payload);
}

/**
 * @returns {{ world: import('./world.js').World, inventory: import('./inventory.js').InvSlot[], armor?: import('./inventory.js').InvSlot[], mobs?: { pigs: { x: number, y: number, z: number, hp: number }[], cows?: { x: number, y: number, z: number, hp: number }[], squids?: { x: number, y: number, z: number, hp: number }[], drops: { x: number, y: number, z: number, blockId: number, count: number }[] } } | null}
 */
export function deserializeGame(jsonStr) {
  try {
    const o = JSON.parse(jsonStr);
    if (
      (o.v === 4 || o.v === 5 || o.v === 6 || o.v === 7 || o.v === 8) &&
      o.inventory &&
      Array.isArray(o.inventory) &&
      o.chunks &&
      typeof o.chunks === 'object'
    ) {
      const waterChunks =
        (o.v === 5 || o.v === 6 || o.v === 7 || o.v === 8) && o.waterChunks && typeof o.waterChunks === 'object'
          ? o.waterChunks
          : null;
      const torchChunks =
        (o.v === 6 || o.v === 7 || o.v === 8) && o.torchChunks && typeof o.torchChunks === 'object'
          ? o.torchChunks
          : null;
      const doorChunks =
        (o.v === 7 || o.v === 8) && o.doorChunks && typeof o.doorChunks === 'object'
          ? o.doorChunks
          : null;
      const world = World.fromChunkSave(
        o.height,
        o.seed,
        o.chunks,
        waterChunks,
        torchChunks,
        doorChunks,
      );
      if (o.v === 6 || o.v === 7 || o.v === 8) {
        world.migrateMisassignedSnowIceFromOlderBuilds();
      }
      const inventory = deserializeInventory(o.inventory);
      const mobs = {
        pigs: Array.isArray(o.mobs?.pigs) ? o.mobs.pigs : [],
        cows: Array.isArray(o.mobs?.cows) ? o.mobs.cows : [],
        squids: Array.isArray(o.mobs?.squids) ? o.mobs.squids : [],
        drops: Array.isArray(o.mobs?.drops) ? o.mobs.drops : [],
        zombies: Array.isArray(o.mobs?.zombies) ? o.mobs.zombies : [],
        sheep: Array.isArray(o.mobs?.sheep) ? o.mobs.sheep : [],
        chickens: Array.isArray(o.mobs?.chickens) ? o.mobs.chickens : [],
      };
      const armor = Array.isArray(o.armor) ? deserializeArmorSlots(o.armor) : createArmorSlots();
      const furnaces = o.v === 8 ? parseFurnaceStatesArray(o.furnaces) : [];
      const gameMode = o.gameMode === 'creative' || o.gameMode === 'survival' ? o.gameMode : undefined;
      const player =
        o.player &&
        typeof o.player === 'object' &&
        typeof o.player.x === 'number' &&
        typeof o.player.y === 'number' &&
        typeof o.player.z === 'number'
          ? {
              x: o.player.x, y: o.player.y, z: o.player.z,
              yaw: typeof o.player.yaw === 'number' ? o.player.yaw : undefined,
              pitch: typeof o.player.pitch === 'number' ? o.player.pitch : undefined,
            }
          : undefined;
      const worldTimeTicks =
        typeof o.worldTimeTicks === 'number' && Number.isFinite(o.worldTimeTicks) ? o.worldTimeTicks : undefined;
      const playerVitals =
        o.playerVitals &&
        typeof o.playerVitals === 'object' &&
        typeof o.playerVitals.health === 'number' &&
        typeof o.playerVitals.stamina === 'number' &&
        typeof o.playerVitals.hunger === 'number'
          ? {
              health: o.playerVitals.health,
              stamina: o.playerVitals.stamina,
              hunger: o.playerVitals.hunger,
            }
          : undefined;
      return { world, inventory, armor, mobs, furnaces, gameMode, player, worldTimeTicks, playerVitals };
    }
    if (o.v === 3 && o.inventory && Array.isArray(o.inventory) && o.data) {
      const data = base64ToUint8(o.data);
      const world = World.fromLegacyFlat(o.width, o.height, o.depth, o.seed, data);
      const inventory = deserializeInventory(o.inventory);
      const mobs = {
        pigs: Array.isArray(o.mobs?.pigs) ? o.mobs.pigs : [],
        cows: Array.isArray(o.mobs?.cows) ? o.mobs.cows : [],
        squids: Array.isArray(o.mobs?.squids) ? o.mobs.squids : [],
        drops: Array.isArray(o.mobs?.drops) ? o.mobs.drops : [],
      };
      const armor = Array.isArray(o.armor) ? deserializeArmorSlots(o.armor) : createArmorSlots();
      return { world, inventory, armor, mobs, furnaces: [] };
    }
    if (o.v === 2 && o.inventory && Array.isArray(o.inventory) && o.data) {
      const data = base64ToUint8(o.data);
      const world = World.fromLegacyFlat(o.width, o.height, o.depth, o.seed, data);
      const inventory = deserializeInventory(o.inventory);
      const armor = Array.isArray(o.armor) ? deserializeArmorSlots(o.armor) : createArmorSlots();
      return { world, inventory, armor, furnaces: [] };
    }
    if (o.v === 1 && o.data) {
      const data = base64ToUint8(o.data);
      const world = World.fromLegacyFlat(o.width, o.height, o.depth, o.seed, data);
      const inventory = createInventory();
      return { world, inventory, armor: createArmorSlots(), furnaces: [] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {import('./world.js').World} world
 * @param {import('./inventory.js').InvSlot[]} inventory
 * @param {{ pigs: { x: number, y: number, z: number, hp: number }[], cows?: { x: number, y: number, z: number, hp: number }[], squids?: { x: number, y: number, z: number, hp: number }[], drops: { x: number, y: number, z: number, blockId: number, count: number }[] }} [mobs]
 * @param {import('./inventory.js').InvSlot[]} [armor]
 * @param {unknown} [furnaces]
 * @param {null | { gameMode?: string, player?: { x: number, y: number, z: number, yaw?: number, pitch?: number }, worldTimeTicks?: number, playerVitals?: { health: number, stamina: number, hunger: number } }} [playerSnapshot]
 */
export function saveToLocalStorage(world, inventory, mobs, armor, furnaces, playerSnapshot = null) {
  localStorage.setItem(STORAGE_KEY, serializeGame(world, inventory, mobs, armor, furnaces, playerSnapshot));
}

/**
 * @returns {{ world: import('./world.js').World, inventory: import('./inventory.js').InvSlot[] } | null}
 */
export function loadFromLocalStorage() {
  const s = localStorage.getItem(STORAGE_KEY);
  if (!s) return null;
  return deserializeGame(s);
}

export function hasLocalSave() {
  return !!localStorage.getItem(STORAGE_KEY);
}
