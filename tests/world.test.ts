import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { BlockId } from '../src/blocktypes';
import { CHUNK_XZ } from '../src/chunks';

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

describe('topSupportingSolidY', () => {
  it('ignores canopy above the feet when snapping ground', () => {
    const w = new World(32, 99, { airOnly: true });
    w.ensureChunk(0, 0);
    const x = 5;
    const z = 5;
    w.set(x, 2, z, BlockId.GRASS);
    w.set(x, 10, z, BlockId.LEAVES);
    expect(w.topSolidY(x, z)).toBe(10);
    expect(w.topSupportingSolidY(x, z, 3.2)).toBe(2);
  });

  it('still returns canopy block when feet are on it', () => {
    const w = new World(32, 99, { airOnly: true });
    w.ensureChunk(0, 0);
    const x = 4;
    const z = 4;
    w.set(x, 2, z, BlockId.GRASS);
    w.set(x, 10, z, BlockId.LEAVES);
    expect(w.topSupportingSolidY(x, z, 11)).toBe(10);
  });
});
