import { surfaceHeight } from './worldgen';

function smoothstep01(x) {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
}

/**
 * Attenuates outdoor lights when the viewer is below the nominal terrain surface.
 * Directional + hemisphere lights ignore geometry; this approximates “sun/moon don’t reach deep caves”.
 *
 * @param {number} eyeY Eye or camera Y (world space)
 * @param {number} ix Math.floor(player X)
 * @param {number} iz Math.floor(player Z)
 * @param {number} seed World seed for {@link surfaceHeight}
 * @returns {{ sunMoonMul: number, hemiMul: number }} Multipliers in (0,1], multiply into light intensities
 */
export function computeCaveLightFactors(eyeY, ix, iz, seed) {
  const sh = surfaceHeight(ix, iz, seed);
  const depth = Math.max(0, sh - eyeY);
  /* Fade from ~surface to very deep; quadratic on sun/moon so caves get dark fast. */
  const t = smoothstep01((depth - 0.75) / 30);
  const sunMoonMul = Math.max(0.028, 1 - t * 0.96);
  const hemiMul = Math.max(0.12, 1 - t * 0.82);
  return { sunMoonMul, hemiMul };
}
