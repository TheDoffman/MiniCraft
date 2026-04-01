import {
  BLOCKS,
  BlockId,
  HOTBAR_BLOCKS,
  armorSlotForBlock,
  TOOL_INFO,
} from './blocktypes.js';

export const INV_SIZE = 36;
/** Helmet, chestplate, leggings, boots — max one item per slot */
export const ARMOR_SLOT_COUNT = 4;
/** Hotbar = last row (slots 27–35); keys 1–9 map to index 0–8 here */
export const HOTBAR_OFFSET = 27;
export const MAX_STACK = 64;

/** @typedef {{ blockId: number, count: number, meta?: number }} InvSlot — meta = tool durability left */

/**
 * @returns {InvSlot[]}
 */
export function createInventory() {
  /** @type {InvSlot[]} */
  const slots = [];
  for (let i = 0; i < INV_SIZE; i++) {
    slots.push({ blockId: 0, count: 0 });
  }
  return slots;
}

/**
 * Creative: same 36 slots as survival; backpack and hotbar start empty.
 * Player fills the hotbar from the creative catalog (selected slot + palette click).
 * @returns {InvSlot[]}
 */
export function createCreativeInventory() {
  /** @type {InvSlot[]} */
  const slots = [];
  for (let i = 0; i < INV_SIZE; i++) {
    slots.push({ blockId: 0, count: 0 });
  }
  return slots;
}

/**
 * Block/item ids for the creative palette (non-air definitions).
 * @returns {number[]}
 */
