import { describe, it, expect } from 'vitest';
import { World } from '../src/world.js';
import { sampleWeather, smoothWeatherSample } from '../src/weather.js';
import { biomeParam, getBiome } from '../src/worldgen.js';

describe('weather', () => {
  it('sampleWeather matches local biome and stays bounded', () => {
    const w = new World(48, 42, { airOnly: true });
    const ticks = 12000;
    const dayF = 0.85;
    const spots = [
      [0, 0],
      [200, 200],
      [400, -120],
      [-300, 600],
      [900, 900],
    ];
    for (const [x, z] of spots) {
      const bio = getBiome(biomeParam(Math.floor(x), Math.floor(z), w.seed));
      const s = sampleWeather(w, x, z, ticks, dayF);
      expect(s.biome).toBe(bio);
      expect(s.strength).toBeGreaterThanOrEqual(0);
      expect(s.strength).toBeLessThanOrEqual(1);
      expect(s.fogAdd).toBeGreaterThanOrEqual(0);
      expect(s.skyDim).toBeGreaterThanOrEqual(0);
      expect(s.cloudDarken).toBeGreaterThanOrEqual(0);
      expect(['clear', 'rain', 'snow', 'dust', 'mist']).toContain(s.kind);
    }
  });

  it('smoothWeatherSample eases toward target', () => {
    const cur = {
      kind: 'clear',
      strength: 0,
      fogAdd: 0,
      skyDim: 0,
      cloudDarken: 0,
      biome: 1,
    };
    const target = {
      kind: 'rain',
      strength: 1,
      fogAdd: 0.01,
      skyDim: 0.2,
      cloudDarken: 0.5,
      biome: 1,
    };
    const next = smoothWeatherSample(cur, target, 0.1, 5);
    expect(next.strength).toBeGreaterThan(cur.strength);
    expect(next.strength).toBeLessThan(target.strength);
    expect(next.kind).toBe('rain');
  });
});
