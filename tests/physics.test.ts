import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { collidesAABB, collidesWorldOrMobBoxes, aabbFullySubmergedInFluid } from '../src/physics';
import { BlockId } from '../src/blocktypes';

describe('collidesAABB', () => {
  it('collides with solid leaves', () => {
    const w = new World(16, 1, { airOnly: true });
    for (let y = 0; y < 8; y++) w.set(2, y, 2, BlockId.STONE);
    w.set(2, 8, 2, BlockId.LEAVES);
    const min = [1.5, 8, 1.5];
    const max = [2.5, 9.5, 2.5];
    expect(collidesAABB(w, min, max)).toBe(true);
  });

  it('hits solid stone', () => {
    const w = new World(16, 1, { airOnly: true });
    w.set(2, 5, 2, BlockId.STONE);
    const min = [1.5, 5, 1.5];
    const max = [2.5, 6.5, 2.5];
    expect(collidesAABB(w, min, max)).toBe(true);
  });
});

describe('collidesWorldOrMobBoxes', () => {
  it('is true when only a mob box overlaps', () => {
    const w = new World(16, 1, { airOnly: true });
    const min = [1.2, 4, 1.2];
    const max = [1.8, 5.5, 1.8];
    const mobBoxes = [{ min: [1.5, 4.2, 1.5], max: [1.7, 5.0, 1.7] }];
    expect(collidesAABB(w, min, max)).toBe(false);
    expect(collidesWorldOrMobBoxes(w, min, max, mobBoxes)).toBe(true);
  });
});

describe('aabbFullySubmergedInFluid', () => {
  it('is true when the whole box is only in water cells', () => {
    const w = new World(20, 1, { airOnly: true });
    for (let y = 4; y <= 12; y++) w.set(5, y, 5, BlockId.WATER);
    const min = [5.1, 6.0, 5.1];
    const max = [5.4, 8.0, 5.4];
    expect(aabbFullySubmergedInFluid(w, min, max)).toBe(true);
  });

  it('is false when the top of the box reaches air', () => {
    const w = new World(24, 1, { airOnly: true });
    for (let y = 4; y <= 10; y++) w.set(5, y, 5, BlockId.WATER);
    const min = [5.1, 8.0, 5.1];
    const max = [5.4, 11.5, 5.4];
    expect(aabbFullySubmergedInFluid(w, min, max)).toBe(false);
  });
});
