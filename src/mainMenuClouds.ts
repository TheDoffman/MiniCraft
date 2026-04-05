/**
 * Drifting voxel-style clouds on the title sky (2D canvas). Matches in-game westward drift (cloudLayer.js).
 */

/**
 * @param {number} ix
 * @param {number} iy
 * @param {number} seed
 */
function hash01(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} skyEl
 * @param {HTMLElement} startEl
 */
export function initMainMenuClouds(canvas, skyEl, startEl) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const CELL = 5;
  const GRID_R = 14;
  const MIN_GAP = 3;

  /** @type {{ vw: number, layers: { speed: number; slabs: { bx: number; y: number; gw: number; gd: number; top: string; side: string }[] }[] }} */
  let layout = { vw: 0, layers: [] };

  function parseKey(key) {
    const i = key.indexOf(',');
    return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
  }

  function cellClear(ax, az, taken, minGap) {
    for (const key of taken) {
      const [tx, tz] = parseKey(key);
      if (Math.max(Math.abs(ax - tx), Math.abs(az - tz)) < minGap) return false;
    }
    return true;
  }

  function tryOrder(ix, iz) {
    const base = [
      [3, 3],
      [3, 2],
      [2, 3],
      [2, 2],
      [2, 1],
      [1, 2],
      [1, 1],
    ];
    const n = base.length;
    const rot = Math.floor(hash01(ix, iz, 820) * n);
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[(rot + i) % n]);
    return out;
  }

  function patternFits(ix, iz, w, d, taken) {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const cx = ix + dx;
        const cz = iz + dz;
        if (cx < -GRID_R || cx >= GRID_R || cz < -GRID_R || cz >= GRID_R) return false;
        if (taken.has(`${cx},${cz}`)) return false;
        if (!cellClear(cx, cz, taken, MIN_GAP)) return false;
      }
    }
    return true;
  }

  function mark(ix, iz, w, d, taken) {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) taken.add(`${ix + dx},${iz + dz}`);
    }
  }

  /**
   * @param {number} wCss
   * @param {number} hCss
   */
  function buildLayout(wCss, hCss) {
    const vw = Math.max(wCss * 3.2, 900);
    const span = GRID_R * CELL * 2;
    const layers = [];

    const palette = [
      { top: '#ffffff', side: '#c6cad4' },
      { top: '#eef1f8', side: '#b4b8c4' },
    ];

    for (let layer = 0; layer < 2; layer++) {
      const taken = new Set();
      const slabs = [];
      const seed = 701 + layer * 173;
      const { top, side } = palette[layer];

      for (let iz = -GRID_R; iz < GRID_R; iz++) {
        for (let ix = -GRID_R; ix < GRID_R; ix++) {
          if (taken.has(`${ix},${iz}`)) continue;
          if (hash01(ix, iz, seed) < 0.84) continue;

          const order = tryOrder(ix, iz);
          let placed = false;
          for (const [cw, cd] of order) {
            if (!patternFits(ix, iz, cw, cd, taken)) continue;
            const gw = cw * CELL;
            const gd = cd * CELL;
            const wx = ix * CELL + gw * 0.5 + span * 0.5;
            const bx = (wx / span) * vw;
            const y =
              hCss * (0.06 + layer * 0.04) +
              hash01(ix, iz, seed + 31) * hCss * 0.52 +
              (hash01(ix, iz, seed + 47) - 0.5) * 14;
            slabs.push({ bx, y, gw, gd, top, side });
            mark(ix, iz, cw, cd, taken);
            placed = true;
            break;
          }
        }
      }

      layers.push({
        slabs,
        /* px/s westward, parallax — same sense as cloudLayer drift */
        speed: 11 + layer * 8,
      });
    }

    layout = { vw, layers };
  }

  let drift0 = 0;
  let drift1 = 0;
  let lastT = performance.now();
  let rafId = 0;

  function resize() {
    const w = skyEl.clientWidth;
    const h = skyEl.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    buildLayout(w, h);
  }

  function drawSlab(x0, y0, gw, gd, top, side) {
    const gwI = Math.max(1, Math.floor(gw));
    const gdI = Math.max(1, Math.floor(gd));
    const topH = Math.max(2, Math.floor(CELL * 0.55));
    const yi = Math.floor(y0);
    const xi = Math.floor(x0);
    ctx.fillStyle = side;
    ctx.fillRect(xi, yi + topH, gwI, gdI);
    ctx.fillStyle = top;
    ctx.fillRect(xi, yi, gwI, topH);
  }

  function draw(now) {
    const w = skyEl.clientWidth;
    const h = skyEl.clientHeight;
    if (w <= 0 || h <= 0 || layout.layers.length === 0) return;

    const dt = Math.min((now - lastT) / 1000, 0.12);
    lastT = now;

    ctx.clearRect(0, 0, w, h);

    const vw = layout.vw;

    for (let li = 0; li < layout.layers.length; li++) {
      const layer = layout.layers[li];
      if (li === 0) {
        drift0 = (drift0 + dt * layer.speed) % vw;
        if (drift0 < 0) drift0 += vw;
      } else {
        drift1 = (drift1 + dt * layer.speed) % vw;
        if (drift1 < 0) drift1 += vw;
      }
      const shift = li === 0 ? drift0 : drift1;

      for (const s of layer.slabs) {
        let x = s.bx - shift;
        x = ((x % vw) + vw) % vw;
        for (let k = -1; k <= 2; k++) {
          const xs = x + k * vw;
          if (xs > w + 20 || xs + s.gw < -20) continue;
          drawSlab(xs, s.y, s.gw, s.gd, s.top, s.side);
        }
      }
    }
  }

  function frame(now) {
    rafId = 0;
    if (startEl.classList.contains('hidden')) return;
    draw(now);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId || startEl.classList.contains('hidden')) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const ro = new ResizeObserver(() => {
    resize();
  });
  ro.observe(skyEl);

  const mo = new MutationObserver(() => {
    if (startEl.classList.contains('hidden')) stopLoop();
    else {
      resize();
      startLoop();
    }
  });
  mo.observe(startEl, { attributes: true, attributeFilter: ['class'] });

  resize();
  if (!startEl.classList.contains('hidden')) startLoop();

  return () => {
    stopLoop();
    ro.disconnect();
    mo.disconnect();
  };
}
