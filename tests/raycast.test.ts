import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { raycastBlocks } from '../src/raycast';
import { BlockId } from '../src/blocktypes';

describe('raycastBlocks', () => {
  it('hits a stone block ahead', () => {
    const w = new World(16, 1, { airOnly: true });
    w.set(5, 5, 5, BlockId.STONE);
    const r = raycastBlocks(w, 0.5, 5.5, 5.5, 1, 0, 0, 10);
    expect(r).not.toBeNull();
    expect(r.hit.x).toBe(5);
    expect(r.hit.y).toBe(5);
    expect(r.hit.z).toBe(5);
    expect(r.prev.x).toBe(4);
  });

  it('returns null through empty space', () => {
    const w = new World(8, 1, { airOnly: true });
    const r = raycastBlocks(w, 0.5, 0.5, 0.5, 1, 0, 0, 3);
    expect(r).toBeNull();
  });

  it('stops on bedrock like other solids', () => {
    const w = new World(12, 1, { airOnly: true });
    w.set(3, 5, 5, BlockId.BEDROCK);
    const r = raycastBlocks(w, 0.5, 5.5, 5.5, 1, 0, 0, 10);
    expect(r).not.toBeNull();
    expect(r.hit.x).toBe(3);
    expect(r.hit.y).toBe(5);
    expect(r.hit.z).toBe(5);
  });

  it('passes through open door (no collision)', () => {
    const w = new World(16, 1, { airOnly: true });
    w.set(4, 5, 5, BlockId.DOOR_OPEN);
    const r = raycastBlocks(w, 0.5, 5.5, 5.5, 1, 0, 0, 10);
    expect(r).toBeNull();
  });
});
