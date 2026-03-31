import { describe, it, expect } from 'vitest';
import { computeCaveLightFactors } from '../src/caveLighting.js';
import { surfaceHeight } from '../src/worldgen.js';

describe('computeCaveLightFactors', () => {
  it('is full strength at and above nominal surface', () => {
    const seed = 12345;
    const sh = surfaceHeight(10, 11, seed);
    const a = computeCaveLightFactors(sh + 3, 10, 11, seed);
    expect(a.sunMoonMul).toBeGreaterThan(0.98);
    expect(a.hemiMul).toBeGreaterThan(0.98);
    const b = computeCaveLightFactors(sh, 10, 11, seed);
    expect(b.sunMoonMul).toBeGreaterThan(0.95);
  });

  it('dims strongly when far below surface', () => {
    const seed = 42;
    const sh = surfaceHeight(5, 6, seed);
    const d = computeCaveLightFactors(sh - 45, 5, 6, seed);
    expect(d.sunMoonMul).toBeLessThan(0.12);
    expect(d.hemiMul).toBeLessThan(0.35);
    expect(d.sunMoonMul).toBeLessThan(d.hemiMul);
  });
});
