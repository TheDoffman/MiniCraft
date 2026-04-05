import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { Player } from '../src/player';
import { BlockId } from '../src/blocktypes';

describe('Player lava', () => {
  it('updates in lava without throwing', () => {
    const w = new World(24, 99_001, { airOnly: true });
    w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 6; y++) w.set(x, y, z, BlockId.STONE);
        w.set(x, 6, z, BlockId.LAVA);
        w.set(x, 7, z, BlockId.LAVA);
      }
    }
    const p = new Player(8.5, 7.2, 8.5);
    const input = { forward: false, back: false, left: false, right: false, jump: false };
    expect(() => p.update(w, 1 / 60, input, 0)).not.toThrow();
    expect(p.inLava).toBe(true);
  });
});
