import { describe, it, expect } from 'vitest';
import { biomeParam, hashSeed, surfaceHeight } from '../src/worldgen';

describe('hashSeed', () => {
  it('returns values in [0, 1)', () => {
    for (const s of [0, 1, 999, -3]) {
      const v = hashSeed(0, 0, s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic', () => {
    expect(hashSeed(3, 4, 99)).toBe(hashSeed(3, 4, 99));
  });
});

describe('biomeParam', () => {
  it('returns values in [0, 1]', () => {
    for (let i = 0; i < 20; i++) {
      const v = biomeParam(i * 3, i * 5, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('surfaceHeight', () => {
  it('returns an integer in a stable band', () => {
    const h = surfaceHeight(10, 10, 42);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThan(90);
    expect(h).toBeLessThan(185);
  });

  it('averages ~120–130 blocks above bedrock (y=0)', () => {
    let sum = 0;
    const n = 240;
    for (let i = 0; i < n; i++) {
      sum += surfaceHeight(i * 19, i * 31, 135791);
    }
    const mean = sum / n;
    expect(mean).toBeGreaterThan(118);
    expect(mean).toBeLessThan(133);
  });
});
