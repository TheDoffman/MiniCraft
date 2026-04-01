import * as THREE from 'three';
import { ATLAS_TILES, TILE_PX } from './blocktypes.js';

/** Total atlas edge length in pixels (square — rows ≤ cols). */
const ATLAS_SIZE = ATLAS_TILES * TILE_PX;
/** Logical resolution per atlas tile (Minecraft uses 16×16). */
const G = 16;
const CELL = TILE_PX / G;

function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** Stepped palette (~15 levels/channel) for vanilla-style 16×16 texel faces. */
function mcSnapChannel(v) {
  return Math.max(0, Math.min(255, Math.round(v / 17) * 17));
}

/**
 * {@link paintTile16} with RGB snapped to MC-style palette (alpha preserved).
 * @param {CanvasRenderingContext2D} ctx
 */
function paintTile16Mc(ctx, tx, ty, sample) {
  paintTile16(ctx, tx, ty, (i, j, a, b) => {
    const out = sample(i, j, a, b);
    if (out == null || out === '') return out;
    const m = String(out).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return out;
    const r = mcSnapChannel(+m[1]);
    const g = mcSnapChannel(+m[2]);
    const bc = mcSnapChannel(+m[3]);
    if (m[4] !== undefined) return `rgba(${r},${g},${bc},${m[4]})`;
    return `rgb(${r},${g},${bc})`;
  });
}

/**
 * Paint one atlas tile as a 16×16 logical grid, scaled to TILE_PX (chunky pixels).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} tx
 * @param {number} ty
 * @param {(i: number, j: number, tx: number, ty: number) => string | null | undefined} sample fillStyle or skip
 */
function paintTile16(ctx, tx, ty, sample) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const cs = Math.ceil(CELL);
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const style = sample(i, j, tx, ty);
      if (style == null || style === '') continue;
      ctx.fillStyle = style;
      ctx.fillRect(ox + i * CELL, oy + j * CELL, cs, cs);
    }
  }
}

function drawGrassTop(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 31, j + tty * 29, 1);
    const n2v = hash2(i * 2, j * 2, 2);
    let gr = 115 + Math.floor(n * 38);
    let gg = 175 + Math.floor(n2v * 32);
    let gb = 68 + Math.floor(hash2(i, j, 3) * 28);
    if (n2v > 0.78) {
      gr = 78 + Math.floor(hash2(i, j, 4) * 22);
      gg = 128 + Math.floor(hash2(i, j, 5) * 24);
      gb = 48 + Math.floor(hash2(i, j, 6) * 16);
    }
    if (hash2(i, j, 7) > 0.94) {
      gr = Math.floor(gr * 0.88);
      gg = Math.floor(gg * 0.9);
      gb = Math.floor(gb * 0.92);
    }
    return `rgb(${gr},${gg},${gb})`;
  });
}

function drawGrassSide(ctx, tx, ty) {
  const grassH = 3;
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    if (j < grassH) {
      const n = hash2(i + ttx * 17, j + tty * 13, 4);
      const gr = 98 + Math.floor(n * 28);
      const gg = 152 + Math.floor(hash2(i, j, 41) * 26);
      const gb = 58 + Math.floor(hash2(i, j, 42) * 20);
      return `rgb(${gr},${gg},${gb})`;
    }
    const n = hash2(i + ttx * 19, j + tty * 23, 5);
    const r = 134 + Math.floor(n * 28);
    const gg = 96 + Math.floor(hash2(i, j, 6) * 24);
    const b = 62 + Math.floor(hash2(i >> 1, j >> 1, 43) * 22);
    return `rgb(${r},${gg},${b})`;
  });
}

function drawDirt(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 41, j + tty * 37, 7);
    const r = 118 + Math.floor(n * 34);
    const g = 84 + Math.floor(hash2(i, j, 8) * 26);
    const b = 56 + Math.floor(hash2(i >> 1, j, 44) * 20);
    if (hash2(i, j, 45) > 0.9) {
      return `rgb(${Math.floor(r * 0.82)},${Math.floor(g * 0.85)},${Math.floor(b * 0.8)})`;
    }
    return `rgb(${r},${g},${b})`;
  });
}

function drawStone(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 43, j + tty * 39, 9);
    let v = 118 + Math.floor(n * 28);
    if (hash2(i, j, 10) > 0.88) v = 78 + Math.floor(hash2(i, j, 11) * 18);
    else if (hash2(i, j, 12) > 0.93) v = 95 + Math.floor(hash2(i, j, 13) * 12);
    const cool = Math.floor(hash2(i >> 2, j >> 2, 14) * 6);
    return `rgb(${v - 3 - cool},${v - cool},${v + 2})`;
  });
}

function drawLogTop(ctx, tx, ty) {
  const cx = 7.5;
  const cy = 7.5;
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const dx = i - cx;
    const dy = j - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.abs(d - 5.2) < 0.95 || Math.abs(d - 3.1) < 0.75 || Math.abs(d - 1.4) < 0.55;
    const n = hash2(i + ttx * 11, j + tty * 13, 12);
    if (d < 1.2) {
      const p = 175 + Math.floor(n * 20);
      return `rgb(${p + 18},${p + 8},${p})`;
    }
    const base = ring ? 88 : 142;
    const v = base + Math.floor(n * 16);
    return `rgb(${v + 22},${v + 6},${Math.floor(v * 0.55)})`;
  });
}

