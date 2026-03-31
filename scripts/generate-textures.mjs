/**
 * Generates PNG texture files for MiniCraft blocks/items (atlas + per-tile) and mob skins.
 * Block/item atlas tiles are 16×16 px per face (vanilla Minecraft default); mob PNGs are 64×64 (4×16).
 * Run: node scripts/generate-textures.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'src/assets/textures');
const TILES = path.join(ASSETS, 'tiles');
const MOBS = path.join(ASSETS, 'mobs');

/** Per-face resolution — matches {@link ../src/blocktypes.js} TILE_PX (vanilla MC 16×16). */
const TILE = 16;
const G = 16;
const CELL = TILE / G;
const COLS = 16;
const ATLAS_W = COLS * TILE;
const ATLAS_H = COLS * TILE;

function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** ~15 steps per channel — chunky palette for authentic 16×16 texel faces (vanilla MC style). */
function snapMcChannel(v) {
  return Math.max(0, Math.min(255, Math.round(v / 17) * 17));
}

function snapMcRgb(r, g, b) {
  return [snapMcChannel(r), snapMcChannel(g), snapMcChannel(b)];
}

/**
 * Like {@link paintTile16} but snaps opaque/semi-opaque RGB to the MC-style stepped palette.
 */
function paintTile16Mc(data, w, tx, ty, sample) {
  paintTile16(data, w, tx, ty, (i, j, ttx, tty) => {
    const rgba = sample(i, j, ttx, tty);
    if (rgba == null) return null;
    const [r, g, b, a = 255] = rgba;
    if (a === 0) return [0, 0, 0, 0];
    const [R, G, B] = snapMcRgb(r, g, b);
    return [R, G, B, a];
  });
}

function setPx(data, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= ATLAS_H) return;
  const i = (y * w + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function fillRect(data, w, x0, y0, rw, rh, r, g, b, a = 255) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) setPx(data, w, x, y, r, g, b, a);
  }
}

/** Mob / entity fills — snap RGB to the same stepped palette as blocks (64×64 = 4×16 cells). */
function fillRectMc(data, w, x0, y0, rw, rh, r, g, b, a = 255) {
  const [R, G, B] = snapMcRgb(r, g, b);
  fillRect(data, w, x0, y0, rw, rh, R, G, B, a);
}

function paintCell(data, w, ox, oy, i, j, r, g, b, a = 255) {
  const x0 = ox + i * CELL;
  const y0 = oy + j * CELL;
  for (let dy = 0; dy < CELL; dy++) {
    for (let dx = 0; dx < CELL; dx++) {
      setPx(data, w, x0 + dx, y0 + dy, r, g, b, a);
    }
  }
}

/** 2×2 ore blob per vein center (vanilla-style readability at 16×16). */
function paintOreBlob2x2(data, w, ox, oy, i, j, r, g, b, a = 255) {
  const [R, G, B] = snapMcRgb(r, g, b);
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const ii = i + dx;
    const jj = j + dy;
    if (ii < G && jj < G) paintCell(data, w, ox, oy, ii, jj, R, G, B, a);
  }
}

function paintTile16(data, w, tx, ty, sample) {
  const ox = tx * TILE;
  const oy = ty * TILE;
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const rgba = sample(i, j, tx, ty);
      if (rgba == null) continue;
      const [r, g, b, a = 255] = rgba;
      paintCell(data, w, ox, oy, i, j, r, g, b, a);
    }
  }
}

function drawPixelArt(data, w, tx, ty, pal, rows) {
  const ox = tx * TILE;
  const oy = ty * TILE;
  const s = TILE / G;
  const cs = Math.ceil(s);
  for (let row = 0; row < 16; row++) {
    const line = rows[row];
    for (let col = 0; col < 16; col++) {
      const ch = line[col];
      const rgb = pal[ch];
      if (!rgb) continue;
      const [r, g, b] = rgb;
      const [R, G, B] = snapMcRgb(r, g, b);
      fillRect(data, w, ox + col * s, oy + row * s, cs, cs, R, G, B, 255);
    }
  }
}

// —— blocks row 0 (Minecraft-inspired palette & noise — original art) ——
function grassTop(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 31, j + tty * 29, 1);
    const n2v = hash2(i * 2, j * 2, 2);
    /* Bright yellow‑green grass with blade specks (Java grass block vibe). */
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
    return [gr, gg, gb, 255];
  });
}

function grassSide(d, w, tx, ty) {
  const grassH = 3;
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    if (j < grassH) {
      const n = hash2(i + ttx * 17, j + tty * 13, 4);
      const gr = 98 + Math.floor(n * 28);
      const gg = 152 + Math.floor(hash2(i, j, 41) * 26);
      const gb = 58 + Math.floor(hash2(i, j, 42) * 20);
      return [gr, gg, gb, 255];
    }
    const n = hash2(i + ttx * 19, j + tty * 23, 5);
    const rr = 134 + Math.floor(n * 28);
    const gg = 96 + Math.floor(hash2(i, j, 6) * 24);
    const bb = 62 + Math.floor(hash2(i >> 1, j >> 1, 43) * 22);
    return [rr, gg, bb, 255];
  });
}

