import { describe, it, expect } from 'vitest';
import { World } from '../src/world.js';
import { BlockId } from '../src/blocktypes.js';
import { recomputeWaterBox } from '../src/waterFlow.js';

describe('Minecraft-style water', () => {
  it('limits horizontal reach from a source and drains when cut off', () => {
    const w = new World(24, 1, { airOnly: true });
    const y = 10;
    const z = 8;
    for (let x = 0; x < 24; x++) {
      w.set(x, y - 1, z, BlockId.STONE);
    }
    w.set(5, y, z, BlockId.WATER);
    recomputeWaterBox(w, 0, 23, 0, 23, 0, 23);

    expect(w.get(5, y, z)).toBe(BlockId.WATER);
    expect(w.getWaterLevel(5, y, z)).toBe(0);
    expect(w.get(12, y, z)).toBe(BlockId.WATER);
    expect(w.getWaterLevel(12, y, z)).toBe(7);
    expect(w.get(13, y, z)).toBe(0);

    w.set(5, y, z, 0);
    recomputeWaterBox(w, 0, 23, 0, 23, 0, 23);
    expect(w.get(12, y, z)).toBe(0);
  });
});