function drawLogSide(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 47, j + tty * 41, 13);
    const crease = i % 4 === 0;
    const v = (crease ? 58 : 72) + Math.floor(n * 22);
    const r = v + 28;
    const g = Math.floor(v * 0.82);
    const b = Math.floor(v * 0.58);
    const shade = crease ? 0.72 : 1;
    return `rgb(${Math.floor(r * shade)},${Math.floor(g * shade)},${Math.floor(b * shade)})`;
  });
}

function drawLeaves(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 53, j + tty * 49, 14);
    const clump = hash2(i + j * 0.3, j * 1.7 + i * 0.2, 15);
    if (n > 0.38 && clump > 0.22) {
      const t = hash2(i, j, 16);
      const gr = 45 + Math.floor(t * 28);
      const gg = 92 + Math.floor(hash2(i, j, 17) * 36);
      const gb = 38 + Math.floor(hash2(i, j, 18) * 22);
      return `rgb(${gr},${gg},${gb})`;
    }
    if (n > 0.32 && hash2(i, j, 19) > 0.65) {
      return 'rgba(58,110,48,0.78)';
    }
    return null;
  });
}

function drawSand(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 59, j + tty * 61, 15);
    const r = 210 + Math.floor(n * 28);
    const g = 200 + Math.floor(hash2(i, j, 16) * 22);
    const b = 152 + Math.floor(hash2(i >> 1, j >> 1, 46) * 24);
    return `rgb(${r},${g},${b})`;
  });
}

function drawPlanks(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 67, j + tty * 63, 17);
    const plankRow = Math.floor(j / 4);
    const seam = j % 4 === 0 && j > 0;
    const alt = plankRow % 2;
    let r = 168 + Math.floor(n * 18) - alt * 8;
    let g = 118 + Math.floor(hash2(i, j, 47) * 20) - alt * 6;
    let b = 62 + Math.floor(hash2(i >> 2, j, 48) * 14);
    if (seam) {
      r = Math.floor(r * 0.52);
      g = Math.floor(g * 0.48);
      b = Math.floor(b * 0.42);
    }
    if (hash2(i, j, 49) > 0.91) {
      r += 12;
      g += 8;
      b += 4;
    }
    return `rgb(${r},${g},${b})`;
  });
}

function drawCobble(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const ci = i >> 2;
    const cj = j >> 2;
    const cell = hash2(ci + ttx * 71, cj + tty * 73, 18);
    const li = i & 3;
    const lj = j & 3;
    const mortar = li === 0 || lj === 0;
    const shades = [
      [108, 108, 116],
      [92, 92, 100],
      [124, 124, 132],
      [100, 100, 108],
    ];
    const idx = Math.floor(cell * 4) % 4;
    const [br, bg, bb] = shades[idx];
    const n = hash2(i, j, 50);
    let mul = mortar ? 0.48 : 0.88 + n * 0.2;
    if (!mortar && hash2(i, j, 51) > 0.94) mul *= 0.75;
    return `rgb(${Math.min(255, Math.floor(br * mul))},${Math.min(255, Math.floor(bg * mul))},${Math.min(
      255,
      Math.floor(bb * mul),
    )})`;
  });
}

function drawGlass(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    const edge = i === 0 || j === 0 || i === G - 1 || j === G - 1;
    if (edge) return 'rgba(200,235,255,0.55)';
    return 'rgba(145,200,235,0.33)';
  });
  ctx.strokeStyle = 'rgba(120,175,220,0.45)';
  ctx.lineWidth = Math.max(1, CELL * 0.3);
  ctx.beginPath();
  ctx.moveTo(ox + 2.5 * CELL, oy + (G - 2.5) * CELL);
  ctx.lineTo(ox + (G - 2.5) * CELL, oy + 2.5 * CELL);
  ctx.stroke();
}

/**
 * Water tile: teal-cyan depth gradient, soft ripples, caustic-style highlights (16×16 MC palette).
 */
function drawWater(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 41, j + tty * 47, 901);
    const n2 = hash2(i * 2 + 11, j * 2 + 13, 905);
    const n3 = hash2(j, i + ttx, 906);
    const depthGrad = (j / Math.max(1, G - 1)) * 0.42;
    const hWave = Math.sin((i * 0.42 + j * 0.31 + tty * 0.08) * 1.05) * 0.5 + 0.5;
    let r = Math.floor(28 + depthGrad * 22 + hWave * 14 + n * 9);
    let g = Math.floor(108 + depthGrad * 28 + hWave * 22 + n2 * 15);
    let b = Math.floor(205 + depthGrad * 18 + hWave * 16 + n3 * 11);
    const caust = Math.sin((i + j) * 0.72 + (i - j) * 0.38 + ttx * 0.15) * 0.5 + 0.5;
    if (caust > 0.8 && n > 0.52) {
      r = Math.min(255, r + 22);
      g = Math.min(255, g + 30);
      b = Math.min(255, b + 20);
    }
    if (caust < 0.2 && n2 < 0.38) {
      r = Math.floor(r * 0.7);
      g = Math.floor(g * 0.76);
      b = Math.floor(b * 0.84);
    }
    if (hash2(i, j, 907) > 0.93) {
      r = Math.min(255, r + 30);
      g = Math.min(255, g + 36);
      b = 255;
    }
    const a = 0.55 + n * 0.09 + caust * 0.1;
    return `rgba(${r},${g},${b},${a})`;
  });
}

