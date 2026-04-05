import { describe, it, expect } from 'vitest';
import { BlockId } from '../src/blocktypes';
import {
  addItemToInventory,
  canPickupBlock,
  createInventory,
  deserializeInvSlot,
  INV_SIZE,
  HOTBAR_OFFSET,
} from '../src/inventory';

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
    expect(canPickupBlock(BlockId.WATER)).toBe(false);
    expect(canPickupBlock(BlockId.LAVA)).toBe(false);
  });

  it('deserializeInvSlot normalizes one slot', () => {
    expect(deserializeInvSlot(null)).toEqual({ blockId: 0, count: 0 });
    expect(deserializeInvSlot({ blockId: BlockId.PLANKS, count: 5 })).toEqual({
      blockId: BlockId.PLANKS,
      count: 5,
    });
  });

  it('addItemToInventory fills hotbar before backpack when used in two steps', () => {
    const inv = createInventory();
    expect(addItemToInventory(inv, BlockId.DIRT, 1, { hotbarOnly: true })).toBe(0);
    expect(inv[HOTBAR_OFFSET].blockId).toBe(BlockId.DIRT);
    expect(inv[HOTBAR_OFFSET].count).toBe(1);
    expect(inv[0].blockId).toBe(0);
  });

  it('backpackOnly uses storage slots 0..26 only', () => {
    const inv = createInventory();
    for (let i = HOTBAR_OFFSET; i < INV_SIZE; i++) {
      inv[i].blockId = BlockId.STONE;
      inv[i].count = 64;
    }
    expect(addItemToInventory(inv, BlockId.DIRT, 3, { hotbarOnly: true })).toBe(3);
    expect(addItemToInventory(inv, BlockId.DIRT, 3, { backpackOnly: true })).toBe(0);
    expect(inv[0].blockId).toBe(BlockId.DIRT);
    expect(inv[0].count).toBe(3);
  });
});
