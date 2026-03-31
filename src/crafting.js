/**
 * Shaped crafting: recipes are minimal bounding boxes (row-major cells) → result.
 * 2×2 player grid and 3×3 table share the same recipe list; patterns may sit anywhere in the 3×3.
 */
import { BlockId } from './blocktypes.js';

/**
 * @typedef {{ w: number, h: number, cells: number[], result: { blockId: number, count: number } }} ShapedRecipe
 */

/**
 * @param {number[]} flat
 * @param {number} srcW
 * @param {number} srcH
 * @returns {{ w: number, h: number, cells: number[] } | null}
 */
export function normalizeCraftGrid(flat, srcW, srcH) {
  let minR = srcH;
  let maxR = -1;
  let minC = srcW;
  let maxC = -1;
  for (let r = 0; r < srcH; r++) {
    for (let c = 0; c < srcW; c++) {
      if (flat[r * srcW + c]) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) return null;
  const h = maxR - minR + 1;
  const w = maxC - minC + 1;
  const cells = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      cells.push(flat[r * srcW + c]);
    }
  }
  return { w, h, cells };
}

/**
 * @param {{ w: number, h: number, cells: number[] } | null} norm
 * @param {ShapedRecipe} recipe
 */
function matchesShaped(norm, recipe) {
  if (!norm || norm.w !== recipe.w || norm.h !== recipe.h) return false;
  for (let i = 0; i < norm.cells.length; i++) {
    if (norm.cells[i] !== recipe.cells[i]) return false;
  }
  return true;
}

/** @type {ShapedRecipe[]} */
const SHAPED_RECIPES = [];

/**
 * @param {number[]} cells row-major w×h
 * @param {number} w
 * @param {number} h
 * @param {{ blockId: number, count: number }} result
 */
function addRecipe(cells, w, h, result) {
  const norm = normalizeCraftGrid(cells, w, h);
  if (!norm) return;
  SHAPED_RECIPES.push({ w: norm.w, h: norm.h, cells: norm.cells, result });
}

function addFrom2x2(grid4, result) {
  addRecipe(grid4, 2, 2, result);
}