/** Molten lava tile — mirrors water structure (depth, noise, bright veins) for procedural atlas fallback. */
function drawLava(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 41, j + tty * 47, 1901);
    const n2 = hash2(i * 2 + 11, j * 2 + 13, 1905);
    const n3 = hash2(j, i + ttx, 1906);
    const depthGrad = (j / Math.max(1, G - 1)) * 0.55;
    const hWave = Math.sin((i * 0.38 + j * 0.29 + tty * 0.09) * 1.1) * 0.5 + 0.5;
    let r = Math.floor(220 + depthGrad * 22 + hWave * 18 + n * 14);
    let g = Math.floor(58 + depthGrad * 35 + hWave * 28 + n2 * 18);
    let b = Math.floor(12 + depthGrad * 18 + hWave * 10 + n3 * 8);
    const glow = Math.sin((i + j) * 0.68 + (i - j) * 0.42 + ttx * 0.18) * 0.5 + 0.5;
    if (glow > 0.82 && n > 0.48) {
      r = Math.min(255, r + 28);
      g = Math.min(255, g + 42);
      b = Math.min(255, b + 18);
    }
    if (glow < 0.22 && n2 < 0.35) {
      r = Math.floor(r * 0.72);
      g = Math.floor(g * 0.55);
      b = Math.floor(b * 0.5);
    }
    if (hash2(i, j, 1907) > 0.91) {
      r = 255;
      g = Math.min(255, g + 50);
      b = Math.min(255, b + 24);
    }
    const a = 0.58 + n * 0.1 + glow * 0.12;
    return `rgba(${r},${g},${b},${a})`;
  });
}

function drawBedrock(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 89, j + tty * 97, 200);
    let v = 28 + Math.floor(n * 22);
    if (hash2(i, j, 201) > 0.82) v = 52 + Math.floor(hash2(i, j, 202) * 28);
    if (hash2(i, j, 203) > 0.92) v = 12 + Math.floor(hash2(i, j, 204) * 10);
    const gv = v + Math.floor(hash2(i, j, 205) * 8);
    const bv = Math.min(255, v + 6 + Math.floor(hash2(i, j, 206) * 4));
    return `rgb(${v},${gv},${bv})`;
  });
}

/**
 * Raw porkchop item — 16×16 pixel layout scaled to TILE_PX.
 */
function drawPorkchop(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const W = TILE_PX;
  ctx.clearRect(ox, oy, W, W);

  const s = W / 16;
  /** @type {Record<string, [number, number, number] | null>} */
  const pal = {
    '.': null,
    o: [58, 36, 32],
    n: [78, 48, 42],
    m: [168, 76, 70],
    M: [198, 96, 88],
    r: [218, 112, 102],
    h: [236, 188, 168],
    H: [248, 232, 220],
    w: [255, 248, 242],
    s: [142, 68, 60],
  };
  const rows = [
    '................',
    '................',
    '...oonnnnoo.....',
    '..onmmmmmmno....',
    '.onmrrrrmmmn....',
    '.onMrrrrrrMmn...',
    'onMrrrrrrrMmn...',
    'onMrrrrrrrMMmn..',
    'onMhHHHHhhMMmn..',
    'onMhHHHHhhMMmn..',
    'onMhHHwwhhMMmn..',
    '.onMhhwwhhMmn...',
    '..onmssssmmn....',
    '...oonnnnoo.....',
    '................',
    '................',
  ];

  const cs = Math.ceil(s);
  for (let row = 0; row < 16; row++) {
    const line = rows[row];
    for (let col = 0; col < 16; col++) {
      const c = line[col];
      const rgb = pal[c];
      if (!rgb) continue;
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(ox + col * s, oy + row * s, cs, cs);
    }
  }
}

