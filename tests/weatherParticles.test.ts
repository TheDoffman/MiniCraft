import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { BlockId } from '../src/blocktypes';
import { isRainParticleOccluded } from '../src/weatherParticles';

describe('rain particle occlusion', () => {
  it('hides droplets behind a solid colliding block', () => {
    const w = new World(64, 1, { airOnly: true });
    w.set(7, 5, 4, BlockId.STONE);
    expect(isRainParticleOccluded(w, 0.5, 5.5, 4.5, 12.5, 5.5, 4.5)).toBe(true);
  });

  it('does not treat glass as a wall for rain particles', () => {
    const w = new World(64, 1, { airOnly: true });
    w.set(7, 5, 4, BlockId.GLASS);
    expect(isRainParticleOccluded(w, 0.5, 5.5, 4.5, 12.5, 5.5, 4.5)).toBe(false);
  });

  it('still occludes when the wall is near the far end of the ray (DDA must not skip last cell)', () => {
    const w = new World(64, 1, { airOnly: true });
    w.set(11, 5, 4, BlockId.STONE);
    expect(isRainParticleOccluded(w, 0.5, 5.5, 4.5, 11.9, 5.5, 4.5)).toBe(true);
  });
});
