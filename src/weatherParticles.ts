import * as THREE from 'three';
import { raycastBlocks, isParticleOccluder } from './raycast';

/** @typedef {'full' | 'balanced' | 'minimal'} WeatherEffectsQuality */

/** Fewer streaks + cheaper occlusion keeps weather from dominating the frame budget. */
const COUNT = 1400;
const BOX = 26;
const BOX_Y_LO = -4;
const BOX_Y_HI = 22;

/**
 * When `computeRainParticleExposure` (see `weatherSoundExposure.js`) is high, per-streak rays almost
 * always miss — skip them (saves several raycasts × COUNT per frame during open-field rain).
 */
const RAIN_OPEN_SKIP_STREAK_OCCLUSION_EXPOSURE = 0.88;

/** World-space half-thickness of each rain ribbon (quads, not GL_LINES). */
const RAIN_RIBBON_HALF_W = 0.0075;

const RAIN_FLOATS_PER_STREAK = 12;

/** Hide off-screen — degenerate / clipped segments (must not use NaN). */
const HIDE_X = -1e7;
const HIDE_Y = -1e7;
const HIDE_Z = -1e7;

/**
 * True if an occluding solid lies strictly between the eye and this world point
 * (same test used for rain streak samples).
 */
function isRainSampleOccluded(world, ox, oy, oz, px, py, pz) {
  const dx = px - ox;
  const dy = py - oy;
  const dz = pz - oz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.04) return false;
  const hit = raycastBlocks(world, ox, oy, oz, dx, dy, dz, len + 0.35, {
    isStop: isParticleOccluder,
  });
  if (!hit) return false;
  /* Small margin — catch grazing faces; large margin lets rain “peek” past voxels. */
  return hit.t < len - 0.004;
}

/**
 * @param {'full' | 'balanced'} quality
 */
function isRainStreakOccludedForQuality(world, ox, oy, oz, ax, ay, az, bx, by, bz, wx, wy, wz, quality) {
  if (quality === 'balanced') {
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    const mz = (az + bz) * 0.5;
    return isRainSampleOccluded(world, ox, oy, oz, mx, my, mz);
  }
  if (isRainSampleOccluded(world, ox, oy, oz, wx, wy, wz)) return true;
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const mz = (az + bz) * 0.5;
  return isRainSampleOccluded(world, ox, oy, oz, mx, my, mz);
}

/**
 * @param {import('./world.js').World} world
 * @param {number} ox
 * @param {number} oy
 * @param {number} oz
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 */
export function isRainParticleOccluded(world, ox, oy, oz, px, py, pz) {
  return isRainSampleOccluded(world, ox, oy, oz, px, py, pz);
}

/**
 * @param {THREE.Scene} scene
 */