/** Raw beef — same 16×16 scale as porkchop. */
function drawBeef(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const W = TILE_PX;
  ctx.clearRect(ox, oy, W, W);
  const s = W / 16;
  /** @type {Record<string, [number, number, number] | null>} */
  const pal = {
    '.': null,
    o: [52, 32, 38],
    n: [72, 44, 50],
    m: [140, 58, 62],
    M: [178, 72, 76],
    r: [200, 88, 82],
    h: [220, 140, 128],
    H: [236, 200, 188],
    w: [248, 228, 220],
    s: [120, 52, 58],
  };
  const rows = [
    '................',
    '................',
    '....oonnnoo.....',
    '...onmmmmmmno...',
    '..onmrrrrmmmn...',
    '..onMrrrrrrMmn..',
    '.onMrrrrrrrMmn..',
    '.onMrrrrrrMMmn..',
    'onMhHHHHhhMMmn..',
    'onMhHHwwhhMMmn..',
    '.onMhhwwhhMmn...',
    '..onmssssmmn....',
    '...oonnnnoo.....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ];
  const cs = Math.ceil(s);
  for (let row = 0; row < 16; row++) {
    const line = rows[row];
    for (let col = 0; col < 16; col++) {
      const c = line[col];
      const rgb = pal[c];
      if (!rgb) continue;
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(ox + col * s, oy + row * s, cs, cs);
    }
  }
}

function drawLeather(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const W = TILE_PX;
  ctx.clearRect(ox, oy, W, W);
  const s = W / 16;
  /** @type {Record<string, [number, number, number] | null>} */
  const pal = {
    '.': null,
    a: [58, 42, 28],
    b: [78, 56, 38],
    c: [98, 70, 48],
    d: [118, 86, 58],
    e: [138, 102, 72],
    f: [92, 68, 46],
  };
  const rows = [
    '................',
    '................',
    '....aabbbbaa....',
    '...abccddccbba..',
    '..abcddeeddcba..',
    '.abcddeeeedcba.',
    '.abcddeeeedcba.',
    'abcddeeeeeedcba',
    'abcddeeeeeedcba',
    '.abcddeeeedcba.',
    '..abcddeedcba..',
    '...abccddcba....',
    '....aabffbaa....',
    '................',
    '................',
    '................',
  ];
  const cs = Math.ceil(s);
  for (let row = 0; row < 16; row++) {
    const line = rows[row];
    for (let col = 0; col < 16; col++) {
      const ch = line[col];
      const rgb = pal[ch];
      if (!rgb) continue;
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(ox + col * s, oy + row * s, cs, cs);
    }
  }
}

/**
 * Generic pixel-art tool renderer via row strings + palette.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} tx
 * @param {number} ty
 * @param {Record<string, [number,number,number]>} pal
 * @param {string[]} rows
 */
function drawPixelArt(ctx, tx, ty, pal, rows) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const s = TILE_PX / G;
  const cs = Math.ceil(s);
  for (let row = 0; row < 16; row++) {
    const line = rows[row];
    for (let col = 0; col < 16; col++) {
      const ch = line[col];
      const rgb = pal[ch];
      if (!rgb) continue;
      const r = mcSnapChannel(rgb[0]);
      const g = mcSnapChannel(rgb[1]);
      const b = mcSnapChannel(rgb[2]);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(ox + col * s, oy + row * s, cs, cs);
    }
  }
}