function dirt(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 41, j + tty * 37, 7);
    const r = 118 + Math.floor(n * 34);
    const g = 84 + Math.floor(hash2(i, j, 8) * 26);
    const b = 56 + Math.floor(hash2(i >> 1, j, 44) * 20);
    if (hash2(i, j, 45) > 0.9) {
      return [Math.floor(r * 0.82), Math.floor(g * 0.85), Math.floor(b * 0.8), 255];
    }
    return [r, g, b, 255];
  });
}

function stone(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 43, j + tty * 39, 9);
    let v = 118 + Math.floor(n * 28);
    if (hash2(i, j, 10) > 0.88) v = 78 + Math.floor(hash2(i, j, 11) * 18);
    else if (hash2(i, j, 12) > 0.93) v = 95 + Math.floor(hash2(i, j, 13) * 12);
    const cool = Math.floor(hash2(i >> 2, j >> 2, 14) * 6);
    return [v - 3 - cool, v - cool, v + 2, 255];
  });
}

function logTop(d, w, tx, ty) {
  const cx = 7.5;
  const cy = 7.5;
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const dx = i - cx;
    const dy = j - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.abs(dist - 5.2) < 0.95 || Math.abs(dist - 3.1) < 0.75 || Math.abs(dist - 1.4) < 0.55;
    const n = hash2(i + ttx * 11, j + tty * 13, 12);
    if (dist < 1.2) {
      const p = 175 + Math.floor(n * 20);
      return [p + 18, p + 8, p, 255];
    }
    const base = ring ? 88 : 142;
    const v = base + Math.floor(n * 16);
    return [v + 22, v + 6, Math.floor(v * 0.55), 255];
  });
}

function logSide(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 47, j + tty * 41, 13);
    const crease = i % 4 === 0;
    const v = (crease ? 58 : 72) + Math.floor(n * 22);
    const r = v + 28;
    const g = Math.floor(v * 0.82);
    const b = Math.floor(v * 0.58);
    const shade = crease ? 0.72 : 1;
    return [Math.floor(r * shade), Math.floor(g * shade), Math.floor(b * shade), 255];
  });
}

function leaves(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 53, j + tty * 49, 14);
    const clump = hash2(i + j * 0.3, j * 1.7 + i * 0.2, 15);
    if (n > 0.38 && clump > 0.22) {
      const t = hash2(i, j, 16);
      const gr = 45 + Math.floor(t * 28);
      const gg = 92 + Math.floor(hash2(i, j, 17) * 36);
      const gb = 38 + Math.floor(hash2(i, j, 18) * 22);
      return [gr, gg, gb, 255];
    }
    if (n > 0.32 && hash2(i, j, 19) > 0.65) {
      return [58, 110, 48, 200];
    }
    return [0, 0, 0, 0];
  });
}

function sand(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 59, j + tty * 61, 15);
    const r = 210 + Math.floor(n * 28);
    const g = 200 + Math.floor(hash2(i, j, 16) * 22);
    const b = 152 + Math.floor(hash2(i >> 1, j >> 1, 46) * 24);
    return [r, g, b, 255];
  });
}

function planks(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
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
    return [r, g, b, 255];
  });
}

function cobble(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
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
    return [
      Math.min(255, Math.floor(br * mul)),
      Math.min(255, Math.floor(bg * mul)),
      Math.min(255, Math.floor(bb * mul)),
      255,
    ];
  });
}

function glass(d, w, tx, ty) {
  const ox = tx * TILE;
  const oy = ty * TILE;
  fillRect(d, w, ox, oy, TILE, TILE, 180, 220, 255, 0);
  paintTile16Mc(d, w, tx, ty, (i, j) => {
    const edge = i === 0 || j === 0 || i === G - 1 || j === G - 1;
    if (edge) return [200, 235, 255, 140];
    return [145, 200, 235, 85];
  });
  for (let k = 0; k <= G - 6; k++) {
    const t = k / Math.max(1, G - 6);
    const x1 = Math.floor(ox + (2.5 + t * (G - 5)) * CELL);
    const y1 = Math.floor(oy + (G - 2.5 - t * (G - 5)) * CELL);
    const [R, gPx, bPx] = snapMcRgb(120, 175, 220);
    setPx(d, w, x1, y1, R, gPx, bPx, 130);
  }
}

function water(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 79, j + tty * 83, 888);
    const wave = Math.sin((i + j) * 0.55 + ttx + tty) * 0.5 + 0.5;
    const r = 28 + Math.floor(n * 18 + wave * 12);
    const g = 92 + Math.floor(n * 22 + wave * 16);
    const b = 210 + Math.floor(hash2(i, j, 52) * 28);
    const a = Math.floor(255 * (0.48 + n * 0.16));
    return [r, g, b, a];
  });
}

