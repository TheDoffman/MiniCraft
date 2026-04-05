import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { buildRegionMesh } from '../src/mesher';
import { BlockId } from '../src/blocktypes';

describe('buildRegionMesh', () => {
  it('builds opaque geometry for a grass patch', () => {
    const w = new World(32, 42, { airOnly: true });
    w.ensureChunk(0, 0);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 5; y++) w.set(x, y, z, BlockId.DIRT);
        w.set(x, 5, z, BlockId.GRASS);
      }
    }
    const { opaque } = buildRegionMesh(w, 0, 16, 0, 16);
    expect(opaque.index?.count ?? 0).toBeGreaterThan(0);
  });
});