function drawWoodenPickaxe(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    w: [100, 68, 42], W: [148, 118, 78], h: [88, 58, 36],
  }, [
    '................',
    '....wwWWWww.....',
    '....w.....w.....',
    '........h.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawWoodenAxe(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    w: [100, 68, 42], W: [148, 118, 78], h: [88, 58, 36],
  }, [
    '................',
    '......wWW.......',
    '.....wWWW.......',
    '....wwWW........',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawWoodenShovel(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    w: [100, 68, 42], W: [148, 118, 78], h: [88, 58, 36],
  }, [
    '................',
    '.......ww.......',
    '......wWWw......',
    '......wWWw......',
    '.......ww.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawWoodenSword(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    w: [100, 68, 42], W: [148, 118, 78], h: [88, 58, 36],
  }, [
    '................',
    '........W.......',
    '.......Ww.......',
    '......Ww........',
    '.....Ww.........',
    '....Ww..........',
    '...hw...........',
    '..hh............',
    '.h.h............',
    '....h...........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawStonePickaxe(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    s: [110, 110, 110], S: [156, 156, 156], h: [88, 58, 36],
  }, [
    '................',
    '....ssSSSss.....',
    '....s.....s.....',
    '........h.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawStoneAxe(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    s: [110, 110, 110], S: [156, 156, 156], h: [88, 58, 36],
  }, [
    '................',
    '......sSS.......',
    '.....sSSS.......',
    '....ssSS........',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawStoneShovel(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    s: [110, 110, 110], S: [156, 156, 156], h: [88, 58, 36],
  }, [
    '................',
    '.......ss.......',
    '......sSSs......',
    '......sSSs......',
    '.......ss.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawStoneSword(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    s: [110, 110, 110], S: [156, 156, 156], h: [88, 58, 36],
  }, [
    '................',
    '........S.......',
    '.......Ss.......',
    '......Ss........',
    '.....Ss.........',
    '....Ss..........',
    '...hs...........',
    '..hh............',
    '.h.h............',
    '....h...........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawStick(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    h: [88, 58, 36],
    H: [118, 82, 52],
  }, [
    '................',
    '................',
    '................',
    '........H.......',
    '.......Hh.......',
    '......Hh........',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '..hh............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawBook(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    l: [92, 58, 38], L: [120, 78, 52], p: [220, 210, 190], P: [255, 252, 245], b: [40, 32, 28],
  }, [
    '................',
    '................',
    '....bbbbbbbb....',
    '...bPPppppPPb...',
    '..bPppppppppPb..',
    '..bPppppppppPb..',
    '..bPppLLppppPb..',
    '..bPppLLppppPb..',
    '..bPppppppppPb..',
    '..bPppppppppPb..',
    '...bPPppppPPb...',
    '....bbbbbbbb....',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawRottenFlesh(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    '.': [120, 90, 75], o: [140, 100, 82], m: [100, 70, 58], g: [90, 120, 70],
  }, [
    '................',
    '................',
    '....oooooooo....',
    '...ommmmmmmmo...',
    '..ommmggmmmmmo..',
    '..ommmggmmmmmo..',
    '..ommmmmmmmmmo..',
    '...ommmmmmmmo...',
    '....oooooooo....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronNugget(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    d: [90, 92, 98], D: [150, 152, 160], l: [200, 202, 210],
  }, [
    '................',
    '................',
    '................',
    '.......DD.......',
    '......DllD......',
    '......Dlld......',
    '......DllD......',
    '.......dd.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronIngot(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    d: [85, 88, 95], D: [140, 145, 155], l: [190, 195, 205],
  }, [
    '................',
    '................',
    '................',
    '.....DDDDDD.....',
    '....DllllllD....',
    '...DllllllllD...',
    '....DllllllD....',
    '.....dddddd.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronPickaxe(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    i: [178, 182, 188], I: [232, 236, 242], h: [88, 58, 36],
  }, [
    '................',
    '....iiIIIii.....',
    '....i.....i.....',
    '........h.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronAxe(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    i: [178, 182, 188], I: [232, 236, 242], h: [88, 58, 36],
  }, [
    '................',
    '......iII.......',
    '.....iIIIi......',
    '....iiIIi.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronShovel(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    i: [178, 182, 188], I: [232, 236, 242], h: [88, 58, 36],
  }, [
    '................',
    '.......ii.......',
    '......iIIi......',
    '......iIIi......',
    '.......ii.......',
    '.......h........',
    '......h.........',
    '.....h..........',
    '....h...........',
    '...h............',
    '..h.............',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronSword(ctx, tx, ty) {
  ctx.clearRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
  drawPixelArt(ctx, tx, ty, {
    i: [178, 182, 188], I: [232, 236, 242], h: [88, 58, 36],
  }, [
    '................',
    '........I.......',
    '.......Ii.......',
    '......Ii........',
    '.....Ii.........',
    '....Ii..........',
    '...hI...........',
    '..hh............',
    '.h.h............',
    '....h...........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

/* ── Biome block textures ── */

/** Packed snow — soft white with faint blue-cool tint. */
function drawSnow(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    const n  = hash2(i + tx * 17, j + ty * 23, 91);
    const n2 = hash2(i * 2 + 1, j + 3, 92);
    const bright = 230 + Math.floor(n * 25);       // 230-255
    const cool   = Math.floor(n2 * 10);             // 0-10 blue boost
    return `rgb(${bright},${bright},${Math.min(255, bright + cool)})`;
  });
}

/** Ice — pale blue crystalline, slightly darker at edges. */
function drawIce(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    const edge = (i === 0 || i === 15 || j === 0 || j === 15) ? 1 : 0;
    const n  = hash2(i + tx * 13, j + ty * 19, 93);
    const n2 = hash2(i * 3 + j,   j * 2 - i,   94);
    const r  = (edge ? 100 : 125) + Math.floor(n  * 45);  // 100-195 / 125-170
    const g  = (edge ? 160 : 190) + Math.floor(n2 * 40);  // 160-200 / 190-230
    const b  = (edge ? 210 : 232) + Math.floor(hash2(i, j * 2, 95) * 22); // 210-232 / 232-254
    return `rgb(${r},${g},${b})`;
  });
}

/** Cactus side — thick dark border, bright green body, horizontal ribs, spine areoles. */
function drawCactusSide(ctx, tx, ty) {
  // Spine areole rows: clusters of spines at these J positions
  const AREOLE_ROWS = [3, 8, 13];
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    const isOuterEdge = i === 0 || i === 15;
    const isInnerEdge = i === 1 || i === 14;
    const isTopBot    = j === 0 || j === 15;

    // Horizontal rib stripes (slightly darker, 1px each)
    const isRib = j === 4 || j === 9;

    // Spine areole: on the outer-edge columns only, at areole rows
    const isSpineTip    = isOuterEdge && AREOLE_ROWS.includes(j);
    // One pixel in from edge at areole row — bright highlight where spine meets body
    const isSpineBase   = isInnerEdge && AREOLE_ROWS.includes(j);
    // Small "nub" one pixel above/below each spine tip on the edge
    const isSpineNub    = isOuterEdge && AREOLE_ROWS.some(r => Math.abs(j - r) === 1);

    if (isSpineTip)  return `rgb(220,205,115)`;   // pale yellow spine tip
    if (isSpineNub)  return `rgb(165,155,75)`;    // slightly darker spine nub
    if (isOuterEdge) return `rgb(20, 78,  6)`;    // thick dark-green border
    if (isTopBot)    return `rgb(20, 78,  6)`;    // top/bottom dark edge
    if (isSpineBase) return `rgb(90, 168, 28)`;   // bright highlight at spine root
    if (isRib)       return `rgb(35,105, 12)`;    // rib stripe (darker than body)

    // Interior body: bright green with gentle noise
    const n = hash2(i + tx * 7, j + ty * 11, 51);
    const g = 152 + Math.floor(n * 28);
    return `rgb(${Math.floor(g * 0.32)},${g},${Math.floor(g * 0.05)})`;
  });
}

/** Cactus top — raised rim, inner rib ring, bright green centre. */
function drawCactusTop(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    const cx = 7.5, cy = 7.5;
    const dist = Math.sqrt((i - cx) ** 2 + (j - cy) ** 2);
    const isEdge = i === 0 || i === 15 || j === 0 || j === 15;
    // Outer raised rim (matches side border)
    const isRim  = dist >= 6.2;
    // Inner rib ring
    const isRing = dist >= 3.8 && dist < 4.8;

    if (isEdge || isRim)  return `rgb(20, 78,  6)`;
    if (isRing)           return `rgb(35,105, 12)`;

    // Centre: bright green with gentle noise
    const n = hash2(i + tx * 5, j + ty * 9, 52);
    const g = 152 + Math.floor(n * 28);
    return `rgb(${Math.floor(g * 0.32)},${g},${Math.floor(g * 0.05)})`;
  });
}

