/** @typedef {{ solid: boolean, name: string, top: [number,number], bottom: [number,number], side: [number,number], alpha?: boolean, collision?: boolean, fluid?: boolean, indestructible?: boolean, placeable?: boolean, hardness?: number, toolType?: 'pickaxe' | 'axe' | 'shovel', torch?: boolean, torchRows?: { flame: [number, number], stick: [number, number] }, torchCols?: [number, number], torchStickCols?: [number, number], tallGrassBottom?: boolean, tallGrassTop?: boolean, shortGrass?: boolean, creativeSkip?: boolean }} BlockDef */

/** Atlas tile coordinates — 16 columns; rows 0–5 used for blocks/tools/items */
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 6;
/**
 * Texels per block/item face on the atlas — vanilla Minecraft default is 16×16 per face.
 * (Resource packs may use 32/64/128; we use native 16 for the low-res aesthetic.)
 */
export const TILE_PX = 16;
/** Logical pixel grid per tile; must match TILE_PX when art is 1 texel per cell (MC standard). */
export const TILE_CELLS = 16;
/** Square grid size (tiles per side); used by mesher/textures for UV math */
export const ATLAS_TILES = ATLAS_COLS;

/** @type {BlockDef[]} */
export const BLOCKS = [
  { name: 'air', solid: false, collision: false, top: [0, 0], bottom: [0, 0], side: [0, 0] },
  {
    name: 'grass',
    solid: true,
    collision: true,
    top: [0, 0],
    bottom: [2, 0],
    side: [1, 0],
    hardness: 0.6,
    toolType: 'shovel',
  },
  { name: 'dirt', solid: true, collision: true, top: [2, 0], bottom: [2, 0], side: [2, 0], hardness: 0.5, toolType: 'shovel' },
  { name: 'stone', solid: true, collision: true, top: [3, 0], bottom: [3, 0], side: [3, 0], hardness: 1.5, toolType: 'pickaxe' },
  {
    name: 'log',
    solid: true,
    collision: true,
    top: [4, 0],
    bottom: [4, 0],
    side: [5, 0],
    hardness: 0.8,
    toolType: 'axe',
  },
  {
    name: 'leaves',
    solid: true,
    collision: true,
    top: [6, 0],
    bottom: [6, 0],
    side: [6, 0],
    alpha: true,
    hardness: 0.2,
  },
  { name: 'sand', solid: true, collision: true, top: [7, 0], bottom: [7, 0], side: [7, 0], hardness: 0.5, toolType: 'shovel' },
  { name: 'planks', solid: true, collision: true, top: [8, 0], bottom: [8, 0], side: [8, 0], hardness: 0.6, toolType: 'axe' },
  { name: 'cobble', solid: true, collision: true, top: [9, 0], bottom: [9, 0], side: [9, 0], hardness: 1.2, toolType: 'pickaxe' },
  {
    name: 'glass',
    solid: true,
    collision: false,
    top: [10, 0],
    bottom: [10, 0],
    side: [10, 0],
    alpha: true,
    hardness: 0.3,
  },
  {
    name: 'water',
    solid: true,
    collision: false,
    top: [11, 0],
    bottom: [11, 0],
    side: [11, 0],
    alpha: true,
    fluid: true,
  },
  {
    name: 'bedrock',
    solid: true,
    collision: true,
    indestructible: true,
    top: [12, 0],
    bottom: [12, 0],
    side: [12, 0],
  },
  {
    name: 'porkchop',
    solid: false,
    collision: false,
    top: [13, 0],
    bottom: [13, 0],
    side: [13, 0],
    placeable: false,
  },
  {
    name: 'beef',
    solid: false,
    collision: false,
    top: [14, 0],
    bottom: [14, 0],
    side: [14, 0],
    placeable: false,
  },
  {
    name: 'leather',
    solid: false,
    collision: false,
    top: [15, 0],
    bottom: [15, 0],
    side: [15, 0],
    placeable: false,
  },
  /* ── tools (row 1) ── */
  {
    name: 'wooden pickaxe',
    solid: false,
    collision: false,
    top: [0, 1],
    bottom: [0, 1],
    side: [0, 1],
    placeable: false,
  },
  {
    name: 'wooden axe',
    solid: false,
    collision: false,
    top: [1, 1],
    bottom: [1, 1],
    side: [1, 1],
    placeable: false,
  },
  {
    name: 'wooden shovel',
    solid: false,
    collision: false,
    top: [2, 1],
    bottom: [2, 1],
    side: [2, 1],
    placeable: false,
  },
  {
    name: 'wooden sword',
    solid: false,
    collision: false,
    top: [3, 1],
    bottom: [3, 1],
    side: [3, 1],
    placeable: false,
  },
  {
    name: 'stone pickaxe',
    solid: false,
    collision: false,
    top: [4, 1],
    bottom: [4, 1],
    side: [4, 1],
    placeable: false,
  },
  {
    name: 'stone axe',
    solid: false,
    collision: false,
    top: [5, 1],
    bottom: [5, 1],
    side: [5, 1],
    placeable: false,
  },
  {
    name: 'stone shovel',
    solid: false,
    collision: false,
    top: [6, 1],
    bottom: [6, 1],
    side: [6, 1],
    placeable: false,
  },
  {
    name: 'stone sword',
    solid: false,
    collision: false,
    top: [7, 1],
    bottom: [7, 1],
    side: [7, 1],
    placeable: false,
  },
  {
    name: 'stick',
    solid: false,
    collision: false,
    top: [8, 1],
    bottom: [8, 1],
    side: [8, 1],
    placeable: false,
  },
  {
    name: 'torch',
    solid: false,
    collision: false,
    top: [9, 1],
    bottom: [9, 1],
    side: [9, 1],
    alpha: true,
    placeable: false,
    hardness: 0,
    torch: true,
    /* TILE_CELLS — must match torch pixel grid in scripts/generate-textures.mjs (rowTools). */
    torchRows: { flame: [2, 7], stick: [7, 13] },
    torchCols: [5, 11],
    torchStickCols: [7, 9],
  },
  {
    name: 'book',
    solid: false,
    collision: false,
    top: [0, 2],
    bottom: [0, 2],
    side: [0, 2],
    placeable: false,
  },
  {
    name: 'rotten flesh',
    solid: false,
    collision: false,
    top: [1, 2],
    bottom: [1, 2],
    side: [1, 2],
    placeable: false,
  },
  {
    name: 'iron nugget',
    solid: false,
    collision: false,
    top: [2, 2],
    bottom: [2, 2],
    side: [2, 2],
    placeable: false,
  },
  {
    name: 'iron ingot',
    solid: false,
    collision: false,
    top: [3, 2],
    bottom: [3, 2],
    side: [3, 2],
    placeable: false,
  },
  {
    name: 'iron pickaxe',
    solid: false,
    collision: false,
    top: [4, 2],
    bottom: [4, 2],
    side: [4, 2],
    placeable: false,
  },
  {
    name: 'iron axe',
    solid: false,
    collision: false,
    top: [5, 2],
    bottom: [5, 2],
    side: [5, 2],
    placeable: false,
  },
  {
    name: 'iron shovel',
    solid: false,
    collision: false,
    top: [6, 2],
    bottom: [6, 2],
    side: [6, 2],
    placeable: false,
  },
  {
    name: 'iron sword',
    solid: false,
    collision: false,
    top: [7, 2],
    bottom: [7, 2],
    side: [7, 2],
    placeable: false,
  },
  /* ── ores & furnace (row 2 continued) ── */
  {
    name: 'coal ore',
    solid: true,
    collision: true,
    top: [8, 2],
    bottom: [8, 2],
    side: [8, 2],
    hardness: 1.5,
    toolType: 'pickaxe',
  },
  {
    name: 'iron ore',
    solid: true,
    collision: true,
    top: [9, 2],
    bottom: [9, 2],
    side: [9, 2],
    hardness: 2.0,
    toolType: 'pickaxe',
  },
  {
    name: 'diamond ore',
    solid: true,
    collision: true,
    top: [10, 2],
    bottom: [10, 2],
    side: [10, 2],
    hardness: 3.0,
    toolType: 'pickaxe',
  },
  {
    name: 'coal',
    solid: false,
    collision: false,
    top: [11, 2],
    bottom: [11, 2],
    side: [11, 2],
    placeable: false,
  },
  {
    name: 'diamond',
    solid: false,
    collision: false,
    top: [12, 2],
    bottom: [12, 2],
    side: [12, 2],
    placeable: false,
  },
  {
    name: 'furnace',
    solid: true,
    collision: true,
    top: [13, 2],
    bottom: [13, 2],
    side: [14, 2],
    hardness: 1.2,
    toolType: 'pickaxe',
    interactable: true,
  },
  /* ── door ── */
  {
    name: 'door',
    solid: true,
    collision: true,
    top: [15, 2],
    bottom: [15, 2],
    side: [15, 2],
    hardness: 0.5,
    toolType: 'axe',
    interactable: true,
    doorBottom: true,
    creativeSkip: true,
  },
  /* ── real armor items (row 3) ── */
  {
    name: 'leather helmet',
    solid: false,
    collision: false,
    top: [0, 3],
    bottom: [0, 3],
    side: [0, 3],
    placeable: false,
    armorSlot: 0,
    armorPoints: 3,
  },
  {
    name: 'leather chestplate',
    solid: false,
    collision: false,
    top: [1, 3],
    bottom: [1, 3],
    side: [1, 3],
    placeable: false,
    armorSlot: 1,
    armorPoints: 5,
  },
  {
    name: 'leather leggings',
    solid: false,
    collision: false,
    top: [2, 3],
    bottom: [2, 3],
    side: [2, 3],
    placeable: false,
    armorSlot: 2,
    armorPoints: 4,
  },
  {
    name: 'leather boots',
    solid: false,
    collision: false,
    top: [3, 3],
    bottom: [3, 3],
    side: [3, 3],
    placeable: false,
    armorSlot: 3,
    armorPoints: 2,
  },
  {
    name: 'iron helmet',
    solid: false,
    collision: false,
    top: [4, 3],
    bottom: [4, 3],
    side: [4, 3],
    placeable: false,
    armorSlot: 0,
    armorPoints: 5,
  },
  {
    name: 'iron chestplate',
    solid: false,
    collision: false,
    top: [5, 3],
    bottom: [5, 3],
    side: [5, 3],
    placeable: false,
    armorSlot: 1,
    armorPoints: 8,
  },
  {
    name: 'iron leggings',
    solid: false,
    collision: false,
    top: [6, 3],
    bottom: [6, 3],
    side: [6, 3],
    placeable: false,
    armorSlot: 2,
    armorPoints: 6,
  },
  {
    name: 'iron boots',
    solid: false,
    collision: false,
    top: [7, 3],
    bottom: [7, 3],
    side: [7, 3],
    placeable: false,
    armorSlot: 3,
    armorPoints: 3,
  },
  /* Open door — same look as door, passable (toggle closed with use). */
  {
    name: 'door open',
    solid: true,
    collision: false,
    top: [15, 2],
    bottom: [15, 2],
    side: [15, 2],
    hardness: 0.5,
    toolType: 'axe',
    interactable: true,
    doorBottom: true,
    creativeSkip: true,
  },
  /* Upper half of a two-block-tall door (paired with door / door open below). */
  {
    name: 'door top',
    solid: true,
    collision: true,
    top: [15, 2],
    bottom: [15, 2],
    side: [15, 2],
    placeable: false,
    hardness: 0.5,
    toolType: 'axe',
    interactable: true,
    doorTop: true,
    creativeSkip: true,
  },
  {
    name: 'door open top',
    solid: true,
    collision: false,
    top: [15, 2],
    bottom: [15, 2],
    side: [15, 2],
    placeable: false,
    hardness: 0.5,
    toolType: 'axe',
    interactable: true,
    doorTop: true,
    creativeSkip: true,
  },
  /* ── biome blocks (row 1, cols 10-13) ── */
  {
    name: 'snow',
    solid: true,
    collision: true,
    top: [10, 1],
    bottom: [10, 1],
    side: [10, 1],
    hardness: 0.2,
    toolType: 'shovel',
  },
  {
    name: 'ice',
    solid: true,
    collision: true,
    top: [11, 1],
    bottom: [11, 1],
    side: [11, 1],
    hardness: 0.5,
    toolType: 'pickaxe',
    alpha: true,
  },
  {
    name: 'cactus',
    solid: true,
    collision: true,
    top: [13, 1],
    bottom: [13, 1],
    side: [12, 1],
    hardness: 0.4,
  },
  {
    name: 'sandstone',
    solid: true,
    collision: true,
    top: [14, 1],
    bottom: [14, 1],
    side: [14, 1],
    hardness: 0.8,
    toolType: 'pickaxe',
  },
  /* Tall grass — two-block plant; bottom placeable on grass/dirt, top meshed from bottom cell. */
  {
    name: 'tall grass',
    solid: false,
    collision: false,
    top: [8, 3],
    bottom: [8, 3],
    side: [8, 3],
    alpha: true,
    hardness: 0,
    tallGrassBottom: true,
  },
  {
    name: 'tall grass top',
    solid: false,
    collision: false,
    top: [8, 3],
    bottom: [8, 3],
    side: [8, 3],
    alpha: true,
    hardness: 0,
    tallGrassTop: true,
    placeable: false,
    creativeSkip: true,
  },
  /* Short grass — half-block-tall crossed billboards on grass/dirt. */
  {
    name: 'short grass',
    solid: false,
    collision: false,
    top: [9, 3],
    bottom: [9, 3],
    side: [9, 3],
    alpha: true,
    hardness: 0,
    shortGrass: true,
  },
  {
    name: 'crafting table',
    solid: true,
    collision: true,
    top: [10, 3],
    bottom: [12, 3],
    side: [11, 3],
    hardness: 0.9,
    toolType: 'axe',
    interactable: true,
  },
  {
    name: 'lava',
    solid: true,
    collision: false,
    top: [13, 3],
    bottom: [13, 3],
    side: [13, 3],
    alpha: true,
    fluid: true,
    indestructible: true,
    creativeSkip: true,
  },
  {
    name: 'farmland',
    solid: true,
    collision: true,
    top: [2, 0],
    bottom: [2, 0],
    side: [2, 0],
    hardness: 0.6,
    toolType: 'shovel',
  },
  {
    name: 'wheat (stage 1)',
    solid: false,
    collision: false,
    top: [9, 3],
    bottom: [9, 3],
    side: [9, 3],
    alpha: true,
    hardness: 0,
    farmCrop: true,
    placeable: false,
  },
  {
    name: 'wheat (stage 2)',
    solid: false,
    collision: false,
    top: [9, 3],
    bottom: [9, 3],
    side: [9, 3],
    alpha: true,
    hardness: 0,
    farmCrop: true,
    placeable: false,
    creativeSkip: true,
  },
  {
    name: 'wheat (stage 3)',
    solid: false,
    collision: false,
    top: [9, 3],
    bottom: [9, 3],
    side: [9, 3],
    alpha: true,
    hardness: 0,
    farmCrop: true,
    placeable: false,
    creativeSkip: true,
  },
  {
    name: 'wheat (mature)',
    solid: false,
    collision: false,
    top: [9, 3],
    bottom: [9, 3],
    side: [9, 3],
    alpha: true,
    hardness: 0,
    farmCrop: true,
    placeable: false,
    creativeSkip: true,
  },
  {
    name: 'wheat seeds',
    solid: false,
    collision: false,
    top: [8, 3],
    bottom: [8, 3],
    side: [8, 3],
    placeable: false,
  },
  {
    name: 'mutton',
    solid: false,
    collision: false,
    top: [0, 4],
    bottom: [0, 4],
    side: [0, 4],
    placeable: false,
  },
  {
    name: 'wool',
    solid: false,
    collision: false,
    top: [1, 4],
    bottom: [1, 4],
    side: [1, 4],
    placeable: false,
  },
  {
    name: 'raw chicken',
    solid: false,
    collision: false,
    top: [2, 4],
    bottom: [2, 4],
    side: [2, 4],
    placeable: false,
  },
  {
    name: 'feather',
    solid: false,
    collision: false,
    top: [3, 4],
    bottom: [3, 4],
    side: [3, 4],
    placeable: false,
  },
  {
    name: 'cooked porkchop',
    solid: false,
    collision: false,
    top: [4, 4],
    bottom: [4, 4],
    side: [4, 4],
    placeable: false,
  },
  {
    name: 'cooked mutton',
    solid: false,
    collision: false,
    top: [5, 4],
    bottom: [5, 4],
    side: [5, 4],
    placeable: false,
  },
  {
    name: 'cooked chicken',
    solid: false,
    collision: false,
    top: [6, 4],
    bottom: [6, 4],
    side: [6, 4],
    placeable: false,
  },
  {
    name: 'steak',
    solid: false,
    collision: false,
    top: [7, 4],
    bottom: [7, 4],
    side: [7, 4],
    placeable: false,
  },
  {
    name: 'ink sac',
    solid: false,
    collision: false,
    top: [8, 4],
    bottom: [8, 4],
    side: [8, 4],
    placeable: false,
  },
  {
    name: 'diamond pickaxe',
    solid: false,
    collision: false,
    top: [0, 5],
    bottom: [0, 5],
    side: [0, 5],
    placeable: false,
  },
  {
    name: 'diamond axe',
    solid: false,
    collision: false,
    top: [1, 5],
    bottom: [1, 5],
    side: [1, 5],
    placeable: false,
  },
  {
    name: 'diamond shovel',
    solid: false,
    collision: false,
    top: [2, 5],
    bottom: [2, 5],
    side: [2, 5],
    placeable: false,
  },
  {
    name: 'diamond sword',
    solid: false,
    collision: false,
    top: [3, 5],
    bottom: [3, 5],
    side: [3, 5],
    placeable: false,
  },
  {
    name: 'wheat',
    solid: false,
    collision: false,
    top: [4, 5],
    bottom: [4, 5],
    side: [4, 5],
    placeable: false,
  },
  {
    name: 'bread',
    solid: false,
    collision: false,
    top: [5, 5],
    bottom: [5, 5],
    side: [5, 5],
    placeable: false,
  },
  {
    name: 'egg',
    solid: false,
    collision: false,
    top: [6, 5],
    bottom: [6, 5],
    side: [6, 5],
    placeable: false,
  },
  {
    name: 'diamond helmet',
    solid: false,
    collision: false,
    top: [7, 5],
    bottom: [7, 5],
    side: [7, 5],
    placeable: false,
    armorSlot: 0,
    armorPoints: 3,
  },
  {
    name: 'diamond chestplate',
    solid: false,
    collision: false,
    top: [8, 5],
    bottom: [8, 5],
    side: [8, 5],
    placeable: false,
    armorSlot: 1,
    armorPoints: 8,
  },
  {
    name: 'diamond leggings',
    solid: false,
    collision: false,
    top: [9, 5],
    bottom: [9, 5],
    side: [9, 5],
    placeable: false,
    armorSlot: 2,
    armorPoints: 6,
  },
  {
    name: 'diamond boots',
    solid: false,
    collision: false,
    top: [10, 5],
    bottom: [10, 5],
    side: [10, 5],
    placeable: false,
    armorSlot: 3,
    armorPoints: 3,
  },
];

