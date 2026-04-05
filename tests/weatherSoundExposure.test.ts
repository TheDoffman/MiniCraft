import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { BlockId } from '../src/blocktypes';
import { surfaceHeight } from '../src/worldgen';
import {
  computeRainParticleExposure,
  computeRainParticleExposureCached,
  computeRainShelter,
  computeRainShelterCached,
} from '../src/weatherSoundExposure';

describe('computeRainShelter', () => {
  it('silences rain deep below nominal surface', () => {
    const seed = 42_424;
    const w = new World(200, seed, { airOnly: true });
    const sh = surfaceHeight(8, 9, seed);
    const s = computeRainShelter(w, sh - 35, 8, 9, seed);
    expect(s.gainMul).toBeLessThan(0.06);
  });

  it('muffles under a low solid ceiling', () => {
    const seed = 7;
    const w = new World(200, seed, { airOnly: true });
    const bx = 4;
    const bz = 4;
    const sh = surfaceHeight(bx, bz, seed);
    const base = sh + 12;
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        w.set(x, base, z, BlockId.STONE);
      }
    }
    w.set(bx, base + 1, bz, BlockId.AIR);
    w.set(bx, base + 2, bz, BlockId.STONE);
    const eyeY = base + 1.62;
    const s = computeRainShelter(w, eyeY, bx, bz, seed);
    expect(s.gainMul).toBeLessThan(0.45);
    expect(s.muffle).toBeGreaterThan(0.35);
  });

  it('is near full gain in the open at surface height', () => {
    const seed = 99;
    const w = new World(200, seed, { airOnly: true });
    const ix = 3;
    const iz = 5;
    const sh = surfaceHeight(ix, iz, seed);
    const s = computeRainShelter(w, sh + 2, ix, iz, seed);
    expect(s.gainMul).toBeGreaterThan(0.92);
    expect(s.muffle).toBeLessThan(0.08);
  });
});

describe('computeRainParticleExposure', () => {
  it('is near zero in a buried cell with solid neighbors (tunnel / nook)', () => {
    const seed = 5;
    const w = new World(200, seed, { airOnly: true });
    const base = 90;
    const ix = 12;
    const iz = 12;
    for (let x = ix - 1; x <= ix + 1; x++) {
      for (let z = iz - 1; z <= iz + 1; z++) {
        for (let y = base; y <= base + 3; y++) {
          if (x === ix && z === iz) continue;
          w.set(x, y, z, BlockId.DIRT);
        }
        w.set(x, base + 4, z, BlockId.STONE);
      }
    }
    w.set(ix, base + 1, iz, BlockId.AIR);
    w.set(ix, base + 2, iz, BlockId.AIR);
    w.set(ix, base + 3, iz, BlockId.AIR);
    const eyeY = base + 2.62;
    const e = computeRainParticleExposure(w, eyeY, ix, iz, seed);
    expect(e.exposure).toBeLessThan(0.06);
  });

  it('is high in the open near nominal surface', () => {
    const seed = 99;
    const w = new World(200, seed, { airOnly: true });
    const ix = 3;
    const iz = 5;
    const sh = surfaceHeight(ix, iz, seed);
    const e = computeRainParticleExposure(w, sh + 2, ix, iz, seed);
    expect(e.exposure).toBeGreaterThan(0.85);
  });
});

describe('cached rain exposure', () => {
  it('returns identical exposure for same frame bucket', () => {
    const seed = 3;
    const w = new World(80, seed, { airOnly: true });
    const a = computeRainParticleExposureCached(w, 50, 2, 2, seed, 100);
    const b = computeRainParticleExposureCached(w, 50, 2, 2, seed, 100);
    expect(b.exposure).toBe(a.exposure);
    const c = computeRainShelterCached(w, 50, 2, 2, seed, 100);
    const d = computeRainShelterCached(w, 50, 2, 2, seed, 100);
    expect(d.gainMul).toBe(c.gainMul);
  });
});
