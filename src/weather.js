import * as THREE from 'three';
import { biomeParam, getBiome, BIOME, hashSeed } from './worldgen.js';

/** @typedef {'clear' | 'rain' | 'snow' | 'dust' | 'mist'} WeatherKind */

/**
 * @typedef {{
 *   kind: WeatherKind,
 *   strength: number,
 *   fogAdd: number,
 *   skyDim: number,
 *   cloudDarken: number,
 *   biome: number,
 * }} WeatherSample
 */

/**
 * Local weather from biome + slow regional phase (same patch stays coherent).
 * @param {import('./world.js').World} world
 * @param {number} px
 * @param {number} pz
 * @param {number} worldTimeTicks
 * @param {number} dayF 0–1 daylight
 * @returns {WeatherSample}
 */
export function sampleWeather(world, px, pz, worldTimeTicks, dayF) {
  const bx = Math.floor(px);
  const bz = Math.floor(pz);
  const b = biomeParam(bx, bz, world.seed);
  const biome = getBiome(b);
  const rx = Math.floor(bx / 44);
  const rz = Math.floor(bz / 44);
  const reg = hashSeed(rx, rz, world.seed + 1800);

  const periodTicks = 24000 * 7;
  const phase = ((worldTimeTicks % periodTicks) / periodTicks) * Math.PI * 2 * 2.2;
  const wave = 0.5 + 0.5 * Math.sin(phase + reg * 18.9898);
  const active = THREE.MathUtils.smoothstep(wave, 0.26, 0.74);
  const dayBoost = 0.22 + 0.78 * dayF;

  /** @type {WeatherKind} */
  let kind = 'clear';
  let strength = 0;
  let fogAdd = 0;
  let skyDim = 0;
  let cloudDarken = 0;

  switch (biome) {
    case BIOME.TUNDRA:
      kind = active > 0.18 ? 'snow' : 'clear';
      strength = kind === 'snow' ? active * (0.58 + 0.42 * reg) : 0;
      strength *= 0.82 + 0.18 * dayBoost;
      fogAdd = strength * 0.0075;
      skyDim = strength * 0.24;
      cloudDarken = strength * 0.58;
      break;
    case BIOME.DESERT:
      kind = active > 0.52 ? 'dust' : 'clear';
      strength = kind === 'dust' ? active * dayBoost * 0.92 : 0;
      fogAdd = strength * 0.0055;
      skyDim = strength * 0.2;
      cloudDarken = strength * 0.18;
      break;
    case BIOME.FOREST:
      if (active > 0.24) {
        kind = 'rain';
        strength = active * (0.72 + 0.28 * (1 - reg));
      } else {
        kind = 'mist';
        strength = 0.18 + (1 - active) * 0.42;
      }
      strength *= 0.75 + 0.25 * dayBoost;
      fogAdd = strength * 0.0065 + (kind === 'mist' ? 0.0035 : 0);
      skyDim = strength * 0.21;
      cloudDarken = strength * 0.52;
      break;
    case BIOME.HIGHLANDS:
      if (active > 0.48) {
        kind = 'rain';
        strength = active * 0.78;
      } else {
        kind = 'mist';
        strength = 0.22 + active * 0.38;
      }
      strength *= 0.78 + 0.22 * dayBoost;
      fogAdd = strength * 0.0082 + (kind === 'mist' ? 0.004 : 0);
      skyDim = strength * 0.2;
      cloudDarken = strength * 0.5;
      break;
    case BIOME.PLAINS:
    default:
      kind = active > 0.42 ? 'rain' : 'clear';
      strength = kind === 'rain' ? active * 0.8 : 0;
      strength *= 0.78 + 0.22 * dayBoost;
      fogAdd = strength * 0.0048;
      skyDim = strength * 0.17;
      cloudDarken = strength * 0.44;
      break;
  }

  strength = THREE.MathUtils.clamp(strength, 0, 1);
  fogAdd = Math.max(0, fogAdd);
  skyDim = THREE.MathUtils.clamp(skyDim, 0, 0.45);
  cloudDarken = THREE.MathUtils.clamp(cloudDarken, 0, 0.85);

  return { kind, strength, fogAdd, skyDim, cloudDarken, biome };
}

/**
 * Exponential smoothing toward {@link sampleWeather} output (numeric fields only; kind follows target).
 * @param {WeatherSample} cur
 * @param {WeatherSample} target
 * @param {number} dt
 * @param {number} [rate]
 * @returns {WeatherSample}
 */
export function smoothWeatherSample(cur, target, dt, rate = 2.8) {
  const k = 1 - Math.exp(-rate * dt);
  return {
    kind: target.kind,
    strength: cur.strength + (target.strength - cur.strength) * k,
    fogAdd: cur.fogAdd + (target.fogAdd - cur.fogAdd) * k,
    skyDim: cur.skyDim + (target.skyDim - cur.skyDim) * k,
    cloudDarken: cur.cloudDarken + (target.cloudDarken - cur.cloudDarken) * k,
    biome: target.biome,
  };
}
