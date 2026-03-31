import { describe, it, expect } from 'vitest';
import { World } from '../src/world.js';
import { BlockId } from '../src/blocktypes.js';
import { CHUNK_XZ } from '../src/chunks.js';

describe('World generate', () => {
  it('places indestructible bedrock at y=0', () => {
    const w = new World(48, 4242);
    w.ensureChunk(0, 0);
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        expect(w.get(lx, 0, lz)).toBe(BlockId.BEDROCK);
      }
    }
  });
});
