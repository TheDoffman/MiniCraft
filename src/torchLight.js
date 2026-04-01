/**
 * Manages point lights for torches and surface lava near the player.
 * Scans world blocks in a radius and places up to MAX_LIGHTS PointLights.
 */
import * as THREE from 'three';
import { BlockId } from './blocktypes.js';
import { effectiveTorchAttach, torchLightOffset } from './torchAttach.js';

const MAX_LIGHTS = 16;
const SCAN_RADIUS = 24;
const UPDATE_INTERVAL = 0.5;

/** Top of open lava column (one light per column, not per block in the stack). */
function isSurfaceLava(world, bx, by, bz) {
  if (world.get(bx, by, bz) !== BlockId.LAVA) return false;
  if (by + 1 >= world.height) return true;
  return world.get(bx, by + 1, bz) !== BlockId.LAVA;
}

const LAVA_LIGHT_COLOR = 0xff5520;
const LAVA_LIGHT_INTENSITY = 1.55;
const LAVA_LIGHT_DISTANCE = 14;
const LAVA_LIGHT_DECAY = 2;
/** Fluid top matches mesher WATER_TOP_INSET (~0.9375). */
const LAVA_LIGHT_Y = 1 - 1 / 16;

/** @type {THREE.PointLight[]} */
const pool = [];
let timer = 0;

export function initTorchLights(scene) {
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const light = new THREE.PointLight(0xffcc44, 0, 10, 2);
    light.visible = false;
    scene.add(light);
    pool.push(light);
  }
}

/**
 * Torches near the player, nearest first (deduped).
 * @param {import('./world.js').World} world
 * @param {{ x: number, y: number, z: number }} player
 * @returns {{ x: number, y: number, z: number, dist: number }[]}
 */
export function gatherNearbyTorches(world, player) {
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  const pz = Math.floor(player.z);
  const R = SCAN_RADIUS;
  const h = world.height;
  const seen = new Set();
  /** @type {{ x: number, y: number, z: number, dist: number }[]} */
  const torches = [];

  const pushTorch = (bx, by, bz, dist) => {
    const k = `${bx},${by},${bz}`;
    if (seen.has(k)) return;
    seen.add(k);
    torches.push({ x: bx, y: by, z: bz, dist });
  };

  for (let dx = -R; dx <= R; dx += 2) {
    for (let dz = -R; dz <= R; dz += 2) {
      if (dx * dx + dz * dz > R * R) continue;
      const bx = px + dx;
      const bz = pz + dz;
      const yMin = Math.max(0, py - 12);
      const yMax = Math.min(h - 1, py + 12);
      for (let by = yMin; by <= yMax; by++) {
        if (world.get(bx, by, bz) === BlockId.TORCH) {
          const dist = dx * dx + (by - py) * (by - py) + dz * dz;
          pushTorch(bx, by, bz, dist);
        }
      }
    }
  }

  const closeR = Math.min(R, 10);
  for (let dx = -closeR; dx <= closeR; dx++) {
    for (let dz = -closeR; dz <= closeR; dz++) {
      if ((dx & 1) === 0 && (dz & 1) === 0) continue;
      if (dx * dx + dz * dz > closeR * closeR) continue;
      const bx = px + dx;
      const bz = pz + dz;
      const yMin = Math.max(0, py - 8);
      const yMax = Math.min(h - 1, py + 8);
      for (let by = yMin; by <= yMax; by++) {
        if (world.get(bx, by, bz) === BlockId.TORCH) {
          const dist = dx * dx + (by - py) * (by - py) + dz * dz;
          pushTorch(bx, by, bz, dist);
        }
      }
    }
  }

  torches.sort((a, b) => a.dist - b.dist);
  return torches;
}

/**
 * Torches + top-of-column lava, nearest first (deduped by block cell).
 * @param {import('./world.js').World} world
 * @param {{ x: number, y: number, z: number }} player
 * @returns {{ x: number, y: number, z: number, dist: number, kind: 'torch' | 'lava' }[]}
 */
