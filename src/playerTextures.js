import * as THREE from 'three';

const S = 48;
/** 48px faces → 16×16 logical texels (Minecraft-style skin resolution). */
const SKIN_CHUNK = 3;

function n2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 9973) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0xffff) / 65535;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {[number,number,number]} base
 * @param {number} seed
 * @param {number} [vary]
 */
function fillSkinNoise(ctx, w, h, base, seed, vary = 22) {
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x, y, seed);
      const r = Math.min(255, Math.floor(base[0] + (v - 0.5) * vary));
      const g = Math.min(255, Math.floor(base[1] + (v - 0.5) * vary));
      const b = Math.min(255, Math.floor(base[2] + (v - 0.5) * vary));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {[number,number,number]} base
 * @param {number} seed
 */
function fillFabricNoise(ctx, w, h, base, seed) {
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x >> 1, y >> 1, seed);
      const seam = Math.abs(x + SKIN_CHUNK * 0.5 - w * 0.5) < SKIN_CHUNK ? 0.85 : 1;
      const r = Math.min(255, Math.floor((base[0] + v * 28) * seam));
      const g = Math.min(255, Math.floor((base[1] + n2(x, y, seed + 1) * 24) * seam));
      const b = Math.min(255, Math.floor((base[2] + v * 20) * seam));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
}

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.floor(n)));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawHeadFront(ctx, w, h) {
  const hairTop = Math.floor(h * 0.24);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n2(x, y, 501) * 5;
      const shade = 1 - y / (h * 1.15) * 0.07;
      const r = clamp255((236 - y * 0.1 + v) * shade);
      const g = clamp255((202 - y * 0.09 + v) * shade);
      const b = clamp255((174 - y * 0.07 + v) * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let y = 0; y < hairTop; y++) {
    for (let x = 0; x < w; x++) {
      const v = n2(x, y, 502);
      ctx.fillStyle = `rgb(${40 + v * 22},${26 + v * 14},${16 + v * 10})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const bangL = Math.floor(w * 0.16);
  const bangR = Math.floor(w * 0.84);
  for (let y = hairTop; y < hairTop + 6; y++) {
    for (let x = bangL; x < bangR; x++) {
      if (Math.abs(x - w * 0.5) < w * 0.14) continue;
      const v = n2(x, y, 503);
      ctx.fillStyle = `rgb(${46 + v * 20},${30 + v * 12},${18 + v * 8})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const cx = Math.floor(w * 0.5);
  ctx.fillStyle = 'rgba(188,150,128,0.35)';
  for (let y = Math.floor(h * 0.34); y < Math.floor(h * 0.58); y++) {
    const spread = Math.floor((y - h * 0.34) * 0.35);
    ctx.fillRect(cx - 1 - spread, y, 2 + spread * 2, 1);
  }

  const browY = Math.floor(h * 0.34);
  ctx.fillStyle = 'rgb(48,34,24)';
  ctx.fillRect(Math.floor(w * 0.14), browY, 11, 3);
  ctx.fillRect(Math.floor(w * 0.64), browY, 11, 3);

  const exL = Math.floor(w * 0.14);
  const exR = Math.floor(w * 0.64);
  const ey = Math.floor(h * 0.39);
  const ew = 13;
  const eh = 11;
  for (const ex of [exL, exR]) {
    ctx.fillStyle = 'rgb(40,36,34)';
    ctx.fillRect(ex - 1, ey - 1, ew + 2, eh + 2);
    ctx.fillStyle = 'rgb(255,252,248)';
    ctx.fillRect(ex, ey, ew, eh);
    ctx.fillStyle = 'rgb(28,26,26)';
    ctx.fillRect(ex, ey, ew, 2);
    ctx.fillStyle = 'rgb(88,158,218)';
    ctx.fillRect(ex + 2, ey + 3, ew - 4, eh - 5);
    ctx.fillStyle = 'rgb(58,128,188)';
    ctx.fillRect(ex + 3, ey + 5, ew - 6, eh - 8);
    ctx.fillStyle = 'rgb(24,32,44)';
    ctx.fillRect(ex + 5, ey + 5, 4, 5);
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(ex + 6, ey + 5, 3, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(ex + 2, ey + eh - 2, ew - 4, 2);
  }

  ctx.fillStyle = 'rgba(160,120,108,0.5)';
  ctx.fillRect(cx - 1, Math.floor(h * 0.5), 2, Math.floor(h * 0.12));

  ctx.fillStyle = 'rgba(228,150,138,0.55)';
  ctx.fillRect(Math.floor(w * 0.22), Math.floor(h * 0.52), 8, 4);
  ctx.fillRect(Math.floor(w * 0.66), Math.floor(h * 0.52), 8, 4);

  const my = Math.floor(h * 0.63);
  ctx.fillStyle = 'rgb(172,88,88)';
  ctx.fillRect(Math.floor(w * 0.3), my, 4, 2);
  ctx.fillRect(Math.floor(w * 0.38), my + 1, 8, 2);
  ctx.fillRect(Math.floor(w * 0.54), my + 1, 8, 2);
  ctx.fillRect(Math.floor(w * 0.66), my, 4, 2);
  ctx.fillStyle = 'rgb(150,70,72)';
  ctx.fillRect(Math.floor(w * 0.42), my + 2, 14, 1);

  const earX = 2;
  const earY = Math.floor(h * 0.42);
  ctx.fillStyle = 'rgb(222,182,152)';
  ctx.fillRect(earX, earY, 4, 8);
  ctx.fillRect(w - earX - 4, earY, 4, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(earX + 3, earY + 1, 1, 6);
  ctx.fillRect(w - earX - 4, earY + 1, 1, 6);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
/** Hair strip on half of face toward the back of the head (+x face: right half, −x: left). */
function drawHeadSide(ctx, w, h, hairOnRight) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n2(x, y, 5031);
      ctx.fillStyle = `rgb(${clamp255(224 + v * 5)},${clamp255(188 + v * 4)},${clamp255(158 + v * 4)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const x0 = hairOnRight ? Math.floor(w * 0.48) : 0;
  const x1 = hairOnRight ? w : Math.floor(w * 0.52);
  const y1 = Math.floor(h * 0.62);
  for (let y = 0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = n2(x, y, 504);
      ctx.fillStyle = `rgb(${42 + v * 24},${28 + v * 14},${16 + v * 10})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const faceX0 = hairOnRight ? 0 : Math.floor(w * 0.52);
  const faceX1 = hairOnRight ? Math.floor(w * 0.48) : w;
  const inFace = (x) => x >= faceX0 && x < faceX1;

  const eyeX = hairOnRight ? Math.floor(w * 0.22) : Math.floor(w * 0.58);
  const eyeY = Math.floor(h * 0.4);
  if (inFace(eyeX)) {
    ctx.fillStyle = 'rgb(36,32,30)';
    ctx.fillRect(eyeX - 1, eyeY - 1, 7, 9);
    ctx.fillStyle = 'rgb(255,252,248)';
    ctx.fillRect(eyeX, eyeY, 5, 7);
    ctx.fillStyle = 'rgb(28,26,26)';
    ctx.fillRect(eyeX, eyeY, 5, 2);
    ctx.fillStyle = 'rgb(82,148,208)';
    ctx.fillRect(eyeX + 1, eyeY + 3, 3, 3);
    ctx.fillStyle = 'rgb(24,30,40)';
    ctx.fillRect(eyeX + 2, eyeY + 4, 2, 2);
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(eyeX + 3, eyeY + 3, 1, 1);
  }

  const noseX = hairOnRight ? Math.floor(w * 0.36) : Math.floor(w * 0.52);
  const noseY = Math.floor(h * 0.48);
  if (inFace(noseX)) {
    ctx.fillStyle = 'rgb(198,162,138)';
    ctx.fillRect(noseX, noseY, 3, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(noseX + 2, noseY + 1, 1, 4);
  }

  const mouthX = hairOnRight ? Math.floor(w * 0.2) : Math.floor(w * 0.62);
  const mouthY = Math.floor(h * 0.62);
  if (inFace(mouthX) && inFace(mouthX + 4)) {
    ctx.fillStyle = 'rgb(168,82,84)';
    ctx.fillRect(mouthX, mouthY, 6, 2);
    ctx.fillRect(mouthX + 1, mouthY - 1, 4, 1);
  }

  const earX = hairOnRight ? Math.floor(w * 0.62) : Math.floor(w * 0.04);
  const earY = Math.floor(h * 0.38);
  ctx.fillStyle = 'rgb(218,178,148)';
  ctx.fillRect(earX, earY, 8, 11);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(earX + (hairOnRight ? 0 : 7), earY + 2, 1, 7);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawHeadTop(ctx, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n2(x, y, 505);
      const part = Math.abs(x - w * 0.5) < w * 0.08 ? 1.08 : 1;
      ctx.fillStyle = `rgb(${clamp255((46 + v * 28) * part)},${clamp255((30 + v * 18) * part)},${clamp255((18 + v * 12) * part)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.strokeStyle = 'rgba(24,16,10,0.4)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(Math.floor(w * 0.35), 2, Math.floor(w * 0.3), 4);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawHeadBottom(ctx, w, h) {
  fillSkinNoise(ctx, w, h, [200, 165, 138], 506, 18);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawHeadBack(ctx, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n2(x, y, 507);
      ctx.fillStyle = `rgb(${40 + v * 26},${26 + v * 16},${16 + v * 10})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(Math.floor(w * 0.42), Math.floor(h * 0.15), 6, Math.floor(h * 0.5));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
/** Hiking-style shirt: deep teal with placket, pocket, seams */
function drawTorsoFront(ctx, w, h) {
  const base = [34, 118, 108];
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x >> 1, y >> 1, 601);
      const edge = x < 6 || x > w - 9 ? 0.88 : 1;
      ctx.fillStyle = `rgb(${clamp255((base[0] + v * 18) * edge)},${clamp255((base[1] + v * 14) * edge)},${clamp255((base[2] + v * 12) * edge)})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
  const cx = Math.floor(w * 0.5);
  ctx.fillStyle = 'rgb(26,88,82)';
  ctx.fillRect(cx - 2, 4, 4, h - 8);
  ctx.fillStyle = 'rgb(240,236,228)';
  for (let by = 10; by < h - 12; by += 11) {
    ctx.fillRect(cx - 1, by, 2, 2);
  }
  ctx.fillStyle = 'rgb(22,78,72)';
  ctx.strokeStyle = 'rgb(18,62,58)';
  ctx.lineWidth = 1;
  const px = Math.floor(w * 0.62);
  const py = Math.floor(h * 0.22);
  ctx.fillRect(px, py, 14, 12);
  ctx.strokeRect(px + 0.5, py + 0.5, 13, 11);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(3, 2, 4, h - 4);
  ctx.fillRect(w - 7, 2, 4, h - 4);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(4, h - 6, w - 8, 3);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawTorsoBack(ctx, w, h) {
  const base = [28, 98, 92];
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x >> 1, y >> 1, 602);
      ctx.fillStyle = `rgb(${clamp255(base[0] + v * 16)},${clamp255(base[1] + v * 12)},${clamp255(base[2] + v * 10)})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(Math.floor(w * 0.38), Math.floor(h * 0.18), 5, Math.floor(h * 0.58));
  ctx.fillStyle = 'rgb(22,78,72)';
  ctx.fillRect(Math.floor(w * 0.42), Math.floor(h * 0.28), 10, 8);
  ctx.strokeStyle = 'rgb(16,58,54)';
  ctx.strokeRect(Math.floor(w * 0.42) + 0.5, Math.floor(h * 0.28) + 0.5, 9, 7);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawTorsoSide(ctx, w, h, seed) {
  const base = [30, 108, 100];
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x >> 1, y >> 1, seed);
      const seam = Math.abs(x + SKIN_CHUNK * 0.5 - w * 0.5) < SKIN_CHUNK + 1 ? 0.9 : 1;
      ctx.fillStyle = `rgb(${clamp255((base[0] + v * 16) * seam)},${clamp255((base[1] + v * 12) * seam)},${clamp255((base[2] + v * 10) * seam)})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawTorsoTop(ctx, w, h) {
  const base = [40, 124, 114];
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x >> 1, y >> 1, 604);
      ctx.fillStyle = `rgb(${clamp255(base[0] + v * 14)},${clamp255(base[1] + v * 12)},${clamp255(base[2] + v * 10)})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(2, 2, w - 4, Math.floor(h * 0.38));
  ctx.fillStyle = 'rgb(26,88,82)';
  ctx.fillRect(Math.floor(w * 0.42), 3, Math.floor(w * 0.16), 4);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawTorsoBottom(ctx, w, h) {
  const base = [36, 42, 48];
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x >> 1, y >> 1, 605);
      ctx.fillStyle = `rgb(${clamp255(base[0] + v * 10)},${clamp255(base[1] + v * 10)},${clamp255(base[2] + v * 12)})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
  ctx.fillStyle = 'rgb(52,58,64)';
  ctx.fillRect(Math.floor(w * 0.25), 4, Math.floor(w * 0.5), 5);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
/** Denim-style jeans with seam and shading */
function drawPants(ctx, w, h, seed) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n2(x >> 1, y >> 1, seed);
      const fold = Math.sin(y * 0.28 + x * 0.06) * 0.06 + 0.94;
      const leg = x < w * 0.5 ? 0.96 : 1.04;
      const r = clamp255((48 + v * 18) * fold * leg);
      const g = clamp255((62 + v * 16) * fold * leg);
      const b = clamp255((92 + v * 20) * fold * leg);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const mx = Math.floor(w * 0.5);
  ctx.fillStyle = 'rgba(20,28,42,0.35)';
  ctx.fillRect(mx - 1, 2, 2, h - 4);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(4, 4, 3, h - 8);
  ctx.fillRect(w - 7, 4, 3, h - 8);
  if (seed === 706) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(Math.floor(w * 0.28), Math.floor(h * 0.25), 10, 11);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(Math.floor(w * 0.28) + 0.5, Math.floor(h * 0.25) + 0.5, 9, 10);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawArmShirt(ctx, w, h, seed) {
  const base = [34, 118, 108];
  for (let y = 0; y < h; y += SKIN_CHUNK) {
    for (let x = 0; x < w; x += SKIN_CHUNK) {
      const v = n2(x >> 1, y >> 1, seed);
      const cuff = y > h * 0.72 ? 0.92 : 1;
      ctx.fillStyle = `rgb(${clamp255((base[0] + v * 16) * cuff)},${clamp255((base[1] + v * 14) * cuff)},${clamp255((base[2] + v * 12) * cuff)})`;
      ctx.fillRect(x, y, SKIN_CHUNK, SKIN_CHUNK);
    }
  }
  ctx.fillStyle = 'rgb(26,88,82)';
  ctx.fillRect(2, Math.floor(h * 0.68), w - 4, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(2, 2, 3, Math.floor(h * 0.65));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function drawArmHandEnd(ctx, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n2(x, y, 801);
      ctx.fillStyle = `rgb(${clamp255(226 + v * 8)},${clamp255(190 + v * 7)},${clamp255(158 + v * 6)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function makeCanvas(drawFn) {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  drawFn(ctx, S, S);
  return c;
}

/**
 * @param {HTMLCanvasElement} canvas
 */
function matFromCanvas(canvas, opts = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return new THREE.MeshLambertMaterial({
    map: tex,
    flatShading: true,
    ...opts,
  });
}

/**
 * Steve-style right-arm faces (4×12 skin layout) for the first-person arm.
 * Own canvases/textures so dispose of the FP hand does not affect the player model.
 */
export function buildFirstPersonArmMaterialSet() {
  const fpSide = { side: THREE.DoubleSide };
  const armMats = [
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 921)), fpSide),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 922)), fpSide),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 923)), fpSide),
    matFromCanvas(makeCanvas(drawArmHandEnd), fpSide),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 925)), fpSide),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 926)), fpSide),
  ];
  const handMat = matFromCanvas(makeCanvas(drawArmHandEnd), fpSide);
  return { armMats, handMat };
}

