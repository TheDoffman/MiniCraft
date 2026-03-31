import { BLOCKS } from './blocktypes.js';
import { surfaceHeight } from './worldgen.js';

/** Blocks that shield outdoor weather sound (solid, colliding, not fluid). */
function occludesOutdoorSound(id) {
  if (id === 0) return false;
  const def = BLOCKS[id];
  if (!def || def.fluid || !def.solid || def.collision === false) return false;
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
 * Rain loudness and muffling from terrain depth and overhead cover (house / cave ceiling).
 * @param {import('./world.js').World} world
 * @param {number} eyeY Player eye world Y
 * @param {number} ix Math.floor(player X)
 * @param {number} iz Math.floor(player Z)
 * @param {number} seed World seed (for {@link surfaceHeight})
 * @returns {{ gainMul: number, muffle: number }} gainMul 0 = silent; muffle 0 = bright, 1 = heavily muffled
 */
export function computeRainShelter(world, eyeY, ix, iz, seed) {
  const ceilingOpen = ceilingOpenInColumn(world, eyeY, ix, iz);
  const ceilingGainMul = 0.16 + 0.84 * ceilingOpen;

  const sh = surfaceHeight(ix, iz, seed);
  const depthBelowSurface = sh - eyeY;

  let depthMul = 1;
  if (depthBelowSurface > 3) {
    const t = smoothstep01((depthBelowSurface - 3) / 26);
    depthMul = 1 - t;
  }

  const gainMul = ceilingGainMul * depthMul;

  const muffle =
    depthMul < 0.04
      ? 0
      : (1 - ceilingOpen) * (0.5 + 0.5 * Math.min(1, depthMul * 1.25));

  return { gainMul, muffle };
}

/**
 * How much rain **particles** should show (0 = none). Stricter than audio: uses the **most sheltered**
 * of a 3×3 column neighborhood so narrow tunnels / shafts don’t draw rain in front of side walls
 * (drops can sit in open air while the camera→drop ray never hits those walls).
 * @param {import('./world.js').World} world
 * @param {number} eyeY
 * @param {number} ix Math.floor(player X)
 * @param {number} iz Math.floor(player Z)
 * @param {number} seed
 * @returns {{ exposure: number }} 0–1
 */
export function computeRainParticleExposure(world, eyeY, ix, iz, seed) {
  let minCeilingOpen = 1;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      minCeilingOpen = Math.min(minCeilingOpen, ceilingOpenInColumn(world, eyeY, ix + dx, iz + dz));
    }
  }

  const sh = surfaceHeight(ix, iz, seed);
  const depthBelowSurface = sh - eyeY;
  let depthMul = 1;
  if (depthBelowSurface > 1.5) {
    const t = smoothstep01((depthBelowSurface - 1.5) / 24);
    depthMul = 1 - t;
  }

  /* Squared “open” term: tunnels read as clearly covered without killing open-field rain. */
  const exposure = minCeilingOpen * minCeilingOpen * depthMul;
  return { exposure: Math.max(0, Math.min(1, exposure)) };
}
