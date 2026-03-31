import { SURFACE_Y_OFFSET } from './gameState.js';

/**
 * World generation — terrain, biomes, caves.
 *
 * Uses smooth fractal value noise (fBm) instead of sin waves:
 *   • No visible tiling or repetition at any scale
 *   • Natural biome patches with gradual transitions
 *   • Multi-octave fractal terrain (small hills inside big hills)
 *   • 3D cave noise for proper tunnel networks (see caveNoise)
 */

/* ─── Biome identifiers ────────────────────────────────────────────────────── */

/** @enum {number} */
export const BIOME = {
  DESERT:    0,
  PLAINS:    1,
  FOREST:    2,
  HIGHLANDS: 3,
  TUNDRA:    4,
};

/** Map a continuous biomeParam value [0,1] to a discrete biome. */
export function getBiome(b) {
  if (b < 0.22) return BIOME.DESERT;
  if (b < 0.42) return BIOME.PLAINS;
  if (b < 0.65) return BIOME.FOREST;
  if (b < 0.82) return BIOME.HIGHLANDS;
  return BIOME.TUNDRA;
}

/* ─── Hash / noise primitives ───────────────────────────────────────────────── */

/** Deterministic [0,1) hash — used externally by world.js for per-block decisions. */
export function hashSeed(x, z, s) {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** Smooth S-curve for noise interpolation (no first-derivative discontinuities). */
function smoothstep(t) { return t * t * (3 - 2 * t); }

/** Linear interpolation. */
const lerp = (a, b, t) => a + (b - a) * t;

/* ── 2D value noise ── */

/**
 * 2D smooth value noise [0,1] via bilinear interpolation of hashed lattice corners.
 * Uses a dedicated seed offset to be fully independent from hashSeed callers.
 */
function noise2(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix,        fz = z - iz;
  const ux = smoothstep(fx), uz = smoothstep(fz);
  const s  = seed | 0;
  // Corner hashes (inline so JIT can eliminate call overhead in tight loops)
  const h00 = hashSeed(ix,     iz,     s);
  const h10 = hashSeed(ix + 1, iz,     s);
  const h01 = hashSeed(ix,     iz + 1, s);
  const h11 = hashSeed(ix + 1, iz + 1, s);
  return lerp(lerp(h00, h10, ux), lerp(h01, h11, ux), uz);
}

/**
 * Fractal Brownian Motion (fBm) — layered 2D value noise.
 * @param {number} x
 * @param {number} z
 * @param {number} seed
 * @param {number} octaves   Number of frequency layers (more = more detail).
 * @param {number} gain      Amplitude scaling per octave (0.5 = half each time).
 * @param {number} lacunarity Frequency scaling per octave (2.0 = double each time).
 * @returns {number} [0,1]
 */
function fbm2(x, z, seed, octaves, gain, lacunarity) {
  let val = 0, amp = 1, freq = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val    += noise2(x * freq, z * freq, seed + i * 1327) * amp;
    maxAmp += amp;
    amp    *= gain;
    freq   *= lacunarity;
  }
  return val / maxAmp;
}

/* ── 3D value noise (for caves) ── */

/** Hash 3 integer coords into [0,1). */
function hash3(ix, iy, iz, seed) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/**
 * 3D smooth value noise [0,1] via trilinear interpolation.
 */
function noise3(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = smoothstep(fx), uy = smoothstep(fy), uz = smoothstep(fz);
  const s  = seed | 0;
  // Interpolate along X at all 4 (Y,Z) combinations
  const x00 = lerp(hash3(ix, iy,   iz,   s), hash3(ix+1, iy,   iz,   s), ux);
  const x10 = lerp(hash3(ix, iy,   iz+1, s), hash3(ix+1, iy,   iz+1, s), ux);
  const x01 = lerp(hash3(ix, iy+1, iz,   s), hash3(ix+1, iy+1, iz,   s), ux);
  const x11 = lerp(hash3(ix, iy+1, iz+1, s), hash3(ix+1, iy+1, iz+1, s), ux);
  // Then along Z, then Y
  return lerp(lerp(x00, x10, uz), lerp(x01, x11, uz), uy);
}