/** Sandstone — warm tan with subtle horizontal banding. */
function drawSandstone(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    // Two alternating band shades, ~4px each
    const band = Math.floor(j / 4) % 2;
    const n    = hash2(i + tx * 11, j + ty * 7, 96) * 22;
    const baseR = band === 0 ? 208 : 224;
    const baseG = band === 0 ? 182 : 198;
    const baseB = band === 0 ? 124 : 140;
    return `rgb(${Math.min(255, Math.floor(baseR + n * 0.4))},${Math.min(255, Math.floor(baseG + n * 0.35))},${Math.min(255, Math.floor(baseB + n * 0.25))})`;
  });
}

function drawTorch(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
  /* Same grid as scripts/generate-textures.mjs (torch UVs / mesher). */
  drawPixelArt(ctx, tx, ty, {
    h: [82, 52, 32],
    H: [118, 82, 52],
    d: [210, 95, 38],
    f: [255, 205, 70],
    F: [255, 130, 28],
    g: [255, 248, 180],
    y: [255, 230, 100],
    w: [255, 255, 238],
  }, [
    '................',
    '................',
    '.....wgGyGg.....',
    '.....yFFFfy.....',
    '.....FfFFFf.....',
    '.....ffffff.....',
    '.....fdFFFd.....',
    '.......HH.......',
    '.......hh.......',
    '.......hh.......',
    '.......hh.......',
    '.......hh.......',
    '.......hh.......',
    '................',
    '................',
    '................',
  ]);
}

/* ── Ores (2×2 blobs per vein — readable at 16×16) ── */
function fillOreBlobPx(ctx, ox, oy, i, j, rr, gg, bb) {
  const s = Math.ceil(CELL);
  const r = mcSnapChannel(rr);
  const g = mcSnapChannel(gg);
  const b = mcSnapChannel(bb);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const ii = i + dx;
    const jj = j + dy;
    if (ii >= G || jj >= G) continue;
    ctx.fillRect(ox + ii * CELL, oy + jj * CELL, s, s);
  }
}

function drawCoalOre(ctx, tx, ty) {
  drawStone(ctx, tx, ty);
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const spots = [
    [4, 4],
    [5, 5],
    [6, 4],
    [10, 9],
    [11, 10],
    [9, 10],
    [3, 11],
    [4, 12],
    [12, 3],
    [13, 4],
  ];
  for (const [i, j] of spots) {
    const bv = 20 + Math.floor(hash2(i, j, 80) * 15);
    fillOreBlobPx(ctx, ox, oy, i, j, bv, bv, bv);
  }
}

function drawIronOre(ctx, tx, ty) {
  drawStone(ctx, tx, ty);
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const spots = [
    [5, 4],
    [6, 5],
    [5, 5],
    [10, 10],
    [11, 9],
    [11, 10],
    [3, 12],
    [4, 11],
  ];
  for (const [i, j] of spots) {
    const rv = 188 + Math.floor(hash2(i, j, 90) * 20);
    fillOreBlobPx(ctx, ox, oy, i, j, rv, rv - 10, rv - 25);
  }
}

function drawDiamondOre(ctx, tx, ty) {
  drawStone(ctx, tx, ty);
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  const spots = [
    [5, 5],
    [6, 4],
    [6, 5],
    [10, 10],
    [11, 10],
    [4, 11],
    [4, 12],
  ];
  for (const [i, j] of spots) {
    const gv = 200 + Math.floor(hash2(i, j, 95) * 55);
    const rv = 80 + Math.floor(hash2(i, j, 96) * 30);
    fillOreBlobPx(ctx, ox, oy, i, j, rv, gv, gv + 10);
  }
}

function drawCoalItem(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    c: [30, 30, 30], C: [55, 50, 45], h: [15, 15, 15],
  }, [
    '................',
    '................',
    '................',
    '.....cCCCc......',
    '....cChhhCc.....',
    '....ChhhhC......',
    '....ChhhCC......',
    '....cChhCc......',
    '.....cCCc.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawDiamondItem(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    d: [78, 210, 225], D: [120, 240, 248], l: [160, 250, 255],
  }, [
    '................',
    '................',
    '................',
    '.....dDDDd......',
    '....dDlllDd.....',
    '....DlllllD.....',
    '....DlllDDd.....',
    '....dDDDDd......',
    '.....dDDd.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawFurnaceTop(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    const n = hash2(i, j, 120);
    const r = 100 + Math.floor(n * 30);
    return `rgb(${r},${r},${r})`;
  });
}

function drawFurnaceSide(ctx, tx, ty) {
  paintTile16Mc(ctx, tx, ty, (i, j) => {
    // Stone border with dark opening in center
    if (i >= 5 && i <= 10 && j >= 5 && j <= 11) {
      // Fire opening
      if (i >= 6 && i <= 9 && j >= 6 && j <= 10) {
        const f = hash2(i, j, 125);
        if (j >= 9) return `rgb(${200+Math.floor(f*55)},${80+Math.floor(f*40)},20)`;
        return `rgb(${30+Math.floor(f*20)},${20+Math.floor(f*10)},${15})`;
      }
      return 'rgb(60,60,60)';
    }
    const n = hash2(i, j, 121);
    const r = 108 + Math.floor(n * 28);
    return `rgb(${r},${r},${r})`;
  });
}