/**
 * BoxGeometry face order: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z front, 5 -z back
 */
export function buildPlayerModelMaterials() {
  const headRight = matFromCanvas(makeCanvas((c, w, h) => drawHeadSide(c, w, h, true))); // +x
  const headLeft = matFromCanvas(makeCanvas((c, w, h) => drawHeadSide(c, w, h, false))); // −x
  const headTop = matFromCanvas(makeCanvas(drawHeadTop));
  const headBot = matFromCanvas(makeCanvas(drawHeadBottom));
  const headFront = matFromCanvas(makeCanvas(drawHeadFront));
  const headBack = matFromCanvas(makeCanvas(drawHeadBack));
  const headMats = [headRight, headLeft, headTop, headBot, headFront, headBack];

  const torsoRight = matFromCanvas(makeCanvas((c, w, h) => drawTorsoSide(c, w, h, 611)));
  const torsoLeft = matFromCanvas(makeCanvas((c, w, h) => drawTorsoSide(c, w, h, 612)));
  const torsoTop = matFromCanvas(makeCanvas(drawTorsoTop));
  const torsoBot = matFromCanvas(makeCanvas(drawTorsoBottom));
  const torsoFront = matFromCanvas(makeCanvas(drawTorsoFront));
  const torsoBack = matFromCanvas(makeCanvas(drawTorsoBack));
  const torsoMats = [torsoRight, torsoLeft, torsoTop, torsoBot, torsoFront, torsoBack];

  const legMats = [
    matFromCanvas(makeCanvas((c, w, h) => drawPants(c, w, h, 701))),
    matFromCanvas(makeCanvas((c, w, h) => drawPants(c, w, h, 702))),
    matFromCanvas(makeCanvas((c, w, h) => drawPants(c, w, h, 703))),
    matFromCanvas(makeCanvas((c, w, h) => drawPants(c, w, h, 704))),
    matFromCanvas(makeCanvas((c, w, h) => drawPants(c, w, h, 705))),
    matFromCanvas(makeCanvas((c, w, h) => drawPants(c, w, h, 706))),
  ];

  const armMats = [
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 901))),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 902))),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 903))),
    matFromCanvas(makeCanvas(drawArmHandEnd)),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 905))),
    matFromCanvas(makeCanvas((c, w, h) => drawArmShirt(c, w, h, 906))),
  ];

  const handMat = matFromCanvas(makeCanvas(drawArmHandEnd));

  const overlayMats = [701, 702, 703, 704, 705, 706].map((seed) =>
    matFromCanvas(
      makeCanvas((c, w, h) => {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const v = n2(x, y, seed + 800);
            c.fillStyle = `rgb(${38 + v * 22},${24 + v * 14},${14 + v * 9})`;
            c.fillRect(x, y, 1, 1);
          }
        }
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.fillRect(Math.floor(w * 0.35), 2, Math.floor(w * 0.3), Math.floor(h * 0.35));
      }),
    ),
  );

  return { headMats, torsoMats, legMats, armMats, handMat, overlayMats };
}
