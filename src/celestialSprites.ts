/**
 * Procedural Minecraft-style sun & moon textures (chunky pixels, 8-ray sun, cratered moon).
 */
import * as THREE from 'three';

const SUN_LOGICAL = 32;
const SUN_PX = 64;

const MOON_PX = 64;

/**
 * @returns {HTMLCanvasElement}
 */
export function buildMinecraftStyleSunCanvas() {
  const n = SUN_LOGICAL;
  const scale = SUN_PX / n;
  const canvas = document.createElement('canvas');
  canvas.width = SUN_PX;
  canvas.height = SUN_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context');
  ctx.imageSmoothingEnabled = false;

  const cx = (n - 1) / 2;
  const cy = (n - 1) / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const cheb = Math.max(adx, ady);
      const d2 = dx * dx + dy * dy;

      /** @type {[number, number, number, number] | null} */
      let rgba = null;

      /* Bright core — boxy like vanilla */
      if (cheb <= 3 || (cheb <= 4 && d2 < 20)) {
        rgba = [255, 255, 238, 255];
      } else if (cheb <= 5 && d2 < 34) {
        rgba = [255, 248, 175, 255];
      } else if (cheb <= 6 && d2 < 44) {
        rgba = [255, 228, 95, 255];
      } else if (adx <= 2 && ady >= 5 && ady <= 14) {
        const t = (ady - 5) / 9;
        const a = Math.floor(255 * (1 - t * 0.35));
        rgba = [255, 210, 75, a];
      } else if (ady <= 2 && adx >= 5 && adx <= 14) {
        const t = (adx - 5) / 9;
        const a = Math.floor(255 * (1 - t * 0.35));
        rgba = [255, 210, 75, a];
      } else if (adx === ady && adx >= 4 && adx <= 12) {
        const t = (adx - 4) / 8;
        const a = Math.floor(252 * (1 - t * 0.4));
        rgba = [255, 190, 55, a];
      }

      if (rgba) {
        ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})`;
        const px = Math.floor(x * scale);
        const py = Math.floor(y * scale);
        ctx.fillRect(px, py, Math.ceil(scale), Math.ceil(scale));
      }
    }
  }
  return canvas;
}

/**
 * Full moon with dark maria — vanilla-like flat shading on a low-res disc.
 * @returns {HTMLCanvasElement}
 */
export function buildMinecraftStyleMoonCanvas() {
  const W = MOON_PX;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context');
  ctx.imageSmoothingEnabled = false;

  const cx = (W - 1) / 2;
  const cy = (W - 1) / 2;
  const R = 22;

  /** Dark patches (offset from center in texel space) */
  const maria = [
    { ox: 5, oy: -7, rx: 8, ry: 5.5 },
    { ox: -11, oy: 5, rx: 6, ry: 7 },
    { ox: 5, oy: 11, rx: 5, ry: 4 },
    { ox: -5, oy: -12, rx: 6, ry: 4.5 },
    { ox: -3, oy: 2, rx: 4, ry: 3 },
  ];

  const img = ctx.createImageData(W, W);
  const d = img.data;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const i = (y * W + x) * 4;
      if (dx * dx + dy * dy > R * R) {
        d[i + 3] = 0;
        continue;
      }
      let r = 200;
      let g = 206;
      let b = 218;
      for (let m = 0; m < maria.length; m++) {
        const u = dx - maria[m].ox;
        const v = dy - maria[m].oy;
        const rx = maria[m].rx;
        const ry = maria[m].ry;
        if (u * u / (rx * rx) + v * v / (ry * ry) <= 1) {
          r = 115;
          g = 122;
          b = 142;
          break;
        }
      }
      const speck = ((x * 73) ^ (y * 131)) & 15;
      if (speck === 0) {
        r -= 10;
        g -= 10;
        b -= 8;
      } else if (speck === 7) {
        r += 8;
        g += 8;
        b += 6;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {THREE.CanvasTexture}
 */
export function canvasToCelestialTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
