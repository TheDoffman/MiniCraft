import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocktypes.js';
import {
  canPickupBlock,
  createInventory,
  deserializeInvSlot,
  INV_SIZE,
  HOTBAR_OFFSET,
} from '../src/inventory.js';

describe('inventory helpers', () => {
  it('createInventory has fixed slot count with empty slots', () => {
    const inv = createInventory();
    expect(inv).toHaveLength(INV_SIZE);
    expect(inv[HOTBAR_OFFSET].blockId).toBe(0);
    expect(inv[0].blockId).toBe(0);
  });

  it('canPickupBlock allows interactable placeables and food threshold', () => {
    expect(canPickupBlock(0)).toBe(false);
    expect(canPickupBlock(BlockId.PLANKS)).toBe(true);
    expect(canPickupBlock(BlockId.FURNACE)).toBe(true);
    expect(canPickupBlock(BlockId.CRAFTING_TABLE)).toBe(true);
    expect(canPickupBlock(BlockId.DOOR)).toBe(true);
    expect(canPickupBlock(BlockId.PORKCHOP)).toBe(true);
  });

  it('deserializeInvSlot normalizes one slot', () => {
    expect(deserializeInvSlot(null)).toEqual({ blockId: 0, count: 0 });
    expect(deserializeInvSlot({ blockId: BlockId.PLANKS, count: 5 })).toEqual({
      blockId: BlockId.PLANKS,
      count: 5,
    });
  });
});