export function listCreativePaletteBlockIds() {
  /** @type {number[]} */
  const ids = [];
  for (let id = 1; id < BLOCKS.length; id++) {
    const def = BLOCKS[id];
    if (!def || def.name === 'air') continue;
    if (def.creativeSkip) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Default stack when taking an item from the creative palette onto the cursor.
 * @param {number} blockId
 * @returns {InvSlot}
 */
export function creativePaletteGrabSlot(blockId) {
  if (TOOL_INFO[blockId]) {
    const max = TOOL_INFO[blockId].durability;
    return { blockId, count: 1, meta: max };
  }
  return { blockId, count: MAX_STACK };
}

/**
 * Clear backpack slots (for creative mode or normalizing loaded games).
 * @param {InvSlot[]} slots
 */
export function clearBackpackSlots(slots) {
  for (let i = 0; i < HOTBAR_OFFSET; i++) {
    slots[i].blockId = 0;
    slots[i].count = 0;
    delete slots[i].meta;
  }
}

/**
 * @param {InvSlot} s
 */
export function isEmptySlot(s) {
  return s.blockId === 0 || s.count <= 0;
}

/**
 * @param {number} blockId
 */
export function canPickupBlock(blockId) {
  if (blockId <= 0) return false;
  if (BLOCKS[blockId]?.fluid) return false;
  if (blockId >= BlockId.PORKCHOP) return true;
  if (blockId === BlockId.FURNACE || blockId === BlockId.CRAFTING_TABLE || blockId === BlockId.DOOR)
    return true;
  return HOTBAR_BLOCKS.includes(blockId);
}

/**
 * @param {number} blockId
 */
export function displayBlockName(blockId) {
  if (blockId <= 0) return '';
  const def = BLOCKS[blockId];
  if (!def) return '';
  const n = def.name;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * @param {InvSlot[]} slots
 * @param {number} blockId
 * @param {number} count
 * @returns {number} items that could NOT be added (0 = all fit)
 */
/**
 * @param {InvSlot[]} slots
 * @param {number} blockId
 * @param {number} count
 * @param {{ hotbarOnly?: boolean, backpackOnly?: boolean }} [opts] — hotbarOnly = slots 27–35; backpackOnly = 0–26 (ignored if hotbarOnly)
 */
export function addItemToInventory(slots, blockId, count, opts) {
  if (!canPickupBlock(blockId) || count <= 0) return count;
  let lo = 0;
  let hi = INV_SIZE;
  if (opts?.hotbarOnly) {
    lo = HOTBAR_OFFSET;
  } else if (opts?.backpackOnly) {
    hi = HOTBAR_OFFSET;
  }
  if (TOOL_INFO[blockId]) {
    let remaining = count;
    for (let k = 0; k < count; k++) {
      let placed = false;
      for (let i = lo; i < hi; i++) {
        if (isEmptySlot(slots[i])) {
          const max = TOOL_INFO[blockId].durability;
          slots[i] = { blockId, count: 1, meta: max };
          placed = true;
          remaining--;
          break;
        }
      }
      if (!placed) break;
    }
    return remaining;
  }
  let remaining = count;
  for (let i = lo; i < hi && remaining > 0; i++) {
    const s = slots[i];
    if (s.blockId === blockId && s.count < MAX_STACK) {
      const add = Math.min(remaining, MAX_STACK - s.count);
      s.count += add;
      remaining -= add;
    }
  }
  for (let i = lo; i < hi && remaining > 0; i++) {
    const s = slots[i];
    if (isEmptySlot(s)) {
      const add = Math.min(remaining, MAX_STACK);
      s.blockId = blockId;
      s.count = add;
      remaining -= add;
    }
  }
  return remaining;
}

/**
 * @param {InvSlot[]} slots
 * @param {number} index
 * @param {number} [count]
 * @returns {boolean}
 */
export function consumeFromSlot(slots, index, count = 1) {
  const s = slots[index];
  if (isEmptySlot(s)) return false;
  s.count -= count;
  if (s.count <= 0) {
    s.blockId = 0;
    s.count = 0;
    delete s.meta;
  }
  return true;
}

/**
 * @param {InvSlot} slot
 * @param {number} amount
 * @returns {boolean} true if tool broke / was damaged
 */
export function damageToolInSlot(slot, amount) {
  if (!TOOL_INFO[slot.blockId] || slot.count < 1 || amount <= 0) return false;
  const max = TOOL_INFO[slot.blockId].durability;
  let cur = slot.meta !== undefined ? slot.meta : max;
  cur -= amount;
  if (cur <= 0) {
    slot.blockId = 0;
    slot.count = 0;
    delete slot.meta;
    return true;
  }
  slot.meta = cur;
  return true;
}

/**
 * @param {unknown} raw
 * @returns {InvSlot}
 */
export function deserializeInvSlot(raw) {
  let blockId =
    raw && typeof raw === 'object' && 'blockId' in raw && typeof raw.blockId === 'number'
      ? raw.blockId
      : 0;
  let count =
    raw && typeof raw === 'object' && 'count' in raw && typeof raw.count === 'number'
      ? raw.count
      : 0;
  count = Math.max(0, Math.min(MAX_STACK, Math.floor(count)));
  let meta =
    raw && typeof raw === 'object' && 'meta' in raw && typeof raw.meta === 'number'
      ? raw.meta
      : undefined;
  if (blockId > 0 && !canPickupBlock(blockId)) {
    blockId = 0;
    count = 0;
    meta = undefined;
  }
  if (blockId === 0 || count <= 0) {
    return { blockId: 0, count: 0 };
  }
  if (TOOL_INFO[blockId]) {
    const max = TOOL_INFO[blockId].durability;
    const m = meta === undefined ? max : Math.max(0, Math.min(max, Math.floor(meta)));
    return { blockId, count, meta: m };
  }
  return { blockId, count };
}

/**
 * @param {unknown[]} arr
 * @returns {InvSlot[]}
 */
export function deserializeInventory(arr) {
  if (!Array.isArray(arr) || arr.length !== INV_SIZE) return createInventory();
  /** @type {InvSlot[]} */
  const fresh = [];
  for (let i = 0; i < INV_SIZE; i++) {
    fresh.push(deserializeInvSlot(arr[i]));
  }
  return fresh;
}

/**
 * @returns {import('./inventory.js').InvSlot[]}
 */
export function createArmorSlots() {
  /** @type {InvSlot[]} */
  const out = [];
  for (let i = 0; i < ARMOR_SLOT_COUNT; i++) {
    out.push({ blockId: 0, count: 0 });
  }
  return out;
}

/**
 * @param {unknown[]} arr
 * @returns {InvSlot[]}
 */
export function deserializeArmorSlots(arr) {
  const fresh = createArmorSlots();
  if (!Array.isArray(arr) || arr.length !== ARMOR_SLOT_COUNT) return fresh;
  for (let i = 0; i < ARMOR_SLOT_COUNT; i++) {
    const raw = arr[i];
    let blockId =
      raw && typeof raw === 'object' && 'blockId' in raw && typeof raw.blockId === 'number'
        ? raw.blockId
        : 0;
    let count =
      raw && typeof raw === 'object' && 'count' in raw && typeof raw.count === 'number'
        ? raw.count
        : 0;
    count = Math.max(0, Math.min(1, Math.floor(count)));
    if (blockId > 0 && armorSlotForBlock(blockId) !== i) {
      blockId = 0;
      count = 0;
    }
    if (blockId === 0 || count <= 0) {
      fresh[i] = { blockId: 0, count: 0 };
    } else {
      fresh[i] = { blockId, count: 1 };
    }
  }
  return fresh;
}