/** Safe block definition for corrupt / out-of-range ids (treat as air). */
export function blockDef(id) {
  const d = BLOCKS[id];
  return d !== undefined ? d : BLOCKS[0];
}

export const BlockId = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  LOG: 4,
  LEAVES: 5,
  SAND: 6,
  PLANKS: 7,
  COBBLE: 8,
  GLASS: 9,
  WATER: 10,
  BEDROCK: 11,
  PORKCHOP: 12,
  BEEF: 13,
  LEATHER: 14,
  WOODEN_PICKAXE: 15,
  WOODEN_AXE: 16,
  WOODEN_SHOVEL: 17,
  WOODEN_SWORD: 18,
  STONE_PICKAXE: 19,
  STONE_AXE: 20,
  STONE_SHOVEL: 21,
  STONE_SWORD: 22,
  STICK: 23,
  TORCH: 24,
  BOOK: 25,
  ROTTEN_FLESH: 26,
  IRON_NUGGET: 27,
  IRON_INGOT: 28,
  IRON_PICKAXE: 29,
  IRON_AXE: 30,
  IRON_SHOVEL: 31,
  IRON_SWORD: 32,
  COAL_ORE: 33,
  IRON_ORE: 34,
  DIAMOND_ORE: 35,
  COAL: 36,
  DIAMOND: 37,
  FURNACE: 38,
  DOOR: 39,
  LEATHER_HELMET: 40,
  LEATHER_CHESTPLATE: 41,
  LEATHER_LEGGINGS: 42,
  LEATHER_BOOTS: 43,
  IRON_HELMET: 44,
  IRON_CHESTPLATE: 45,
  IRON_LEGGINGS: 46,
  IRON_BOOTS: 47,
  DOOR_OPEN: 48,
  DOOR_TOP: 49,
  DOOR_OPEN_TOP: 50,
  SNOW: 51,
  ICE: 52,
  CACTUS: 53,
  SANDSTONE: 54,
  TALL_GRASS_BOTTOM: 55,
  TALL_GRASS_TOP: 56,
  SHORT_GRASS: 57,
  CRAFTING_TABLE: 58,
  LAVA: 59,
  FARMLAND: 60,
  WHEAT_0: 61,
  WHEAT_1: 62,
  WHEAT_2: 63,
  WHEAT_3: 64,
  WHEAT_SEEDS: 65,
  MUTTON: 66,
  WOOL: 67,
  RAW_CHICKEN: 68,
  FEATHER: 69,
  COOKED_PORKCHOP: 70,
  COOKED_MUTTON: 71,
  COOKED_CHICKEN: 72,
  STEAK: 73,
  INK_SAC: 74,
  DIAMOND_PICKAXE: 75,
  DIAMOND_AXE: 76,
  DIAMOND_SHOVEL: 77,
  DIAMOND_SWORD: 78,
  WHEAT: 79,
  BREAD: 80,
  EGG: 81,
  DIAMOND_HELMET: 82,
  DIAMOND_CHESTPLATE: 83,
  DIAMOND_LEGGINGS: 84,
  DIAMOND_BOOTS: 85,
};