export function createWeatherParticles(scene) {
  /* Snow / dust — points are fine (soft blobs). */
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const phases = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * BOX;
    positions[i * 3 + 1] = BOX_Y_LO + Math.random() * (BOX_Y_HI - BOX_Y_LO);
    positions[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geom.setAttribute('position', posAttr);

  const mat = new THREE.PointsMaterial({
    color: 0xb8c8e8,
    size: 0.055,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;
  points.name = 'weatherParticles';

  /*
   * Rain: thin camera-facing quads (two tris per streak). GL_LINES + transparency often leaks past
   * opaque depth; triangle rasterization matches the terrain depth buffer reliably.
   */
  const rainGeom = new THREE.BufferGeometry();
  const rainPos = new Float32Array(COUNT * RAIN_FLOATS_PER_STREAK);
  rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainIdx = new Uint16Array(COUNT * 6);
  for (let i = 0; i < COUNT; i++) {
    const b = i * 4;
    const j = i * 6;
    rainIdx[j] = b;
    rainIdx[j + 1] = b + 1;
    rainIdx[j + 2] = b + 2;
    rainIdx[j + 3] = b + 2;
    rainIdx[j + 4] = b + 1;
    rainIdx[j + 5] = b + 3;
  }
  rainGeom.setIndex(new THREE.BufferAttribute(rainIdx, 1));
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0x9ab6d8,
    transparent: true,
    opacity: 0.52,
    depthTest: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const rainMesh = new THREE.Mesh(rainGeom, rainMat);
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 4;
  rainMesh.visible = false;
  rainMesh.name = 'weatherRainQuads';

  scene.add(points);
  scene.add(rainMesh);

  return {
    points,
    geom,
    mat,
    phases,
    posAttr,
    rainMesh,
    rainGeom,
    rainMat,
    rainPos,
    rainOccludePrev: new Uint8Array(COUNT),
    _rainOcclusionActive: false,
    _rainBlend: '',
    _rmOp: -1,
    _rmCol: -1,
  };
}

/**
 * @param {ReturnType<typeof createWeatherParticles>} refs
 * @param {number} dt
 * @param {THREE.Camera} camera
 * @param {string} kind
 * @param {number} strength 0–1
 * @param {number} timeSec
 * @param {import('./world.js').World | null} world
 * @param {number} [rainExposure] 0–1 outdoor exposure (see computeRainParticleExposure); default 1
 * @param {{ simFrame?: number, quality?: WeatherEffectsQuality }} [weatherOpts]
 */
export function updateWeatherParticles(refs, dt, camera, kind, strength, timeSec, world, rainExposure = 1, weatherOpts) {
  const { points, mat, phases, posAttr, rainMesh, rainGeom, rainMat, rainPos } = refs;
  const positions = /** @type {Float32Array} */ (posAttr.array);
  const rainAttr = /** @type {THREE.BufferAttribute} */ (rainGeom.getAttribute('position'));
  const simFrame = weatherOpts?.simFrame ?? 0;
  /** @type {WeatherEffectsQuality} */
  const quality = weatherOpts?.quality ?? 'balanced';

  if (strength < 0.035 || kind === 'clear' || kind === 'mist') {
    points.visible = false;
    rainMesh.visible = false;
    refs._rainOcclusionActive = false;
    rainGeom.setDrawRange(0, Infinity);
    return;
  }

  const rainEx = Math.max(0, Math.min(1, rainExposure));

  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;

  let fall = 18;
  let sway = 1.1;
  let size = 0.048;
  let opacity = 0.42 * strength;

  if (kind === 'rain') {
    points.visible = false;
    fall = 38 + strength * 22;
    sway = 0.55;
    /* Under cover / tunnel: hide rain entirely — not solvable by per-drop depth alone. */
    rainMesh.visible = rainEx > 0.055;

    const wantAdd = quality === 'minimal';
    if (wantAdd) {
      if (refs._rainBlend !== 'add') {
        rainMat.blending = THREE.AdditiveBlending;
        refs._rainBlend = 'add';
        rainMat.needsUpdate = true;
        refs._rmOp = -1;
      }
      const op = THREE.MathUtils.clamp(0.2 + strength * 0.22, 0.06, 0.52);
      const colHex = 0x9ab6d8;
      if (op !== refs._rmOp || colHex !== refs._rmCol) {
        rainMat.opacity = op;
        rainMat.color.setHex(colHex);
        rainMat.needsUpdate = true;
        refs._rmOp = op;
        refs._rmCol = colHex;
      }
    } else {
      if (refs._rainBlend === 'add') {
        rainMat.blending = THREE.NormalBlending;
        refs._rainBlend = 'norm';
        rainMat.needsUpdate = true;
        refs._rmOp = -1;
      }
      const op = THREE.MathUtils.clamp(0.38 + strength * 0.28, 0.1, 0.82);
      const colHex = 0x9ab6d8;
      if (op !== refs._rmOp || colHex !== refs._rmCol) {
        rainMat.opacity = op;
        rainMat.color.setHex(colHex);
        rainMat.needsUpdate = true;
        refs._rmOp = op;
        refs._rmCol = colHex;
      }
    }
  } else {
    if (refs._rainBlend === 'add') {
      rainMat.blending = THREE.NormalBlending;
      refs._rainBlend = 'norm';
      rainMat.needsUpdate = true;
      refs._rmOp = -1;
    }
    rainMesh.visible = false;
    rainGeom.setDrawRange(0, Infinity);
    points.visible = true;
    points.position.set(cx, cy, cz);
    if (kind === 'snow') {
      mat.color.setHex(0xeef6ff);
      fall = 5 + strength * 6;
      sway = 2.4;
      size = 0.062 + strength * 0.03;
      opacity = 0.5 + strength * 0.25;
    } else if (kind === 'dust') {
      mat.color.setHex(0xc9b090);
      fall = -1.2 - strength * 2.2;
      sway = 3.2;
      size = 0.05 + strength * 0.04;
      opacity = 0.28 + strength * 0.35;
    }
    mat.size = size;
    mat.opacity = THREE.MathUtils.clamp(opacity, 0.08, 0.88);
  }

  const wind = Math.sin(timeSec * 0.09) * 0.35 + 0.25;
  const half = BOX * 0.5;

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    let x = positions[i3];
    let y = positions[i3 + 1];
    let z = positions[i3 + 2];

    const ph = phases[i] + timeSec * (kind === 'snow' ? 2.2 : kind === 'dust' ? 0.8 : 0);
    const sx = Math.sin(ph * 1.7 + i * 0.1) * sway * dt;
    const sz = Math.cos(ph * 1.3 + i * 0.13) * sway * dt;

    x += (wind + sx) * dt * (kind === 'rain' ? 8 : 4);
    z += sz * dt * 5;
    y -= fall * dt;

    if (y < BOX_Y_LO) {
      y = BOX_Y_LO + Math.random() * (BOX_Y_HI - BOX_Y_LO);
      x = (Math.random() - 0.5) * BOX;
      z = (Math.random() - 0.5) * BOX;
    }
    if (y > BOX_Y_HI) {
      y = BOX_Y_LO + Math.random() * 4;
    }
    if (x < -half) x += BOX;
    if (x > half) x -= BOX;
    if (z < -half) z += BOX;
    if (z > half) z -= BOX;

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;
  }

  if (kind !== 'rain') {
    posAttr.needsUpdate = true;
  }

  if (kind === 'rain' && rainMesh.visible) {
    const capMul = quality === 'full' ? 1 : quality === 'balanced' ? 0.82 : 0.5;
    const activeCount = Math.min(COUNT, Math.max(96, Math.floor(COUNT * (0.26 + 0.74 * strength) * capMul)));
    rainGeom.setDrawRange(0, activeCount * 6);

    const ox = camera.position.x;
    const oy = camera.position.y;
    const oz = camera.position.z;
    const baseStreak = 0.11 + strength * 0.07;
    const windFx = wind * 0.045;
    const hw = RAIN_RIBBON_HALF_W;
    const useStreakOcclusion =
      world != null &&
      quality !== 'minimal' &&
      rainEx < RAIN_OPEN_SKIP_STREAK_OCCLUSION_EXPOSURE;
    const sub = quality === 'full' ? 2 : 4;
    const lodSq = quality === 'full' ? 11 * 11 : 10 * 10;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const i12 = i * RAIN_FLOATS_PER_STREAK;
      if (i >= activeCount) {
        for (let k = 0; k < 4; k++) {
          const o = i12 + k * 3;
          rainPos[o] = HIDE_X;
          rainPos[o + 1] = HIDE_Y;
          rainPos[o + 2] = HIDE_Z;
        }
        continue;
      }

      const lx = positions[i3];
      const lz = positions[i3 + 2];
      const distSq = lx * lx + lz * lz;
      const lodT = Math.min(1, distSq / lodSq);
      const streak = baseStreak * (1 - 0.38 * lodT);

      const wx = cx + positions[i3];
      const wy = cy + positions[i3 + 1];
      const wz = cz + positions[i3 + 2];
      const ax = wx - windFx * 0.35;
      const ay = wy + streak * 0.35;
      const az = wz - windFx * 0.12;
      const bx = wx + windFx;
      const by = wy - streak;
      const bz = wz + windFx * 0.2;

      let hide = false;
      if (useStreakOcclusion && distSq <= lodSq) {
        if (sub > 1 && (i + simFrame) % sub !== 0) {
          hide = refs.rainOccludePrev[i] === 1;
        } else {
          hide = isRainStreakOccludedForQuality(world, ox, oy, oz, ax, ay, az, bx, by, bz, wx, wy, wz, quality);
          refs.rainOccludePrev[i] = hide ? 1 : 0;
        }
      }
      if (hide) {
        for (let k = 0; k < 4; k++) {
          const o = i12 + k * 3;
          rainPos[o] = HIDE_X;
          rainPos[o + 1] = HIDE_Y;
          rainPos[o + 2] = HIDE_Z;
        }
        continue;
      }
      const sx = bx - ax;
      const sy = by - ay;
      const sz = bz - az;
      const slen = Math.hypot(sx, sy, sz);
      if (slen < 1e-7) {
        for (let k = 0; k < 4; k++) {
          const o = i12 + k * 3;
          rainPos[o] = HIDE_X;
          rainPos[o + 1] = HIDE_Y;
          rainPos[o + 2] = HIDE_Z;
        }
        continue;
      }
      const sxd = sx / slen;
      const syd = sy / slen;
      const szd = sz / slen;
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;
      const mz = (az + bz) * 0.5;
      let tx = ox - mx;
      let ty = oy - my;
      let tz = oz - mz;
      const tlen = Math.hypot(tx, ty, tz);
      if (tlen < 1e-7) {
        for (let k = 0; k < 4; k++) {
          const o = i12 + k * 3;
          rainPos[o] = HIDE_X;
          rainPos[o + 1] = HIDE_Y;
          rainPos[o + 2] = HIDE_Z;
        }
        continue;
      }
      tx /= tlen;
      ty /= tlen;
      tz /= tlen;
      /* side = streak × (eye→mid), fallback if nearly parallel to view */
      let rx = syd * tz - szd * ty;
      let ry = szd * tx - sxd * tz;
      let rz = sxd * ty - syd * tx;
      let rlen = Math.hypot(rx, ry, rz);
      if (rlen < 1e-4) {
        rx = syd * 0 - szd * 1;
        ry = szd * 0 - sxd * 0;
        rz = sxd * 1 - syd * 0;
        rlen = Math.hypot(rx, ry, rz);
      }
      if (rlen < 1e-7) {
        for (let k = 0; k < 4; k++) {
          const o = i12 + k * 3;
          rainPos[o] = HIDE_X;
          rainPos[o + 1] = HIDE_Y;
          rainPos[o + 2] = HIDE_Z;
        }
        continue;
      }
      rx = (rx / rlen) * hw;
      ry = (ry / rlen) * hw;
      rz = (rz / rlen) * hw;
      /* v0 v1 at A, v2 v3 at B — two tris (0,1,2)(2,1,3) */
      rainPos[i12] = ax - rx;
      rainPos[i12 + 1] = ay - ry;
      rainPos[i12 + 2] = az - rz;
      rainPos[i12 + 3] = ax + rx;
      rainPos[i12 + 4] = ay + ry;
      rainPos[i12 + 5] = az + rz;
      rainPos[i12 + 6] = bx - rx;
      rainPos[i12 + 7] = by - ry;
      rainPos[i12 + 8] = bz - rz;
      rainPos[i12 + 9] = bx + rx;
      rainPos[i12 + 10] = by + ry;
      rainPos[i12 + 11] = bz + rz;
    }
    rainAttr.needsUpdate = true;
    refs._rainOcclusionActive = !!world;
  } else if (kind === 'rain' && !rainMesh.visible) {
    refs._rainOcclusionActive = false;
    rainGeom.setDrawRange(0, Infinity);
  } else if (refs._rainOcclusionActive) {
    refs._rainOcclusionActive = false;
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {ReturnType<typeof createWeatherParticles>} refs
 */
export function disposeWeatherParticles(scene, refs) {
  scene.remove(refs.points);
  scene.remove(refs.rainMesh);
  refs.geom.dispose();
  refs.mat.dispose();
  refs.rainGeom.dispose();
  refs.rainMat.dispose();
}
