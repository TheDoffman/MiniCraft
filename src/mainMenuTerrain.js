import * as THREE from 'three';
import { World } from './world.js';
import { buildRegionMesh } from './mesher.js';
import { CHUNK_XZ, regionForChunk } from './chunks.js';

/**
 * Single fixed world seed for the title WebGL backdrop only (not the play/new-world seed field).
 * Seed 5 keeps biomeParam > 0.82 (TUNDRA) across the whole visible patch:
 *   sin(5×0.31)≈1.0 and sin(5×0.52)≈0.52 → b≈1.08 clamped to 1.0 at the origin.
 */
const TITLE_BACKDROP_SEED = 5;

/**
 * Full-screen title backdrop: procedural chunks (hills + trees) with a slow orbit camera.
 * Uses cloned materials so the main game can dispose its own copies independently.
 *
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {HTMLElement} o.startEl
 * @param {number} o.worldHeight
 * @param {THREE.Material} o.worldMatTemplate
 * @param {THREE.Material} o.cutoutMatTemplate
 * @param {THREE.Material} o.waterMatTemplate
 * @param {THREE.Material} [o.lavaMatTemplate]
 */
export function initMainMenuTerrain(o) {
  const menuWorldMat = o.worldMatTemplate.clone();
  const menuCutoutMat = o.cutoutMatTemplate.clone();
  const menuWaterMat = o.waterMatTemplate.clone();
  const menuLavaMat = o.lavaMatTemplate?.clone() ?? o.waterMatTemplate.clone();

  /** Chunk radius from origin (inclusive): (2*R+1)² chunks — larger patch hides streaming edges. */
  const R = 3;

  let rafId = 0;
  let terrainBuilt = false;
  let orbit = 0;
  let lastFrame = performance.now();
  /** Camera and look-at Y derived from generated terrain so we stay above ground (not under it). */
  let orbitEyeY = 38;
  let orbitTargetY = 24;

  const renderer = new THREE.WebGLRenderer({
    canvas: o.canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  /* Tundra palette: cold steel-blue sky, light drifting haze. */
  const horizonCol = new THREE.Color(0x8aafc4);
  scene.background = horizonCol.clone();
  scene.fog = new THREE.FogExp2(horizonCol, 0.024);

  /* Far must exceed sky sphere radius or the shell is clipped (looks like void again). */
  const camera = new THREE.PerspectiveCamera(44, 1, 0.12, 520);

  /** Inner sky shell: past chunk edges you see this instead of a hard empty frustum. */
  const skyGeo = new THREE.SphereGeometry(420, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0x7aa0b8,   // deeper cold blue at the zenith
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.renderOrder = -1000;
  skyMesh.position.set(8, 24, 8);
  scene.add(skyMesh);

  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);

  /* Tundra lighting: cool pale-blue hemisphere, low wintry sun. */
  const hemi = new THREE.HemisphereLight(0xc8daea, 0x2a3840, 0.9);
  const sun  = new THREE.DirectionalLight(0xeef4ff, 0.55);
  sun.position.set(80, 55, 20);   // low winter sun angle
  scene.add(hemi, sun);

  const _target = new THREE.Vector3();

  function sizeCanvas() {
    const rect = o.startEl.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (o.canvas.width !== w || o.canvas.height !== h) {
      o.canvas.width = w;
      o.canvas.height = h;
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function disposeTerrainMeshes() {
    for (const m of terrainGroup.children) {
      if (m instanceof THREE.Mesh && m.geometry) m.geometry.dispose();
    }
    terrainGroup.clear();
  }

  /** Highest solid surface in the meshed region (includes tree canopies). */
  function sampleMaxSurfaceY(world) {
    let maxY = 16;
    const lo = -R * CHUNK_XZ + 2;
    const hi = R * CHUNK_XZ - 2;
    const step = 6;
    for (let x = lo; x <= hi; x += step) {
      for (let z = lo; z <= hi; z += step) {
        const t = world.topSolidY(x, z);
        if (t > maxY) maxY = t;
      }
    }
    return maxY;
  }

  function buildTerrain(seed) {
    disposeTerrainMeshes();
    const w = new World(o.worldHeight, seed);
    const midY = Math.min(125, o.worldHeight - 4);
    for (let cz = -R; cz <= R; cz++) {
      for (let cx = -R; cx <= R; cx++) {
        w.get(cx * CHUNK_XZ + 3, midY, cz * CHUNK_XZ + 3);
      }
    }

    const topSolid = sampleMaxSurfaceY(w);
    /* Tight orbit over center; aim slightly down across nearby terrain. */
    orbitTargetY = topSolid - 0.5;
    orbitEyeY = topSolid + 5;
    skyMesh.position.set(8, topSolid + 2, 8);

    for (let cz = -R; cz <= R; cz++) {
      for (let cx = -R; cx <= R; cx++) {
        const reg = regionForChunk(cx, cz);
        const { opaque, cutout, water, lava } = buildRegionMesh(
          w,
          reg.x0,
          reg.x1,
          reg.z0,
          reg.z1,
        );
        const tieBreak = ((cx * 311 + cz * 173) & 0x1ff) * 1e-4;
        const mo = new THREE.Mesh(opaque, menuWorldMat);
        mo.castShadow = false;
        mo.receiveShadow = false;
        const mc = new THREE.Mesh(cutout, menuCutoutMat);
        mc.castShadow = false;
        mc.receiveShadow = false;
        mc.renderOrder = 1 + tieBreak;
        const mw = new THREE.Mesh(water, menuWaterMat);
        mw.castShadow = false;
        mw.receiveShadow = false;
        mw.renderOrder = 1 + tieBreak + 0.02;
        const ml = new THREE.Mesh(lava, menuLavaMat);
        ml.castShadow = false;
        ml.receiveShadow = false;
        ml.renderOrder = 1 + tieBreak + 0.035;
        terrainGroup.add(mo, mc, mw, ml);
      }
    }
  }

  function syncCamera() {
    const focusX = 8;
    const focusZ = 8;
    const rad = 10;
    const x = focusX + Math.cos(orbit) * rad;
    const z = focusZ + Math.sin(orbit) * rad;
    camera.position.set(x, orbitEyeY, z);
    _target.set(focusX, orbitTargetY, focusZ);
    camera.lookAt(_target);
  }

  function tick(now) {
    if (o.startEl.classList.contains('hidden')) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    orbit += dt * 0.07;
    sizeCanvas();
    syncCamera();
    renderer.render(scene, camera);
  }

  function startIfVisible() {
    if (o.startEl.classList.contains('hidden')) return;
    lastFrame = performance.now();
    if (!terrainBuilt) {
      buildTerrain(TITLE_BACKDROP_SEED);
      terrainBuilt = true;
    }
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  const mo = new MutationObserver(() => {
    if (o.startEl.classList.contains('hidden')) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else {
      startIfVisible();
    }
  });
  mo.observe(o.startEl, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('resize', () => {
    if (!o.startEl.classList.contains('hidden')) sizeCanvas();
  });

  startIfVisible();

  return {
    /** After the block atlas PNG replaces the placeholder. */
    syncAtlas(/** @type {THREE.Texture} */ tex) {
      menuWorldMat.map = tex;
      menuCutoutMat.map = tex;
      menuWaterMat.map = tex;
      menuLavaMat.map = tex;
      menuWorldMat.needsUpdate = true;
      menuCutoutMat.needsUpdate = true;
      menuWaterMat.needsUpdate = true;
      menuLavaMat.needsUpdate = true;
    },
    dispose() {
      cancelAnimationFrame(rafId);
      rafId = 0;
      mo.disconnect();
      disposeTerrainMeshes();
      terrainBuilt = false;
      scene.remove(skyMesh);
      skyGeo.dispose();
      skyMat.dispose();
      menuWorldMat.dispose();
      menuCutoutMat.dispose();
      menuWaterMat.dispose();
      menuLavaMat.dispose();
      renderer.dispose();
    },
  };
}
