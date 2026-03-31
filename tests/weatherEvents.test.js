import { describe, it, expect } from 'vitest';
import {
  createWeatherEventState,
  mergeWeatherEventBase,
  resetWeatherEventState,
  weatherVisualsForEventKind,
} from '../src/weatherEvents.js';
import { BIOME } from '../src/worldgen.js';

describe('weather events', () => {
  it('merge returns same object when no active event', () => {
    const base = {
      kind: 'clear',
      strength: 0,
      fogAdd: 0,
      skyDim: 0,
      cloudDarken: 0,
      biome: BIOME.PLAINS,
    };
    const s = createWeatherEventState();
    resetWeatherEventState(s);
    expect(mergeWeatherEventBase(base, s, 0.9)).toBe(base);
  });

  it('merge applies rain overlay when event strength is up', () => {
    const base = {
      kind: 'mist',
      strength: 0.15,
      fogAdd: 0.002,
      skyDim: 0.08,
      cloudDarken: 0.12,
      biome: BIOME.FOREST,
    };
    const s = createWeatherEventState();
    s.phase = 'sustain';
    s.kind = 'rain';
    s.strength = 0.72;
    const m = mergeWeatherEventBase(base, s, 0.88);
    expect(m.kind).toBe('rain');
    expect(m.strength).toBeGreaterThanOrEqual(base.strength);
    expect(m.cloudDarken).toBeGreaterThanOrEqual(base.cloudDarken);
  });

  it('weatherVisualsForEventKind stays bounded', () => {
    const v = weatherVisualsForEventKind('snow', 1, 1);
    expect(v.skyDim).toBeGreaterThanOrEqual(0);
    expect(v.skyDim).toBeLessThanOrEqual(0.45);
    expect(v.fogAdd).toBeGreaterThanOrEqual(0);
  });
});
