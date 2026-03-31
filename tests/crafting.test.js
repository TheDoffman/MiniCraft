import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocktypes.js';
import { findRecipe, findRecipe3x3, normalizeCraftGrid } from '../src/crafting.js';

describe('shaped crafting', () => {
  it('2×2 planks → crafting table (inventory)', () => {
    const r = findRecipe([
      BlockId.PLANKS,
      BlockId.PLANKS,
      BlockId.PLANKS,
      BlockId.PLANKS,
    ]);
    expect(r).toEqual({ blockId: BlockId.CRAFTING_TABLE, count: 1 });
  });

  it('2×3 plank door fits in 3×3 grid (offset)', () => {
    const g = [
      0,
      BlockId.PLANKS,
      BlockId.PLANKS,
      0,
      BlockId.PLANKS,
      BlockId.PLANKS,
      0,
      BlockId.PLANKS,
      BlockId.PLANKS,
    ];
    expect(findRecipe3x3(g)).toEqual({ blockId: BlockId.DOOR, count: 1 });
  });

  it('normalizeCraftGrid trims empty margin', () => {
    const flat = [
      0,
      0,
      0,
      0,
      BlockId.LOG,
      0,
      0,
      0,
      0,
    ];
    const n = normalizeCraftGrid(flat, 3, 3);
    expect(n).toEqual({ w: 1, h: 1, cells: [BlockId.LOG] });
  });

  it('normalizeCraftGrid returns null when grid is empty', () => {
    expect(normalizeCraftGrid([0, 0, 0, 0], 2, 2)).toBeNull();
    expect(normalizeCraftGrid(new Array(9).fill(0), 3, 3)).toBeNull();
  });
});