function bedrock(d, w, tx, ty) {
  paintTile16Mc(d, w, tx, ty, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 89, j + tty * 97, 200);
    let v = 28 + Math.floor(n * 22);
    if (hash2(i, j, 201) > 0.82) v = 52 + Math.floor(hash2(i, j, 202) * 28);
    if (hash2(i, j, 203) > 0.92) v = 12 + Math.floor(hash2(i, j, 204) * 10);
    const gv = v + Math.floor(hash2(i, j, 205) * 8);
    const bv = Math.min(255, v + 6 + Math.floor(hash2(i, j, 206) * 4));
    return [v, gv, bv, 255];
  });
}

function porkchop(d, w, tx, ty) {
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
  drawPixelArt(d, w, tx, ty, pal, rows);
}

function beef(d, w, tx, ty) {
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
  ];
  drawPixelArt(d, w, tx, ty, pal, rows);
}

function leather(d, w, tx, ty) {
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
  drawPixelArt(d, w, tx, ty, pal, rows);
}

// Tools & row 2 items (same palettes as textures.js)
/* MC-style tool colors: dark oak handle, cobbly stone, bright iron. */
const WOOD = { w: [100, 68, 42], W: [148, 118, 78], h: [88, 58, 36] };
const STN = { s: [110, 110, 110], S: [156, 156, 156], h: [88, 58, 36] };
const IRN = { i: [178, 182, 188], I: [232, 236, 242], h: [88, 58, 36] };