/** Wheat crop blocks on farmland (growth stages). */
export function isWheatCropId(id) {
  return id >= BlockId.WHEAT_0 && id <= BlockId.WHEAT_3;
}

/** @param {number} id */
export function isDoorBottomId(id) {
  return id === BlockId.DOOR || id === BlockId.DOOR_OPEN;
}

/** @param {number} id */
export function isDoorTopId(id) {
  return id === BlockId.DOOR_TOP || id === BlockId.DOOR_OPEN_TOP;
}

/** @param {number} id */
export function isTallGrassBottomId(id) {
  return id === BlockId.TALL_GRASS_BOTTOM;
}

/** @param {number} id */
export function isTallGrassTopId(id) {
  return id === BlockId.TALL_GRASS_TOP;
}

/** Tool type for a held item — used for mining speed calculations. */
export const TOOL_INFO = {
  [BlockId.WOODEN_PICKAXE]: { type: 'pickaxe', tier: 1, speed: 2.0, durability: 60, damage: 3 },
  [BlockId.WOODEN_AXE]:     { type: 'axe',     tier: 1, speed: 2.0, durability: 60, damage: 4 },
  [BlockId.WOODEN_SHOVEL]:  { type: 'shovel',   tier: 1, speed: 2.0, durability: 60, damage: 2 },
  [BlockId.WOODEN_SWORD]:   { type: 'sword',    tier: 1, speed: 1.0, durability: 60, damage: 5 },
  [BlockId.STONE_PICKAXE]:  { type: 'pickaxe', tier: 2, speed: 3.0, durability: 132, damage: 4 },
  [BlockId.STONE_AXE]:      { type: 'axe',     tier: 2, speed: 3.0, durability: 132, damage: 5 },
  [BlockId.STONE_SHOVEL]:   { type: 'shovel',   tier: 2, speed: 3.0, durability: 132, damage: 3 },
  [BlockId.STONE_SWORD]:    { type: 'sword',    tier: 2, speed: 1.0, durability: 132, damage: 6 },
  [BlockId.IRON_PICKAXE]:   { type: 'pickaxe', tier: 3, speed: 5.0, durability: 250, damage: 5 },
  [BlockId.IRON_AXE]:       { type: 'axe',     tier: 3, speed: 5.0, durability: 250, damage: 6 },
  [BlockId.IRON_SHOVEL]:    { type: 'shovel',  tier: 3, speed: 5.0, durability: 250, damage: 3 },
  [BlockId.IRON_SWORD]:     { type: 'sword',   tier: 3, speed: 1.0, durability: 250, damage: 8 },
  [BlockId.DIAMOND_PICKAXE]: { type: 'pickaxe', tier: 4, speed: 7.0, durability: 520, damage: 6 },
  [BlockId.DIAMOND_AXE]:     { type: 'axe',     tier: 4, speed: 7.0, durability: 520, damage: 7 },
  [BlockId.DIAMOND_SHOVEL]:  { type: 'shovel',  tier: 4, speed: 7.0, durability: 520, damage: 4 },
  [BlockId.DIAMOND_SWORD]:   { type: 'sword',   tier: 4, speed: 1.0, durability: 520, damage: 10 },
};