/* ─── Public terrain functions ──────────────────────────────────────────────── */

/**
 * Smooth biome parameter [0,1] at world position (wx, wz).
 * Low values → Desert; high values → Tundra.
 * Uses very-low-frequency fBm so biome patches span hundreds of blocks.
 */
export function biomeParam(wx, wz, seed) {
  // Two octaves at a macro scale define the broad "temperature" axis.
  // A third slightly higher-freq octave adds natural raggedness to biome edges.
  const macro  = fbm2(wx * 0.0030, wz * 0.0030, seed + 3001, 3, 0.50, 2.0);
  const detail = fbm2(wx * 0.0110, wz * 0.0110, seed + 3099, 2, 0.45, 2.1);
  return Math.max(0, Math.min(1, macro * 0.78 + detail * 0.22));
}

/**
 * Integer surface Y at world position (wx, wz).
 * Three noise scales are mixed — continental shape, ridge hills, fine detail —
 * then scaled by biome-specific amplitude and base height.
 */
export function surfaceHeight(wx, wz, seed) {
  const b = biomeParam(wx, wz, seed);

  /* ── Terrain noise at three scales ── */

  // Continental: very broad valleys and plateaus (λ ≈ 300 blocks)
  const continental = fbm2(wx * 0.0032, wz * 0.0032, seed + 100, 4, 0.50, 2.0);

  // Hills: medium ridgelines and slopes (λ ≈ 55 blocks)
  const hills = fbm2(wx * 0.0180, wz * 0.0180, seed + 200, 4, 0.50, 2.0);

  // Detail: surface roughness and micro-bumps (λ ≈ 14 blocks)
  const detail = fbm2(wx * 0.0700, wz * 0.0700, seed + 300, 2, 0.45, 2.2);

  // Blend scales: continental dominates shape, hills carve ridges, detail adds roughness
  const rawH = continental * 0.52 + hills * 0.36 + detail * 0.12; // 0..1
  const h    = rawH * 2 - 1;  // centre on 0  →  -1..+1

  /* ── Biome-dependent terrain parameters ── */

  let baseY     = 22 + (b - 0.5) * 7;  // biome shifts base up/down slightly
  let hillScale = 12;
  let baseBump  = 0;

  if (b < 0.22) {
    // Desert — flat, lifted above sea level so sand never sits below water
    baseBump  = (0.22 - b) * 18;               // +0 → +3.96
    hillScale = 4  + (b / 0.22) * 5;           // 4 → 9
  } else if (b >= 0.65 && b < 0.82) {
    // Highlands — progressively taller peaks
    hillScale = 12 + (b - 0.65) / 0.17 * 10;  // 12 → 22
  } else if (b >= 0.82) {
    // Tundra — dramatic snow mountains with elevated base
    hillScale = 17 + (b - 0.82) / 0.18 * 7;   // 17 → 24
    baseBump  = (b - 0.82) * 10;               // +0 → +1.8
  }

  return Math.floor(SURFACE_Y_OFFSET + baseY + baseBump + h * hillScale);
}

/**
 * 3D cave density at world position (wx, wy, wz).
 * Returns a value in [0, ~0.5].  Carve stone where value < CAVE_THRESHOLD.
 *
 * Uses two independent noise fields to form elongated "worm" tubes:
 *   cave = (n1 - 0.5)² + (n2 - 0.5)²
 * The Y axis is slightly compressed so caves tend to run horizontally.
 */
export function caveNoise(wx, wy, wz, seed) {
  const sx = 0.048, sy = sx * 0.72;  // squash vertically → flatter cave ceilings
  const s  = (seed + 9001) | 0;
  const n1 = noise3(wx * sx,        wy * sy,        wz * sx,        s) - 0.5;
  const n2 = noise3(wx * sx + 31.7, wy * sy + 47.3, wz * sx + 89.1, s) - 0.5;
  return n1 * n1 + n2 * n2;
}