function drawDoor(ctx, tx, ty) {
  /* Oak-door style: hinge rail, upper “glass”, center seam, plank bands, knob (MC-inspired). */
  drawPixelArt(ctx, tx, ty, {
    '#': [52, 38, 20],
    b: [124, 86, 46],
    B: [168, 120, 68],
    d: [90, 60, 32],
    w: [72, 82, 90],
    W: [108, 118, 128],
    s: [56, 38, 18],
    m: [188, 188, 192],
  }, [
    '################',
    '################',
    '##bbbbbbbbbbbb##',
    '##bWWwwwwwwWWb##',
    '##bWwwwwwwwwwb##',
    '##bwwwwwwwwwwb##',
    '##bwwwwwwwwwwb##',
    '##bbbbssbbbbbb##',
    '##BbbddddbbBBb##',
    '##dbBBBbbBBBdd##',
    '##bbddssddbbbb##',
    '##ddBBbbbbBBdd##',
    '##bbbbbbbbbbbb##',
    '##bbbbbbmbbbbb##',
    '##bbbbbbbbbbbb##',
    '################',
  ]);
}

/* ── Armor items ── */
function drawLeatherHelmet(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    L: [138, 90, 48], l: [110, 68, 32], d: [80, 50, 22],
  }, [
    '................',
    '....lLLLLl......',
    '...lLLLLLLl.....',
    '...LLLLLLLL.....',
    '...LLLLLLLL.....',
    '...lL....Ll.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawLeatherChestplate(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    L: [138, 90, 48], l: [110, 68, 32], d: [80, 50, 22],
  }, [
    '................',
    '...Ll....lL.....',
    '...LLLLLLLL.....',
    '...LLLLLLLL.....',
    '....LLLLLL......',
    '....LLLLLL......',
    '....LLLLLL......',
    '....llllll......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawLeatherLeggings(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    L: [138, 90, 48], l: [110, 68, 32],
  }, [
    '................',
    '....LLLLLL......',
    '....LLLLLL......',
    '....LLL.LL......',
    '....LL..LL......',
    '....LL..LL......',
    '....LL..LL......',
    '....ll..ll......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawLeatherBoots(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    L: [138, 90, 48], l: [110, 68, 32],
  }, [
    '................',
    '................',
    '................',
    '....LL..LL......',
    '....LL..LL......',
    '...lLL.lLL......',
    '...lll.lll......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronHelmet(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    I: [220, 224, 230], i: [178, 182, 188], d: [130, 135, 140],
  }, [
    '................',
    '....iIIIIi......',
    '...iIIIIIIi.....',
    '...IIIIIIII.....',
    '...IIIIIIII.....',
    '...iI....Ii.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronChestplate(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    I: [220, 224, 230], i: [178, 182, 188],
  }, [
    '................',
    '...Ii....iI.....',
    '...IIIIIIII.....',
    '...IIIIIIII.....',
    '....IIIIII......',
    '....IIIIII......',
    '....IIIIII......',
    '....iiiiii......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronLeggings(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    I: [220, 224, 230], i: [178, 182, 188],
  }, [
    '................',
    '....IIIIII......',
    '....IIIIII......',
    '....III.II......',
    '....II..II......',
    '....II..II......',
    '....II..II......',
    '....ii..ii......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

function drawIronBoots(ctx, tx, ty) {
  drawPixelArt(ctx, tx, ty, {
    I: [220, 224, 230], i: [178, 182, 188],
  }, [
    '................',
    '................',
    '................',
    '....II..II......',
    '....II..II......',
    '...iII.iII......',
    '...iii.iii......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
}

/** Minecraft-style double-tall grass — crossed billboards, transparent between blades. */
function drawTallGrass(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 61, j + tty * 59, 601);
    const d1 = Math.abs(i - j);
    const d2 = Math.abs(i + j - 15);
    const blade1 = d1 <= 2 || (d1 <= 4 && hash2(i, j, 602) > 0.38);
    const blade2 = d2 <= 2 || (d2 <= 4 && hash2(i, j, 603) > 0.42);
    const stem = Math.abs(i - 7.5) < 1.35 && j >= 5;
    if (!(blade1 || blade2 || stem)) return null;
    const tip = j < 5;
    const base = j > 11;
    const t = hash2(i, j, 604);
    let gr = base ? 68 + Math.floor(t * 20) : tip ? 95 + Math.floor(t * 24) : 82 + Math.floor(t * 22);
    let gg = base ? 124 + Math.floor(hash2(i, j, 605) * 26) : tip ? 172 + Math.floor(hash2(i, j, 606) * 30) : 154 + Math.floor(hash2(i, j, 607) * 28);
    let gb = base ? 38 + Math.floor(hash2(i, j, 608) * 18) : tip ? 52 + Math.floor(hash2(i, j, 609) * 20) : 46 + Math.floor(hash2(i, j, 610) * 19);
    if (blade1 && !blade2) {
      gr = Math.floor(gr * 0.93);
      gg = Math.floor(gg * 0.96);
    }
    if (blade2 && !blade1) {
      gr = Math.floor(gr * 0.88);
      gb = Math.floor(gb * 0.94);
    }
    if (n > 0.88) {
      gr = Math.floor(gr * 0.9);
      gg = Math.floor(gg * 0.92);
    }
    return `rgb(${gr},${gg},${gb})`;
  });
}