/** @param {number} blockId */
export function toolDurabilityMax(blockId) {
  return TOOL_INFO[blockId]?.durability ?? 0;
}

/**
 * Which armor rail index (0 helmet … 3 boots) a block may equip into.
 * Reads from block def `armorSlot` field, with legacy block fallback.
 */
export const ARMOR_SLOT_FOR_BLOCK_ID = {
  [BlockId.LEATHER_HELMET]: 0,
  [BlockId.LEATHER_CHESTPLATE]: 1,
  [BlockId.LEATHER_LEGGINGS]: 2,
  [BlockId.LEATHER_BOOTS]: 3,
  [BlockId.IRON_HELMET]: 0,
  [BlockId.IRON_CHESTPLATE]: 1,
  [BlockId.IRON_LEGGINGS]: 2,
  [BlockId.IRON_BOOTS]: 3,
  [BlockId.DIAMOND_HELMET]: 0,
  [BlockId.DIAMOND_CHESTPLATE]: 1,
  [BlockId.DIAMOND_LEGGINGS]: 2,
  [BlockId.DIAMOND_BOOTS]: 3,
};

/** @returns {number | null} slot index or null if not equippable as armor */
export function armorSlotForBlock(blockId) {
  if (blockId <= 0) return null;
  const s = ARMOR_SLOT_FOR_BLOCK_ID[blockId];
  return s === undefined ? null : s;
}

