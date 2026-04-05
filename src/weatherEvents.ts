import * as THREE from 'three';
import { BIOME } from './worldgen';

/** @typedef {import('./weather.js').WeatherKind} WeatherKind */

/**
 * Random local storms / flurries / dust: they ramp in, hold, then fade; idle gaps vary.
 * Merged on top of {@link sampleWeather} in main.
 *
 * @typedef {{
 *   phase: 'idle' | 'rampUp' | 'sustain' | 'rampDown',
 *   kind: WeatherKind,
 *   strength: number,
 *   timer: number,
 *   targetStrength: number,
 *   nextIdleCheck: number,
 *   _rampSec: number,
 *   _sustainSec: number,
 *   _fadeSec: number,
 * }} WeatherEventState
 */

/**
 * @returns {WeatherEventState}
 */
export function createWeatherEventState() {
  return {
    phase: 'idle',
    kind: /** @type {WeatherKind} */ ('clear'),
    strength: 0,
    timer: 0,
    targetStrength: 0,
    nextIdleCheck: 3 + Math.random() * 14,
    _rampSec: 10,
    _sustainSec: 40,
    _fadeSec: 14,
  };
}

/**
 * @param {WeatherEventState} state
 */
export function resetWeatherEventState(state) {
  state.phase = 'idle';
  state.kind = 'clear';
  state.strength = 0;
  state.timer = 0;
  state.targetStrength = 0;
  state.nextIdleCheck = 2 + Math.random() * 12;
  state._rampSec = 10;
  state._sustainSec = 40;
  state._fadeSec = 14;
}

/**
 * @param {WeatherKind} kind
 * @param {number} strength
 * @param {number} dayF
 */
export function weatherVisualsForEventKind(kind, strength, dayF) {
  const db = 0.22 + 0.78 * THREE.MathUtils.clamp(dayF, 0, 1);
  const s = THREE.MathUtils.clamp(strength, 0, 1) * db;
  switch (kind) {
    case 'snow':
      return {
        fogAdd: s * 0.0075,
        skyDim: s * 0.24,
        cloudDarken: s * 0.58,
      };
    case 'dust':
      return {
        fogAdd: s * 0.0055,
        skyDim: s * 0.2,
        cloudDarken: s * 0.18,
      };
    case 'rain':
      return {
        fogAdd: s * 0.0065,
        skyDim: s * 0.21,
        cloudDarken: s * 0.52,
      };
    case 'mist':
      return {
        fogAdd: s * 0.0065 + s * 0.0035,
        skyDim: s * 0.21,
        cloudDarken: s * 0.52,
      };
    default:
      return { fogAdd: 0, skyDim: 0, cloudDarken: 0 };
  }
}

/**
 * @param {number} biome
 * @returns {WeatherKind}
 */
function pickEventKind(biome) {
  const r = Math.random();
  switch (biome) {
    case BIOME.TUNDRA:
      return 'snow';
    case BIOME.DESERT:
      return 'dust';
    case BIOME.FOREST:
      if (r < 0.48) return 'rain';
      if (r < 0.82) return 'mist';
      return 'rain';
    case BIOME.HIGHLANDS:
      if (r < 0.42) return 'rain';
      return 'mist';
    case BIOME.PLAINS:
    default:
      if (r < 0.52) return 'rain';
      if (r < 0.78) return 'mist';
      return 'rain';
  }
}

/**
 * @param {number} biome
 */
function startChanceForBiome(biome) {
  switch (biome) {
    case BIOME.TUNDRA:
      return 0.34;
    case BIOME.DESERT:
      return 0.24;
    case BIOME.FOREST:
      return 0.36;
    case BIOME.HIGHLANDS:
      return 0.33;
    case BIOME.PLAINS:
    default:
      return 0.3;
  }
}

/**
 * @param {WeatherEventState} state
 * @param {number} dt
 * @param {number} biome from {@link sampleWeather}
 * @param {number} dayF unused (kept for API symmetry / future night tweaks)
 */
export function tickWeatherEvents(state, dt, biome, dayF) {
  void dayF;
  const d = Math.min(Math.max(0, dt), 0.45);

  if (state.phase === 'idle') {
    state.nextIdleCheck -= d;
    if (state.nextIdleCheck <= 0) {
      if (Math.random() < startChanceForBiome(biome)) {
        state.phase = 'rampUp';
        state.kind = pickEventKind(biome);
        state.targetStrength = 0.4 + Math.random() * 0.52;
        state.strength = 0;
        state.timer = 0;
        state._rampSec = 7 + Math.random() * 16;
        state._sustainSec = 14 + Math.random() * 100;
        state._fadeSec = 9 + Math.random() * 22;
      }
      state.nextIdleCheck = 5 + Math.random() * 42;
    }
    return;
  }

  if (state.phase === 'rampUp') {
    state.timer += d;
    const rate = state.targetStrength / Math.max(0.35, state._rampSec);
    state.strength = Math.min(state.targetStrength, state.strength + d * rate * 1.2);
    if (state.strength >= state.targetStrength - 0.015) {
      state.strength = state.targetStrength;
      state.phase = 'sustain';
      state.timer = 0;
    }
    return;
  }

  if (state.phase === 'sustain') {
    state.timer += d;
    if (state.timer >= state._sustainSec) {
      state.phase = 'rampDown';
      state.timer = 0;
    }
    return;
  }

  /* rampDown */
  state.timer += d;
  const fadeRate = state.targetStrength / Math.max(0.35, state._fadeSec);
  state.strength = Math.max(0, state.strength - d * fadeRate);
  if (state.strength <= 0.018) {
    state.strength = 0;
    state.phase = 'idle';
    state.kind = 'clear';
    state.nextIdleCheck = 4 + Math.random() * 36;
  }
}

/**
 * @param {import('./weather.js').WeatherSample} base
 * @param {WeatherEventState} state
 * @param {number} dayF
 * @returns {import('./weather.js').WeatherSample}
 */
export function mergeWeatherEventBase(base, state, dayF) {
  if (state.phase === 'idle' && state.strength < 0.02) {
    return base;
  }

  const ev = weatherVisualsForEventKind(state.kind, state.strength, dayF);
  const u = THREE.MathUtils.smoothstep(state.strength, 0.04, 0.48);
  const kind = state.strength > 0.055 ? state.kind : base.kind;

  return {
    kind,
    strength: Math.min(1, base.strength * (1 - u) + state.strength * u),
    fogAdd: THREE.MathUtils.clamp(base.fogAdd * (1 - u) + ev.fogAdd * u, 0, 0.03),
    skyDim: THREE.MathUtils.clamp(base.skyDim * (1 - u) + ev.skyDim * u, 0, 0.45),
    cloudDarken: THREE.MathUtils.clamp(base.cloudDarken * (1 - u) + ev.cloudDarken * u, 0, 0.85),
    biome: base.biome,
  };
}
