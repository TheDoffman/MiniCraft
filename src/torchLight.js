/**
 * Manages point lights for placed torches near the player.
 * Scans world blocks in a radius and places up to MAX_LIGHTS PointLights.
 */
import * as THREE from 'three';
import { BlockId } from './blocktypes.js';
import { effectiveTorchAttach, torchLightOffset } from './torchAttach.js';

const MAX_LIGHTS = 16;
const SCAN_RADIUS = 24;
const UPDATE_INTERVAL = 0.5;

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
 * @param {import('./world.js').World} world
 * @param {{ x: number, y: number, z: number }} player
 * @param {number} [maxLights] cap active point lights (pool remains {@link MAX_LIGHTS}).
 */
export function updateTorchLights(world, player, dt, maxLights = MAX_LIGHTS) {
  timer += dt;
  if (timer < UPDATE_INTERVAL) return;
  timer = 0;

  const torches = gatherNearbyTorches(world, player);
  const cap = Math.max(1, Math.min(MAX_LIGHTS, Math.floor(maxLights)));

  for (let i = 0; i < MAX_LIGHTS; i++) {
    const light = pool[i];
    if (i < cap && i < torches.length) {
      const t = torches[i];
      const att = effectiveTorchAttach(world, t.x, t.y, t.z);
      const off = torchLightOffset(att);
      light.position.set(t.x + off.ox, t.y + off.oy, t.z + off.oz);
      light.intensity = 1.2;
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