/**
 * Total armor points from equipped armor slots.
 * @param {Array<{blockId: number, count: number}>} armorSlots
 * @returns {number} 0–22 armor points
 */
export function totalArmorPoints(armorSlots) {
  let pts = 0;
  for (const slot of armorSlots) {
    if (slot.blockId > 0) {
      const def = BLOCKS[slot.blockId];
      if (def?.armorPoints) pts += def.armorPoints;
    }
  }
  return pts;
}

/**
 * Damage reduction multiplier from armor points.
 * Follows Minecraft formula: each armor point = 4% damage reduction, max 80%.
 * @param {number} armorPoints
 * @returns {number} multiplier 0.2–1.0 (1 = no reduction)
 */
export function armorDamageMultiplier(armorPoints) {
  return Math.max(0.2, 1 - armorPoints * 0.04);
}

/** Hotbar: default starter block ids */
export const HOTBAR_BLOCKS = [
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.STONE,
  BlockId.LOG,
  BlockId.LEAVES,
  BlockId.SAND,
  BlockId.PLANKS,
  BlockId.COBBLE,
  BlockId.GLASS,
];

/** Smelting recipes: input blockId → output blockId. */
export const SMELTING_RECIPES = {
  [BlockId.IRON_ORE]: BlockId.IRON_INGOT,
  [BlockId.COAL_ORE]: BlockId.COAL,
  [BlockId.DIAMOND_ORE]: BlockId.DIAMOND,
  [BlockId.SAND]: BlockId.GLASS,
  [BlockId.COBBLE]: BlockId.STONE,
  [BlockId.LOG]: BlockId.COAL,
  [BlockId.BEEF]: BlockId.STEAK,
  [BlockId.PORKCHOP]: BlockId.COOKED_PORKCHOP,
  [BlockId.MUTTON]: BlockId.COOKED_MUTTON,
  [BlockId.RAW_CHICKEN]: BlockId.COOKED_CHICKEN,
};