/* ── 2×2 source patterns (same as legacy inventory crafting) ── */
addFrom2x2([BlockId.LOG, 0, 0, 0], { blockId: BlockId.PLANKS, count: 4 });
addFrom2x2([BlockId.PLANKS, 0, BlockId.PLANKS, 0], { blockId: BlockId.STICK, count: 4 });
addFrom2x2([BlockId.PLANKS, BlockId.PLANKS, BlockId.STICK, 0], { blockId: BlockId.WOODEN_PICKAXE, count: 1 });
addFrom2x2([BlockId.PLANKS, BlockId.PLANKS, 0, BlockId.STICK], { blockId: BlockId.WOODEN_AXE, count: 1 });
addFrom2x2([BlockId.PLANKS, 0, BlockId.STICK, 0], { blockId: BlockId.WOODEN_SHOVEL, count: 1 });
addFrom2x2([BlockId.PLANKS, BlockId.STICK, 0, 0], { blockId: BlockId.WOODEN_SWORD, count: 1 });
addFrom2x2([BlockId.COBBLE, BlockId.COBBLE, BlockId.STICK, 0], { blockId: BlockId.STONE_PICKAXE, count: 1 });
addFrom2x2([BlockId.COBBLE, BlockId.COBBLE, 0, BlockId.STICK], { blockId: BlockId.STONE_AXE, count: 1 });
addFrom2x2([BlockId.COBBLE, 0, BlockId.STICK, 0], { blockId: BlockId.STONE_SHOVEL, count: 1 });
addFrom2x2([BlockId.COBBLE, BlockId.STICK, 0, 0], { blockId: BlockId.STONE_SWORD, count: 1 });
addFrom2x2([BlockId.LOG, 0, BlockId.STICK, 0], { blockId: BlockId.TORCH, count: 4 });
addFrom2x2([BlockId.PLANKS, 0, 0, BlockId.STICK], { blockId: BlockId.TORCH, count: 2 });
addFrom2x2([BlockId.STONE, BlockId.STONE, 0, 0], { blockId: BlockId.COBBLE, count: 2 });
addFrom2x2([BlockId.SAND, BlockId.SAND, 0, 0], { blockId: BlockId.GLASS, count: 1 });
addFrom2x2([BlockId.LEATHER, BlockId.LEATHER, 0, 0], { blockId: BlockId.LEATHER_HELMET, count: 1 });
addFrom2x2([BlockId.LEATHER, 0, BlockId.LEATHER, 0], { blockId: BlockId.LEATHER_CHESTPLATE, count: 1 });
addFrom2x2([0, 0, BlockId.LEATHER, BlockId.LEATHER], { blockId: BlockId.LEATHER_LEGGINGS, count: 1 });
addFrom2x2([0, BlockId.LEATHER, BlockId.LEATHER, 0], { blockId: BlockId.LEATHER_BOOTS, count: 1 });
addFrom2x2([BlockId.IRON_INGOT, BlockId.IRON_INGOT, 0, 0], { blockId: BlockId.IRON_HELMET, count: 1 });
addFrom2x2([BlockId.IRON_INGOT, 0, BlockId.IRON_INGOT, 0], { blockId: BlockId.IRON_CHESTPLATE, count: 1 });
addFrom2x2([0, 0, BlockId.IRON_INGOT, BlockId.IRON_INGOT], { blockId: BlockId.IRON_LEGGINGS, count: 1 });
addFrom2x2([0, BlockId.IRON_INGOT, BlockId.IRON_INGOT, 0], { blockId: BlockId.IRON_BOOTS, count: 1 });
addFrom2x2(
  [BlockId.COBBLE, BlockId.COBBLE, BlockId.COBBLE, BlockId.COBBLE],
  { blockId: BlockId.FURNACE, count: 1 },
);
addFrom2x2(
  [BlockId.PLANKS, BlockId.PLANKS, BlockId.PLANKS, BlockId.PLANKS],
  { blockId: BlockId.CRAFTING_TABLE, count: 1 },
);
addFrom2x2([BlockId.LEATHER, BlockId.LEATHER, BlockId.LEATHER, BlockId.STICK], { blockId: BlockId.BOOK, count: 1 });
addFrom2x2(
  [BlockId.IRON_NUGGET, BlockId.IRON_NUGGET, BlockId.IRON_NUGGET, BlockId.IRON_NUGGET],
  { blockId: BlockId.IRON_INGOT, count: 1 },
);
addFrom2x2([BlockId.IRON_INGOT, BlockId.IRON_INGOT, BlockId.STICK, 0], { blockId: BlockId.IRON_PICKAXE, count: 1 });
addFrom2x2([BlockId.IRON_INGOT, BlockId.IRON_INGOT, 0, BlockId.STICK], { blockId: BlockId.IRON_AXE, count: 1 });
addFrom2x2([BlockId.IRON_INGOT, 0, BlockId.STICK, 0], { blockId: BlockId.IRON_SHOVEL, count: 1 });
addFrom2x2([BlockId.IRON_INGOT, BlockId.STICK, 0, 0], { blockId: BlockId.IRON_SWORD, count: 1 });

/* Door: 2×3 planks (crafting table / 3×3 only in practice; 2×2 inventory cannot fit this shape). */
addRecipe(
  [
    BlockId.PLANKS,
    BlockId.PLANKS,
    BlockId.PLANKS,
    BlockId.PLANKS,
    BlockId.PLANKS,
    BlockId.PLANKS,
  ],
  2,
  3,
  { blockId: BlockId.DOOR, count: 1 },
);

/**
 * @param {number[]} normCells
 * @param {number} w
 * @param {number} h
 * @returns {{ blockId: number, count: number } | null}
 */
function findShapedInNormalized(normCells, w, h) {
  const norm = normalizeCraftGrid(normCells, w, h);
  if (!norm) return null;
  for (const recipe of SHAPED_RECIPES) {
    if (matchesShaped(norm, recipe)) return recipe.result;
  }
  return null;
}

/**
 * Try to match a 2×2 crafting grid (TL, TR, BL, BR).
 * @param {[number, number, number, number]} grid
 * @returns {{ blockId: number, count: number } | null}
 */
export function findRecipe(grid) {
  return findShapedInNormalized(grid, 2, 2);
}

/**
 * Try to match a 3×3 grid (row-major: 0–2 top row, …).
 * @param {number[]} grid9
 * @returns {{ blockId: number, count: number } | null}
 */
export function findRecipe3x3(grid9) {
  if (grid9.length !== 9) return null;
  return findShapedInNormalized(grid9, 3, 3);
}

/** @returns {[number, number, number, number]} */
export function createCraftingGrid() {
  return [0, 0, 0, 0];
}

/** @returns {number[]} */
export function createCraftingGrid3x3() {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