/** Short grass — half-block plant; art in lower portion of tile (mesh is 0.5 tall). */
function drawShortGrass(ctx, tx, ty) {
  const ox = tx * TILE_PX;
  const oy = ty * TILE_PX;
  ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
  paintTile16Mc(ctx, tx, ty, (i, j, ttx, tty) => {
    if (j < 8) return null;
    const n = hash2(i + ttx * 71, j + tty * 67, 711);
    const d1 = Math.abs(i - j);
    const d2 = Math.abs(i + j - 15);
    const blade1 = (d1 <= 2 || (d1 <= 3 && hash2(i, j, 712) > 0.45)) && j >= 9;
    const blade2 = (d2 <= 2 || (d2 <= 4 && hash2(i, j, 713) > 0.5)) && j >= 9;
    const tuft = Math.abs(i - 7.5) < 1.85 && j >= 11;
    if (!(blade1 || blade2 || tuft)) return null;
    const t = hash2(i, j, 714);
    const base = j > 12;
    let gr = base ? 62 + Math.floor(t * 18) : 78 + Math.floor(t * 22);
    let gg = base ? 118 + Math.floor(hash2(i, j, 715) * 24) : 148 + Math.floor(hash2(i, j, 716) * 26);
    let gb = base ? 36 + Math.floor(hash2(i, j, 717) * 16) : 44 + Math.floor(hash2(i, j, 718) * 18);
    if (blade1 && !blade2) {
      gr = Math.floor(gr * 0.92);
      gg = Math.floor(gg * 0.95);
    }
    if (blade2 && !blade1) {
      gr = Math.floor(gr * 0.86);
      gb = Math.floor(gb * 0.93);
    }
    if (n > 0.9) {
      gr = Math.floor(gr * 0.89);
      gg = Math.floor(gg * 0.91);
    }
    return `rgb(${gr},${gg},${gb})`;
  });
}

/** Fill atlas canvas — tile positions match blocktypes ATLAS indices */
export function buildAtlasCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context');
  ctx.fillStyle = '#6b6b6b';
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  drawGrassTop(ctx, 0, 0);
  drawGrassSide(ctx, 1, 0);
  drawDirt(ctx, 2, 0);
  drawStone(ctx, 3, 0);
  drawLogTop(ctx, 4, 0);
  drawLogSide(ctx, 5, 0);
  drawLeaves(ctx, 6, 0);
  drawSand(ctx, 7, 0);
  drawPlanks(ctx, 8, 0);
  drawCobble(ctx, 9, 0);
  drawGlass(ctx, 10, 0);
  drawWater(ctx, 11, 0);
  drawBedrock(ctx, 12, 0);
  drawPorkchop(ctx, 13, 0);
  drawBeef(ctx, 14, 0);
  drawLeather(ctx, 15, 0);

  /* row 1: tools & items */
  drawWoodenPickaxe(ctx, 0, 1);
  drawWoodenAxe(ctx, 1, 1);
  drawWoodenShovel(ctx, 2, 1);
  drawWoodenSword(ctx, 3, 1);
  drawStonePickaxe(ctx, 4, 1);
  drawStoneAxe(ctx, 5, 1);
  drawStoneShovel(ctx, 6, 1);
  drawStoneSword(ctx, 7, 1);
  drawStick(ctx, 8, 1);
  drawTorch(ctx, 9, 1);
  drawSnow(ctx, 10, 1);
  drawIce(ctx, 11, 1);
  drawCactusSide(ctx, 12, 1);
  drawCactusTop(ctx, 13, 1);
  drawSandstone(ctx, 14, 1);

  /* row 2: book, drops, iron tier */
  drawBook(ctx, 0, 2);
  drawRottenFlesh(ctx, 1, 2);
  drawIronNugget(ctx, 2, 2);
  drawIronIngot(ctx, 3, 2);
  drawIronPickaxe(ctx, 4, 2);
  drawIronAxe(ctx, 5, 2);
  drawIronShovel(ctx, 6, 2);
  drawIronSword(ctx, 7, 2);
  drawCoalOre(ctx, 8, 2);
  drawIronOre(ctx, 9, 2);
  drawDiamondOre(ctx, 10, 2);
  drawCoalItem(ctx, 11, 2);
  drawDiamondItem(ctx, 12, 2);
  drawFurnaceTop(ctx, 13, 2);
  drawFurnaceSide(ctx, 14, 2);
  drawDoor(ctx, 15, 2);

  /* row 3: armor */
  drawLeatherHelmet(ctx, 0, 3);
  drawLeatherChestplate(ctx, 1, 3);
  drawLeatherLeggings(ctx, 2, 3);
  drawLeatherBoots(ctx, 3, 3);
  drawIronHelmet(ctx, 4, 3);
  drawIronChestplate(ctx, 5, 3);
  drawIronLeggings(ctx, 6, 3);
  drawIronBoots(ctx, 7, 3);
  drawTallGrass(ctx, 8, 3);
  drawShortGrass(ctx, 9, 3);
  drawLava(ctx, 13, 3);

  return canvas;
}

/** Shared sampler settings for block atlas (canvas or image). */
export function configureAtlasTextureSettings(/** @type {THREE.Texture} */ tex) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.premultiplyAlpha = false;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createAtlasTexture() {
  const canvas = buildAtlasCanvas();
  const tex = new THREE.CanvasTexture(canvas);
  return configureAtlasTextureSettings(tex);
}

/** Tiny GPU atlas before `block_atlas.png` loads — avoids synchronous {@link buildAtlasCanvas} on startup. */
export function createPlaceholderAtlasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#8b8b8b';
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return configureAtlasTextureSettings(tex);
}