/** Survival block break → item dropped (otherwise drops itself if pickupable). */
export function getBlockDrop(blockId) {
  if (blockId === BlockId.COAL_ORE) return { blockId: BlockId.COAL, count: 1 };
  if (blockId === BlockId.DIAMOND_ORE) return { blockId: BlockId.DIAMOND, count: 1 };
  if (blockId === BlockId.DOOR_OPEN) return { blockId: BlockId.DOOR, count: 1 };
  if (blockId === BlockId.DOOR_OPEN_TOP) return { blockId: BlockId.DOOR, count: 1 };
  if (blockId === BlockId.DOOR_TOP) return { blockId: BlockId.DOOR, count: 1 };
  if (
    blockId === BlockId.TALL_GRASS_BOTTOM ||
    blockId === BlockId.TALL_GRASS_TOP ||
    blockId === BlockId.SHORT_GRASS
  ) {
    return { blockId: 0, count: 0 };
  }
  if (blockId === BlockId.LAVA) return { blockId: 0, count: 0 };
  if (blockId === BlockId.FARMLAND) return { blockId: BlockId.DIRT, count: 1 };
  if (blockId === BlockId.WHEAT_0 || blockId === BlockId.WHEAT_1 || blockId === BlockId.WHEAT_2) {
    return { blockId: BlockId.WHEAT_SEEDS, count: 1 };
  }
  if (blockId === BlockId.WHEAT_3) return { blockId: BlockId.WHEAT, count: 1 };
  return { blockId, count: 1 };
}

/** Block IDs that count as fuel in a furnace, and their burn duration in seconds. */
export const FUEL_BURN_TIME = {
  [BlockId.COAL]: 8,
  [BlockId.LOG]: 4,
  [BlockId.PLANKS]: 3,
  [BlockId.STICK]: 1.5,
};
