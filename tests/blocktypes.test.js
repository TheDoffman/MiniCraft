import { describe, it, expect } from 'vitest';
import { BLOCKS, BlockId } from '../src/blocktypes.js';

/** Every numeric {@link BlockId} must match the {@link BLOCKS} slot for that block/item. */
describe('BlockId ↔ BLOCKS alignment', () => {
  it('maps SNOW/ICE/biome and door halves to the correct definitions', () => {
    expect(BLOCKS[BlockId.SNOW].name).toBe('snow');
    expect(BLOCKS[BlockId.ICE].name).toBe('ice');
    expect(BLOCKS[BlockId.CACTUS].name).toBe('cactus');
    expect(BLOCKS[BlockId.SANDSTONE].name).toBe('sandstone');
    expect(BLOCKS[BlockId.TALL_GRASS_BOTTOM].name).toBe('tall grass');
    expect(BLOCKS[BlockId.TALL_GRASS_TOP].name).toBe('tall grass top');
    expect(BLOCKS[BlockId.SHORT_GRASS].name).toBe('short grass');
    expect(BLOCKS[BlockId.CRAFTING_TABLE].name).toBe('crafting table');
    expect(BLOCKS[BlockId.CRAFTING_TABLE].interactable).toBe(true);
    expect(BLOCKS[BlockId.LAVA].name).toBe('lava');
    expect(BLOCKS[BlockId.LAVA].fluid).toBe(true);
    expect(BLOCKS[BlockId.DOOR_TOP].name).toBe('door top');
    expect(BLOCKS[BlockId.DOOR_OPEN_TOP].name).toBe('door open top');
  });
});
