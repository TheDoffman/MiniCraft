import { blockDef } from './blocktypes';
import { surfaceHeight } from './worldgen';

/** @typedef {'full' | 'balanced' | 'minimal'} WeatherEffectsQuality */

/** Neighbor columns for particle exposure (center + N/E/S/W). Fewer than 3×3, similar tunnel behavior. */
const PLUS_OFFSETS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Blocks that shield outdoor weather sound (solid, colliding, not fluid). */
function occludesOutdoorSound(id) {
  if (id === 0) return false;
  const def = blockDef(id);
  if (def.fluid || !def.solid || def.collision === false) return false;
  return true;
}

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * 0 = solid ceiling very close above this XZ column, 1 = open sky (no solid hit scanning up).
 */
function ceilingOpenInColumn(world, eyeY, ix, iz) {
  const h = world.height;
  const yStart = Math.min(h - 1, Math.max(0, Math.ceil(eyeY)));
  let firstSolidY = null;
  for (let y = yStart; y < h; y++) {
    if (occludesOutdoorSound(world.get(ix, y, iz))) {
      firstSolidY = y;
      break;
    }
  }
  const ceilingGap = firstSolidY === null ? 999 : Math.max(0, firstSolidY - yStart);
  return firstSolidY === null ? 1 : Math.max(0, Math.min(1, (ceilingGap - 0.5) / 10));
}

/**
 * Shared surface + ceiling work for rain particles and rain audio.
 * @returns {{ exposure: number, gainMul: number, muffle: number }}
 */
function computeRainExposureAndShelterInternal(world, eyeY, ix, iz, seed) {
  let minCeilingOpen = 1;
  let centerCeilingOpen = 1;
  for (let p = 0; p < PLUS_OFFSETS.length; p++) {
    const dx = PLUS_OFFSETS[p][0];
    const dz = PLUS_OFFSETS[p][1];
    const o = ceilingOpenInColumn(world, eyeY, ix + dx, iz + dz);
    if (dx === 0 && dz === 0) centerCeilingOpen = o;
    minCeilingOpen = Math.min(minCeilingOpen, o);
  }

  const sh = surfaceHeight(ix, iz, seed);
  const depthBelowSurface = sh - eyeY;

  let depthMulExp = 1;
  if (depthBelowSurface > 1.5) {
    const t = smoothstep01((depthBelowSurface - 1.5) / 24);
    depthMulExp = 1 - t;
  }
  const exposure = Math.max(0, Math.min(1, minCeilingOpen * minCeilingOpen * depthMulExp));

  const ceilingGainMul = 0.16 + 0.84 * centerCeilingOpen;

  let depthMulShelter = 1;
  if (depthBelowSurface > 3) {
    const t = smoothstep01((depthBelowSurface - 3) / 26);
    depthMulShelter = 1 - t;
  }

  const gainMul = ceilingGainMul * depthMulShelter;

  const muffle =
    depthMulShelter < 0.04
      ? 0
      : (1 - centerCeilingOpen) * (0.5 + 0.5 * Math.min(1, depthMulShelter * 1.25));

  return { exposure, gainMul, muffle };
}

/**
 * Rain loudness and muffling from terrain depth and overhead cover (house / cave ceiling).
 * @param {import('./world.js').World} world
 * @param {number} eyeY Player eye world Y
 * @param {number} ix Math.floor(player X)
 * @param {number} iz Math.floor(player Z)
 * @param {number} seed World seed (for {@link surfaceHeight})
 * @returns {{ gainMul: number, muffle: number }} gainMul 0 = silent; muffle 0 = bright, 1 = heavily muffled
 */
export function computeRainShelter(world, eyeY, ix, iz, seed) {
  const r = computeRainExposureAndShelterInternal(world, eyeY, ix, iz, seed);
  return { gainMul: r.gainMul, muffle: r.muffle };
}

/**
 * How much rain **particles** should show (0 = none). Uses center + orthogonal neighbors.
 * @param {import('./world.js').World} world
 * @param {number} eyeY
 * @param {number} ix Math.floor(player X)
 * @param {number} iz Math.floor(player Z)
 * @param {number} seed
 * @returns {{ exposure: number }} 0–1
 */
export function computeRainParticleExposure(world, eyeY, ix, iz, seed) {
  const r = computeRainExposureAndShelterInternal(world, eyeY, ix, iz, seed);
  return { exposure: r.exposure };
}

/** Reused object from {@link computeRainExposureAndShelterCached} to avoid per-frame allocation. */
const _rainEnvOut = { exposure: 0, gainMul: 0, muffle: 0 };

let _ttlIx = 0;
let _ttlIz = 0;
let _ttlEyeQ = 0;
let _ttlAtFrame = -1_000_000;
let _ttlExp = 1;
let _ttlGain = 1;
let _ttlMuf = 0;

/**
 * TTL (in sim frames) before recomputing exposure/shelter when the player has not moved cells.
 * Longer = less CPU; audio/particles stay coherent while standing in rain.
 * @param {WeatherEffectsQuality} quality
 */
export function rainComfortTtlFrames(quality) {
  switch (quality) {
    case 'minimal':
      return 22;
    case 'balanced':
      return 14;
    default:
      return 8;
  }
}

/**
 * Combined rain particle exposure + audio shelter, cached for several frames when position is stable.
 * @param {number} simFrame Monotonic frame counter (e.g. main loop seq).
 * @param {number} [ttlFrames] Override TTL; default from {@link rainComfortTtlFrames} via caller.
 */
export function computeRainExposureAndShelterCached(
  world,
  eyeY,
  ix,
  iz,
  seed,
  simFrame,
  ttlFrames = 12,
) {
  const eyeQ = Math.floor(eyeY * 4);
  const age = simFrame - _ttlAtFrame;
  if (
    ix === _ttlIx &&
    iz === _ttlIz &&
    eyeQ === _ttlEyeQ &&
    age >= 0 &&
    age < ttlFrames
  ) {
    _rainEnvOut.exposure = _ttlExp;
    _rainEnvOut.gainMul = _ttlGain;
    _rainEnvOut.muffle = _ttlMuf;
    return _rainEnvOut;
  }
  const r = computeRainExposureAndShelterInternal(world, eyeY, ix, iz, seed);
  _ttlIx = ix;
  _ttlIz = iz;
  _ttlEyeQ = eyeQ;
  _ttlAtFrame = simFrame;
  _ttlExp = r.exposure;
  _ttlGain = r.gainMul;
  _ttlMuf = r.muffle;
  _rainEnvOut.exposure = r.exposure;
  _rainEnvOut.gainMul = r.gainMul;
  _rainEnvOut.muffle = r.muffle;
  return _rainEnvOut;
}

/**
 * @param {number} [ttlFrames]
 */
export function computeRainParticleExposureCached(world, eyeY, ix, iz, seed, simFrame, ttlFrames = 12) {
  const r = computeRainExposureAndShelterCached(world, eyeY, ix, iz, seed, simFrame, ttlFrames);
  return { exposure: r.exposure };
}

/**
 * @param {number} [ttlFrames]
 */
export function computeRainShelterCached(world, eyeY, ix, iz, seed, simFrame, ttlFrames = 12) {
  const r = computeRainExposureAndShelterCached(world, eyeY, ix, iz, seed, simFrame, ttlFrames);
  return { gainMul: r.gainMul, muffle: r.muffle };
}
