import { describe, it, expect } from 'vitest';
import {
  BLOCKS,
  BlockId,
  SMELTING_RECIPES,
  blockDef,
  isWheatCropId,
  getBlockDrop,
} from '../src/blocktypes';

describe('BlockId enum matches BLOCKS array', () => {
  it('FARMLAND is at index 60', () => {
    expect(BLOCKS[BlockId.FARMLAND].name).toBe('farmland');
  });

  it('WHEAT_0..WHEAT_3 are at indices 61..64', () => {
    expect(BLOCKS[BlockId.WHEAT_0].farmCrop).toBe(true);
    expect(BLOCKS[BlockId.WHEAT_3].farmCrop).toBe(true);
    expect(BlockId.WHEAT_3).toBe(64);
  });

  it('WHEAT_SEEDS is at index 65', () => {
    expect(BLOCKS[BlockId.WHEAT_SEEDS].name).toBe('wheat seeds');
  });

  it('mob drops mutton..feather at indices 66..69', () => {
    expect(BLOCKS[BlockId.MUTTON].name).toBe('mutton');
    expect(BLOCKS[BlockId.WOOL].name).toBe('wool');
    expect(BLOCKS[BlockId.RAW_CHICKEN].name).toBe('raw chicken');
    expect(BLOCKS[BlockId.FEATHER].name).toBe('feather');
    expect(BlockId.FEATHER).toBe(69);
  });

  it('cooked foods, steak, ink, diamond tools at indices 70..78', () => {
    expect(BLOCKS[BlockId.COOKED_PORKCHOP].name).toBe('cooked porkchop');
    expect(BLOCKS[BlockId.STEAK].name).toBe('steak');
    expect(BLOCKS[BlockId.INK_SAC].name).toBe('ink sac');
    expect(BLOCKS[BlockId.DIAMOND_SWORD].name).toBe('diamond sword');
    expect(BlockId.DIAMOND_SWORD).toBe(78);
  });
});

describe('SMELTING_RECIPES', () => {
  it('raw meats smelt to cooked variants', () => {
    expect(SMELTING_RECIPES[BlockId.BEEF]).toBe(BlockId.STEAK);
    expect(SMELTING_RECIPES[BlockId.PORKCHOP]).toBe(BlockId.COOKED_PORKCHOP);
    expect(SMELTING_RECIPES[BlockId.MUTTON]).toBe(BlockId.COOKED_MUTTON);
    expect(SMELTING_RECIPES[BlockId.RAW_CHICKEN]).toBe(BlockId.COOKED_CHICKEN);
  });
});

describe('blockDef', () => {
  it('returns air for unknown ids', () => {
    expect(blockDef(999_999).name).toBe('air');
    expect(blockDef(-1).solid).toBe(false);
  });

  it('returns real defs for valid ids', () => {
    expect(blockDef(BlockId.STONE).name).toBe('stone');
  });
});

describe('farming ids', () => {
  it('detects wheat crop stages', () => {
    expect(isWheatCropId(BlockId.WHEAT_0)).toBe(true);
    expect(isWheatCropId(BlockId.WHEAT_3)).toBe(true);
    expect(isWheatCropId(BlockId.WHEAT_SEEDS)).toBe(false);
  });

  it('drops seeds from immature wheat, wheat item from mature', () => {
    expect(getBlockDrop(BlockId.WHEAT_1)).toEqual({ blockId: BlockId.WHEAT_SEEDS, count: 1 });
    expect(getBlockDrop(BlockId.WHEAT_3)).toEqual({ blockId: BlockId.WHEAT, count: 1 });
  });
});