function rowTools(d, w) {
  drawPixelArt(d, w, 0, 1, WOOD, [
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
  drawPixelArt(d, w, 1, 1, WOOD, [
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
  drawPixelArt(d, w, 2, 1, WOOD, [
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
  drawPixelArt(d, w, 3, 1, WOOD, [
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
  drawPixelArt(d, w, 4, 1, STN, [
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
  drawPixelArt(d, w, 5, 1, STN, [
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
  drawPixelArt(d, w, 6, 1, STN, [
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
  drawPixelArt(d, w, 7, 1, STN, [
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
  drawPixelArt(d, w, 8, 1, { h: [100, 75, 45], H: [120, 90, 55] }, [
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
  fillRect(d, w, 9 * TILE, 1 * TILE, TILE, TILE, 0, 0, 0, 0);
  /*
   * Torch tile aligned to blocktypes + mesher:
   *   flame: cols [5,11) × rows [2,7)  — 6×5 cells, fill for flame-head box UVs
   *   stem:  cols [7,9) × rows [7,13) — 2×6 cells, solid for narrow stem UVs
   * Rows/cols are TILE_CELLS (16); '.' = transparent (hotbar / cutout).
   */
  drawPixelArt(d, w, 9, 1, {
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

function rowIronBook(d, w) {
  drawPixelArt(d, w, 0, 2, {
    l: [92, 58, 38],
    L: [120, 78, 52],
    p: [220, 210, 190],
    P: [255, 252, 245],
    b: [40, 32, 28],
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
  drawPixelArt(d, w, 1, 2, {
    '.': [120, 90, 75],
    o: [140, 100, 82],
    m: [100, 70, 58],
    g: [90, 120, 70],
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
  drawPixelArt(d, w, 2, 2, { d: [90, 92, 98], D: [150, 152, 160], l: [200, 202, 210] }, [
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
  drawPixelArt(d, w, 3, 2, { d: [85, 88, 95], D: [140, 145, 155], l: [190, 195, 205] }, [
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
  drawPixelArt(d, w, 4, 2, IRN, [
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
  drawPixelArt(d, w, 5, 2, IRN, [
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
  drawPixelArt(d, w, 6, 2, IRN, [
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
  drawPixelArt(d, w, 7, 2, IRN, [
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

/** Row 1 cols 10–14 — must match {@link ../src/textures.js} buildAtlasCanvas (unused by blocktypes). */
function rowBiomeAtlasR1(d, w) {
  const tx0 = 10;
  const ty0 = 1;
  paintTile16Mc(d, w, tx0, ty0, (i, j) => {
    const n = hash2(i + tx0 * 17, j + ty0 * 23, 91);
    const n2 = hash2(i * 2 + 1, j + 3, 92);
    const bright = 230 + Math.floor(n * 25);
    const cool = Math.floor(n2 * 10);
    const b = Math.min(255, bright + cool);
    return [bright, bright, b, 255];
  });
  paintTile16Mc(d, w, 11, 1, (i, j) => {
    const edge = i === 0 || i === 15 || j === 0 || j === 15 ? 1 : 0;
    const n = hash2(i + 11 * 13, j + 1 * 19, 93);
    const n2 = hash2(i * 3 + j, j * 2 - i, 94);
    const r = (edge ? 100 : 125) + Math.floor(n * 45);
    const g = (edge ? 160 : 190) + Math.floor(n2 * 40);
    const b = (edge ? 210 : 232) + Math.floor(hash2(i, j * 2, 95) * 22);
    return [r, g, b, 255];
  });
  const AREOLE_ROWS = [3, 8, 13];
  paintTile16Mc(d, w, 12, 1, (i, j) => {
    const isOuterEdge = i === 0 || i === 15;
    const isInnerEdge = i === 1 || i === 14;
    const isTopBot = j === 0 || j === 15;
    const isRib = j === 4 || j === 9;
    const isSpineTip = isOuterEdge && AREOLE_ROWS.includes(j);
    const isSpineNub = isOuterEdge && AREOLE_ROWS.some((r) => Math.abs(j - r) === 1);
    const isSpineBase = isInnerEdge && AREOLE_ROWS.includes(j);
    if (isSpineTip) return [220, 205, 115, 255];
    if (isSpineNub) return [165, 155, 75, 255];
    if (isOuterEdge) return [20, 78, 6, 255];
    if (isTopBot) return [20, 78, 6, 255];
    if (isSpineBase) return [90, 168, 28, 255];
    if (isRib) return [35, 105, 12, 255];
    const n = hash2(i + 12 * 7, j + 1 * 11, 51);
    const gv = 152 + Math.floor(n * 28);
    return [Math.floor(gv * 0.32), gv, Math.floor(gv * 0.05), 255];
  });
  paintTile16Mc(d, w, 13, 1, (i, j) => {
    const cx = 7.5;
    const cy = 7.5;
    const dist = Math.sqrt((i - cx) ** 2 + (j - cy) ** 2);
    const isEdge = i === 0 || i === 15 || j === 0 || j === 15;
    const isRim = dist >= 6.2;
    const isRing = dist >= 3.8 && dist < 4.8;
    if (isEdge || isRim) return [20, 78, 6, 255];
    if (isRing) return [35, 105, 12, 255];
    const n = hash2(i + 13 * 5, j + 1 * 9, 52);
    const gv = 152 + Math.floor(n * 28);
    return [Math.floor(gv * 0.32), gv, Math.floor(gv * 0.05), 255];
  });
  paintTile16Mc(d, w, 14, 1, (i, j) => {
    const band = Math.floor(j / 4) % 2;
    const n = hash2(i + 14 * 11, j + 1 * 7, 96) * 22;
    const baseR = band === 0 ? 208 : 224;
    const baseG = band === 0 ? 182 : 198;
    const baseB = band === 0 ? 124 : 140;
    return [
      Math.min(255, Math.floor(baseR + n * 0.4)),
      Math.min(255, Math.floor(baseG + n * 0.35)),
      Math.min(255, Math.floor(baseB + n * 0.25)),
      255,
    ];
  });
}

/** Row 2 cols 8–15 + row 3 cols 0–9 — must match {@link ../src/textures.js} / blocktypes atlas indices */
function rowOresFurnaceDoorArmor(d, w) {
  function coalOreTile(tx, ty) {
    stone(d, w, tx, ty);
    const ox = tx * TILE;
    const oy = ty * TILE;
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
      const b = 20 + Math.floor(hash2(i, j, 80) * 15);
      paintOreBlob2x2(d, w, ox, oy, i, j, b, b, b, 255);
    }
  }
  function ironOreTile(tx, ty) {
    stone(d, w, tx, ty);
    const ox = tx * TILE;
    const oy = ty * TILE;
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
      const r = 188 + Math.floor(hash2(i, j, 90) * 20);
      paintOreBlob2x2(d, w, ox, oy, i, j, r, r - 10, r - 25, 255);
    }
  }
  function diamondOreTile(tx, ty) {
    stone(d, w, tx, ty);
    const ox = tx * TILE;
    const oy = ty * TILE;
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
      const gg = 200 + Math.floor(hash2(i, j, 95) * 55);
      const rr = 80 + Math.floor(hash2(i, j, 96) * 30);
      paintOreBlob2x2(d, w, ox, oy, i, j, rr, gg, gg + 10, 255);
    }
  }

  coalOreTile(8, 2);
  ironOreTile(9, 2);
  diamondOreTile(10, 2);

  drawPixelArt(d, w, 11, 2, {
    c: [30, 30, 30],
    C: [55, 50, 45],
    h: [15, 15, 15],
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
  drawPixelArt(d, w, 12, 2, {
    d: [78, 210, 225],
    D: [120, 240, 248],
    l: [160, 250, 255],
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

  paintTile16Mc(d, w, 13, 2, (i, j) => {
    const n = hash2(i, j, 120);
    const r = 100 + Math.floor(n * 30);
    return [r, r, r, 255];
  });
  paintTile16Mc(d, w, 14, 2, (i, j) => {
    if (i >= 5 && i <= 10 && j >= 5 && j <= 11) {
      if (i >= 6 && i <= 9 && j >= 6 && j <= 10) {
        const f = hash2(i, j, 125);
        if (j >= 9) {
          return [200 + Math.floor(f * 55), 80 + Math.floor(f * 40), 20, 255];
        }
        return [30 + Math.floor(f * 20), 20 + Math.floor(f * 10), 15, 255];
      }
      return [60, 60, 60, 255];
    }
    const n = hash2(i, j, 121);
    const r = 108 + Math.floor(n * 28);
    return [r, r, r, 255];
  });
  drawPixelArt(d, w, 15, 2, {
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

  drawPixelArt(d, w, 0, 3, { L: [138, 90, 48], l: [110, 68, 32], d: [80, 50, 22] }, [
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
  drawPixelArt(d, w, 1, 3, { L: [138, 90, 48], l: [110, 68, 32], d: [80, 50, 22] }, [
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
  drawPixelArt(d, w, 2, 3, { L: [138, 90, 48], l: [110, 68, 32] }, [
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
  drawPixelArt(d, w, 3, 3, { L: [138, 90, 48], l: [110, 68, 32] }, [
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
  drawPixelArt(d, w, 4, 3, { I: [220, 224, 230], i: [178, 182, 188], d: [130, 135, 140] }, [
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
  drawPixelArt(d, w, 5, 3, { I: [220, 224, 230], i: [178, 182, 188] }, [
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
  drawPixelArt(d, w, 6, 3, { I: [220, 224, 230], i: [178, 182, 188] }, [
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
  drawPixelArt(d, w, 7, 3, { I: [220, 224, 230], i: [178, 182, 188] }, [
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

  paintTile16Mc(d, w, 8, 3, (i, j, ttx, tty) => {
    const n = hash2(i + ttx * 61, j + tty * 59, 601);
    const da = Math.abs(i - j);
    const db = Math.abs(i + j - 15);
    const blade1 = da <= 2 || (da <= 4 && hash2(i, j, 602) > 0.38);
    const blade2 = db <= 2 || (db <= 4 && hash2(i, j, 603) > 0.42);
    const stem = Math.abs(i - 7.5) < 1.35 && j >= 5;
    if (!(blade1 || blade2 || stem)) return [0, 0, 0, 0];
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
    return [gr, gg, gb, 255];
  });

  paintTile16Mc(d, w, 9, 3, (i, j, ttx, tty) => {
    if (j < 8) return [0, 0, 0, 0];
    const n = hash2(i + ttx * 71, j + tty * 67, 711);
    const d1 = Math.abs(i - j);
    const d2 = Math.abs(i + j - 15);
    const blade1 = (d1 <= 2 || (d1 <= 3 && hash2(i, j, 712) > 0.45)) && j >= 9;
    const blade2 = (d2 <= 2 || (d2 <= 4 && hash2(i, j, 713) > 0.5)) && j >= 9;
    const tuft = Math.abs(i - 7.5) < 1.85 && j >= 11;
    if (!(blade1 || blade2 || tuft)) return [0, 0, 0, 0];
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
    return [gr, gg, gb, 255];
  });

  /* Crafting table — top: 3×3 grid + tool glint; side: plank body + drawer (16 chars/row) */
  drawPixelArt(
    d,
    w,
    10,
    3,
    {
      '#': [32, 22, 12],
      e: [88, 58, 32],
      E: [118, 78, 44],
      t: [198, 178, 142],
      T: [228, 210, 178],
      g: [62, 58, 52],
      G: [48, 44, 40],
      s: [175, 182, 190],
      S: [210, 216, 224],
    },
    [
      '################',
      '#eeeeEEEEeeeeee#',
      '#eeTTttttttTTEe#',
      '#eTtgGtGtGtGteE#',
      '#eTtGtGtGtGtGte#',
      '#eTtgGtGtGtGteE#',
      '#eTtGtGtGtGtGte#',
      '#eTtgGtGtGtGteE#',
      '#eETtttSStttTEe#',
      '#eeEEEEEEEEEEEE#',
      '#eeeeeeeeeeeeee#',
      '################',
      '################',
      '################',
      '################',
      '################',
    ],
  );
  drawPixelArt(
    d,
    w,
    11,
    3,
    {
      '#': [32, 22, 12],
      e: [100, 68, 38],
      E: [132, 92, 52],
      d: [72, 48, 28],
      D: [52, 34, 20],
      v: [88, 84, 78],
      V: [130, 126, 118],
    },
    [
      '################',
      '#eeeeeeeeeeeeee#',
      '#eeEEEEEEEEEEee#',
      '#eEvvvvvvvvvvEe#',
      '#eEVVdVVVVdVVEe#',
      '#eEvvdvvvvdvvEe#',
      '#eEvvdvvvvdvvEe#',
      '#eEVVdVVVVdVVEe#',
      '#eEvvvvvvvvvvEe#',
      '#eeDDDDDDDDDDee#',
      '#eeeeeeeeeeeeee#',
      '################',
      '################',
      '################',
      '################',
      '################',
    ],
  );
}

function buildAtlasBuffer() {
  const png = new PNG({ width: ATLAS_W, height: ATLAS_H });
  const d = png.data;
  fillRect(d, ATLAS_W, 0, 0, ATLAS_W, ATLAS_H, 42, 42, 46, 255);

  grassTop(d, ATLAS_W, 0, 0);
  grassSide(d, ATLAS_W, 1, 0);
  dirt(d, ATLAS_W, 2, 0);
  stone(d, ATLAS_W, 3, 0);
  logTop(d, ATLAS_W, 4, 0);
  logSide(d, ATLAS_W, 5, 0);
  leaves(d, ATLAS_W, 6, 0);
  sand(d, ATLAS_W, 7, 0);
  planks(d, ATLAS_W, 8, 0);
  cobble(d, ATLAS_W, 9, 0);
  glass(d, ATLAS_W, 10, 0);
  water(d, ATLAS_W, 11, 0);
  bedrock(d, ATLAS_W, 12, 0);
  porkchop(d, ATLAS_W, 13, 0);
  beef(d, ATLAS_W, 14, 0);
  leather(d, ATLAS_W, 15, 0);

  rowTools(d, ATLAS_W);
  rowBiomeAtlasR1(d, ATLAS_W);
  rowIronBook(d, ATLAS_W);
  rowOresFurnaceDoorArmor(d, ATLAS_W);

  return png;
}

function n2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 9973) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0xffff) / 65535;
}

function mobPigSkin(buf, w) {
  const SIZE = 64;
  const CH = 4;
  for (let y = 0; y < SIZE; y += CH) {
    for (let x = 0; x < SIZE; x += CH) {
      const nx = n2(x, y, 101);
      const ny = n2(x >> 2, y >> 2, 202);
      const bellyBoost = y > SIZE * 0.36 && y < SIZE * 0.7 ? 1.12 : 1;
      let r = Math.min(255, Math.floor((242 + nx * 18) * bellyBoost));
      let g = Math.min(255, Math.floor((178 + ny * 28) * bellyBoost));
      let b = Math.min(255, Math.floor((198 + nx * 20) * bellyBoost));
      const cx = x + CH / 2;
      const cy = y + CH / 2;
      const spot1 = (cx - 18) ** 2 + (cy - 22) ** 2 < 42;
      const spot2 = (cx - 44) ** 2 + (cy - 48) ** 2 < 56;
      const spot3 = (cx - 40) ** 2 + (cy - 16) ** 2 < 32;
      if (spot1 || spot2 || spot3) {
        r = Math.floor(r * 0.82);
        g = Math.floor(g * 0.78);
        b = Math.floor(b * 0.85);
      }
      fillRectMc(buf, w, x, y, CH, CH, r, g, b, 255);
    }
  }
  for (let y = 24; y < 52; y++) {
    for (let x = 8; x < 56; x++) {
      const i = (y * w + x) * 4;
      const a = 0.35;
      buf[i] = Math.min(255, Math.floor(buf[i] * (1 - a) + 255 * a));
      buf[i + 1] = Math.min(255, Math.floor(buf[i + 1] * (1 - a) + 220 * a));
      buf[i + 2] = Math.min(255, Math.floor(buf[i + 2] * (1 - a) + 232 * a));
    }
  }
}

function mobPigSnout(buf, w) {
  const SIZE = 64;
  const CH = 4;
  for (let y = 0; y < SIZE; y += CH) {
    for (let x = 0; x < SIZE; x += CH) {
      const v = n2(x, y, 303);
      const r = Math.floor(228 + v * 22);
      const g = Math.floor(158 + v * 20);
      const b = Math.floor(178 + v * 18);
      fillRectMc(buf, w, x, y, CH, CH, r, g, b, 255);
    }
  }
  fillRectMc(buf, w, 20, 36, 8, 4, 55, 38, 48, 255);
  fillRectMc(buf, w, 36, 36, 8, 4, 55, 38, 48, 255);
}

function mobPigHoof(buf, w) {
  const SIZE = 64;
  const CH = 4;
  for (let y = 0; y < SIZE; y += CH) {
    for (let x = 0; x < SIZE; x += CH) {
      const v = n2(x, y, 404);
      const r = Math.floor(58 + v * 22);
      const g = Math.floor(44 + v * 18);
      const b = Math.floor(40 + v * 16);
      fillRectMc(buf, w, x, y, CH, CH, r, g, b, 255);
    }
  }
}

function writePng(pathOut, width, height, fill) {
  const png = new PNG({ width, height });
  fill(png.data, width);
  fs.writeFileSync(pathOut, PNG.sync.write(png));
}

function mobCowHide(buf, w) {
  const SIZE = 64;
  const CH = 4;
  for (let y = 0; y < SIZE; y += CH) {
    for (let x = 0; x < SIZE; x += CH) {
      const nx = n2(x, y, 501);
      const ny = n2(x >> 2, y >> 2, 502);
      const cx = x + CH / 2;
      const cy = y + CH / 2;
      const spot =
        (cx - 14) ** 2 + (cy - 20) ** 2 < 100 ||
        (cx - 48) ** 2 + (cy - 36) ** 2 < 140 ||
        (cx - 30) ** 2 + (cy - 52) ** 2 < 80 ||
        (cx - 52) ** 2 + (cy - 14) ** 2 < 55;
      let r;
      let g;
      let b;
      if (spot) {
        r = Math.min(255, Math.floor(42 + nx * 20));
        g = Math.min(255, Math.floor(32 + ny * 18));
        b = Math.min(255, Math.floor(28 + nx * 14));
      } else {
        r = Math.min(255, Math.floor(248 + nx * 8));
        g = Math.min(255, Math.floor(242 + ny * 8));
        b = Math.min(255, Math.floor(236 + nx * 8));
      }
      fillRectMc(buf, w, x, y, CH, CH, r, g, b, 255);
    }
  }
}

function mobCowMuzzle(buf, w) {
  const CH = 4;
  for (let y = 0; y < 64; y += CH) {
    for (let x = 0; x < 64; x += CH) {
      const v = n2(x, y, 503);
      const r = Math.floor(200 + v * 28);
      const g = Math.floor(168 + v * 22);
      const b = Math.floor(188 + v * 18);
      fillRectMc(buf, w, x, y, CH, CH, r, g, b, 255);
    }
  }
  fillRectMc(buf, w, 18, 34, 10, 5, 48, 36, 42, 255);
  fillRectMc(buf, w, 36, 34, 10, 5, 48, 36, 42, 255);
}

function mobCowHoof(buf, w) {
  const CH = 4;
  for (let y = 0; y < 64; y += CH) {
    for (let x = 0; x < 64; x += CH) {
      const v = n2(x, y, 504);
      fillRectMc(buf, w, x, y, CH, CH, Math.floor(42 + v * 20), Math.floor(34 + v * 16), Math.floor(30 + v * 14), 255);
    }
  }
}

function mobCowHorn(buf, w) {
  const CH = 4;
  for (let y = 0; y < 64; y += CH) {
    for (let x = 0; x < 64; x += CH) {
      const v = n2(x, y, 505);
      fillRectMc(buf, w, x, y, CH, CH, Math.floor(188 + v * 24), Math.floor(178 + v * 20), Math.floor(160 + v * 18), 255);
    }
  }
}

function mobSquidMantle(buf, w) {
  const CH = 4;
  for (let y = 0; y < 64; y += CH) {
    for (let x = 0; x < 64; x += CH) {
      const nx = n2(x, y, 801);
      const ny = n2(x >> 2, y >> 2, 802);
      const cy = y + CH / 2;
      const belly = cy > 64 * 0.58;
      const spot = n2(x, y, 803) > 0.72;
      let r;
      let g;
      let b;
      if (belly) {
        r = Math.floor(62 + nx * 24);
        g = Math.floor(88 + ny * 28);
        b = Math.floor(168 + nx * 28);
      } else if (spot) {
        r = Math.floor(28 + nx * 16);
        g = Math.floor(42 + ny * 18);
        b = Math.floor(108 + nx * 22);
      } else {
        r = Math.floor(38 + nx * 20);
        g = Math.floor(58 + ny * 22);
        b = Math.floor(138 + nx * 26);
      }
      fillRectMc(buf, w, x, y, CH, CH, r, g, b, 255);
    }
  }
}

function mobSquidTentacle(buf, w) {
  const CH = 4;
  for (let y = 0; y < 64; y += CH) {
    for (let x = 0; x < 64; x += CH) {
      const v = n2(x, y, 804);
      const t = y / 64;
      const lift = (1 - t) * 18;
      fillRectMc(
        buf,
        w,
        x,
        y,
        CH,
        CH,
        Math.floor(34 + v * 14 + lift * 0.3),
        Math.floor(32 + v * 12 + lift * 0.25),
        Math.floor(58 + v * 16 + lift * 0.4),
        255,
      );
    }
  }
}

function mobZombie(buf, w) {
  fillRectMc(buf, w, 0, 0, 64, 64, 52, 118, 58, 255);
  fillRectMc(buf, w, 8, 8, 12, 12, 42, 96, 46, 255);
  fillRectMc(buf, w, 38, 20, 10, 14, 42, 96, 46, 255);
  fillRectMc(buf, w, 16, 40, 14, 10, 42, 96, 46, 255);
  fillRectMc(buf, w, 16, 12, 32, 20, 88, 152, 78, 255);
  fillRectMc(buf, w, 20, 18, 6, 4, 17, 17, 17, 255);
  fillRectMc(buf, w, 32, 18, 6, 4, 17, 17, 17, 255);
  fillRectMc(buf, w, 22, 19, 2, 2, 204, 34, 0, 255);
  fillRectMc(buf, w, 34, 19, 2, 2, 204, 34, 0, 255);
  fillRectMc(buf, w, 22, 26, 14, 3, 26, 26, 26, 255);
}

function extractTile(atlasData, tx, ty) {
  const png = new PNG({ width: TILE, height: TILE });
  const ox = tx * TILE;
  const oy = ty * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const si = ((oy + y) * ATLAS_W + (ox + x)) * 4;
      const di = (y * TILE + x) * 4;
      png.data[di] = atlasData[si];
      png.data[di + 1] = atlasData[si + 1];
      png.data[di + 2] = atlasData[si + 2];
      png.data[di + 3] = atlasData[si + 3];
    }
  }
  return png;
}

function main() {
  fs.mkdirSync(TILES, { recursive: true });
  fs.mkdirSync(MOBS, { recursive: true });

  const atlasPng = buildAtlasBuffer();
  const atlasPath = path.join(ASSETS, 'block_atlas.png');
  fs.writeFileSync(atlasPath, PNG.sync.write(atlasPng));
  console.log('Wrote', atlasPath);

  const names = [
    ['grass_top', 0, 0],
    ['grass_side', 1, 0],
    ['dirt', 2, 0],
    ['stone', 3, 0],
    ['log_top', 4, 0],
    ['log_side', 5, 0],
    ['leaves', 6, 0],
    ['sand', 7, 0],
    ['planks', 8, 0],
    ['cobble', 9, 0],
    ['glass', 10, 0],
    ['water', 11, 0],
    ['bedrock', 12, 0],
    ['porkchop', 13, 0],
    ['beef', 14, 0],
    ['leather', 15, 0],
    ['wooden_pickaxe', 0, 1],
    ['wooden_axe', 1, 1],
    ['wooden_shovel', 2, 1],
    ['wooden_sword', 3, 1],
    ['stone_pickaxe', 4, 1],
    ['stone_axe', 5, 1],
    ['stone_shovel', 6, 1],
    ['stone_sword', 7, 1],
    ['stick', 8, 1],
    ['torch', 9, 1],
    ['snow', 10, 1],
    ['ice', 11, 1],
    ['cactus_side', 12, 1],
    ['cactus_top', 13, 1],
    ['sandstone', 14, 1],
    ['book', 0, 2],
    ['rotten_flesh', 1, 2],
    ['iron_nugget', 2, 2],
    ['iron_ingot', 3, 2],
    ['iron_pickaxe', 4, 2],
    ['iron_axe', 5, 2],
    ['iron_shovel', 6, 2],
    ['iron_sword', 7, 2],
    ['coal_ore', 8, 2],
    ['iron_ore', 9, 2],
    ['diamond_ore', 10, 2],
    ['coal', 11, 2],
    ['diamond', 12, 2],
    ['furnace_top', 13, 2],
    ['furnace_side', 14, 2],
    ['door', 15, 2],
    ['leather_helmet', 0, 3],
    ['leather_chestplate', 1, 3],
    ['leather_leggings', 2, 3],
    ['leather_boots', 3, 3],
    ['iron_helmet', 4, 3],
    ['iron_chestplate', 5, 3],
    ['iron_leggings', 6, 3],
    ['iron_boots', 7, 3],
    ['tall_grass', 8, 3],
    ['short_grass', 9, 3],
  ];
  for (const [name, tx, ty] of names) {
    const tile = extractTile(atlasPng.data, tx, ty);
    const p = path.join(TILES, `${name}.png`);
    fs.writeFileSync(p, PNG.sync.write(tile));
  }
  console.log('Wrote', names.length, 'tiles to', TILES);

  /* Mob sheets: 64×64 = 4×16 — valid multiple-of-16 entity texture (MC-style). */
  writePng(path.join(MOBS, 'pig_skin.png'), 64, 64, mobPigSkin);
  writePng(path.join(MOBS, 'pig_snout.png'), 64, 64, mobPigSnout);
  writePng(path.join(MOBS, 'pig_hoof.png'), 64, 64, mobPigHoof);
  writePng(path.join(MOBS, 'cow_hide.png'), 64, 64, mobCowHide);
  writePng(path.join(MOBS, 'cow_muzzle.png'), 64, 64, mobCowMuzzle);
  writePng(path.join(MOBS, 'cow_hoof.png'), 64, 64, mobCowHoof);
  writePng(path.join(MOBS, 'cow_horn.png'), 64, 64, mobCowHorn);
  writePng(path.join(MOBS, 'squid_mantle.png'), 64, 64, mobSquidMantle);
  writePng(path.join(MOBS, 'squid_tentacle.png'), 64, 64, mobSquidTentacle);
  writePng(path.join(MOBS, 'zombie.png'), 64, 64, mobZombie);
  console.log('Wrote mob textures to', MOBS);
}

main();