function gatherNearbyPointLightSources(world, player) {
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  const pz = Math.floor(player.z);
  const R = SCAN_RADIUS;
  const h = world.height;
  const seen = new Set();
  /** @type {{ x: number, y: number, z: number, dist: number, kind: 'torch' | 'lava' }[]} */
  const sources = [];

  const push = (bx, by, bz, dist, kind) => {
    const k = `${bx},${by},${bz}`;
    if (seen.has(k)) return;
    seen.add(k);
    sources.push({ x: bx, y: by, z: bz, dist, kind });
  };

  for (let dx = -R; dx <= R; dx += 2) {
    for (let dz = -R; dz <= R; dz += 2) {
      if (dx * dx + dz * dz > R * R) continue;
      const bx = px + dx;
      const bz = pz + dz;
      const yMin = Math.max(0, py - 12);
      const yMax = Math.min(h - 1, py + 12);
      for (let by = yMin; by <= yMax; by++) {
        const dist = dx * dx + (by - py) * (by - py) + dz * dz;
        const id = world.get(bx, by, bz);
        if (id === BlockId.TORCH) push(bx, by, bz, dist, 'torch');
        else if (isSurfaceLava(world, bx, by, bz)) push(bx, by, bz, dist, 'lava');
      }
    }
  }

  const closeR = Math.min(R, 10);
  for (let dx = -closeR; dx <= closeR; dx++) {
    for (let dz = -closeR; dz <= closeR; dz++) {
      if ((dx & 1) === 0 && (dz & 1) === 0) continue;
      if (dx * dx + dz * dz > closeR * closeR) continue;
      const bx = px + dx;
      const bz = pz + dz;
      const yMin = Math.max(0, py - 8);
      const yMax = Math.min(h - 1, py + 8);
      for (let by = yMin; by <= yMax; by++) {
        const dist = dx * dx + (by - py) * (by - py) + dz * dz;
        const id = world.get(bx, by, bz);
        if (id === BlockId.TORCH) push(bx, by, bz, dist, 'torch');
        else if (isSurfaceLava(world, bx, by, bz)) push(bx, by, bz, dist, 'lava');
      }
    }
  }

  sources.sort((a, b) => a.dist - b.dist);
  return sources;
}

/**
 * @param {import('./world.js').World} world
 * @param {{ x: number, y: number, z: number }} player
 * @param {number} [maxLights] cap active point lights (pool remains {@link MAX_LIGHTS}).
 */
export function updateTorchLights(world, player, dt, maxLights = MAX_LIGHTS) {
  timer += dt;
  if (timer < UPDATE_INTERVAL) return;
  timer = 0;

  const sources = gatherNearbyPointLightSources(world, player);
  const cap = Math.max(1, Math.min(MAX_LIGHTS, Math.floor(maxLights)));

  for (let i = 0; i < MAX_LIGHTS; i++) {
    const light = pool[i];
    if (i < cap && i < sources.length) {
      const s = sources[i];
      if (s.kind === 'torch') {
        const att = effectiveTorchAttach(world, s.x, s.y, s.z);
        const off = torchLightOffset(att);
        light.position.set(s.x + off.ox, s.y + off.oy, s.z + off.oz);
        light.color.setHex(0xffcc44);
        light.intensity = 1.2;
        light.distance = 10;
        light.decay = 2;
      } else {
        light.position.set(s.x + 0.5, s.y + LAVA_LIGHT_Y, s.z + 0.5);
        light.color.setHex(LAVA_LIGHT_COLOR);
        light.intensity = LAVA_LIGHT_INTENSITY;
        light.distance = LAVA_LIGHT_DISTANCE;
        light.decay = LAVA_LIGHT_DECAY;
      }
      light.visible = true;
    } else {
      light.visible = false;
      light.intensity = 0;
    }
  }
}

export function disposeTorchLights(scene) {
  for (const light of pool) {
    scene.remove(light);
    light.dispose();
  }
  pool.length = 0;
}
