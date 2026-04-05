/**
 * Slow drifting dust motes underground (follows camera; strength from cave light fade).
 */
import * as THREE from 'three';

const N = 420;
const HALF = 11;
const Y_LO = -5;
const Y_HI = 9;

/** @type {THREE.Points | null} */
let points = null;
/** @type {THREE.CanvasTexture | null} */
let spriteTex = null;

/** @type {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, t: number }[]} */
const parts = [];

function softDustTexture() {
  const s = 28;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(220,200,170,0.55)');
  g.addColorStop(0.45, 'rgba(180,160,130,0.22)');
  g.addColorStop(1, 'rgba(140,120,95,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {THREE.Scene} scene
 */
export function initCaveDustParticles(scene) {
  for (let i = 0; i < N; i++) {
    parts.push({
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      t: Math.random() * 1000,
    });
  }

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  spriteTex = softDustTexture();
  const mat = new THREE.PointsMaterial({
    map: spriteTex ?? undefined,
    size: 0.09,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    vertexColors: true,
    sizeAttenuation: true,
  });

  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  points.name = 'caveDustParticles';
  scene.add(points);
}

/**
 * @param {{ x: number, y: number, z: number, eyeHeight: number, inWater?: boolean }} player
 * @param {number} dt
 * @param {number} intensity 0 = surface daylight cave factor, 1 = deep cave
 * @param {boolean} enabled
 */
export function updateCaveDustParticles(player, dt, intensity, enabled) {
  if (!points) return;

  const mat = points.material;
  if (!(mat instanceof THREE.PointsMaterial)) return;

  const k = THREE.MathUtils.clamp(intensity, 0, 1);
  const active = enabled && k > 0.04;
  points.visible = active;
  if (!active) return;

  mat.opacity = 0.22 + k * 0.38;

  const px = player.x;
  const py = player.y + player.eyeHeight * 0.35;
  const pz = player.z;

  const posAttr = points.geometry.getAttribute('position');
  const colAttr = points.geometry.getAttribute('color');
  const posArr = /** @type {Float32Array} */ (posAttr.array);
  const colArr = /** @type {Float32Array} */ (colAttr.array);

  const drag = Math.exp(-dt * 1.1);

  for (let i = 0; i < N; i++) {
    const p = parts[i];
    p.t += dt * (0.35 + k * 0.5);

    if (p.y < -900) {
      p.x = px + (Math.random() - 0.5) * HALF * 2;
      p.y = py + Y_LO + Math.random() * (Y_HI - Y_LO);
      p.z = pz + (Math.random() - 0.5) * HALF * 2;
      p.vx = (Math.random() - 0.5) * 0.06;
      p.vy = (Math.random() - 0.5) * 0.02;
      p.vz = (Math.random() - 0.5) * 0.06;
    }

    /* Gentle curl + rise (warm air in caves). */
    const nx = Math.sin(p.t * 0.7 + i * 0.13) * 0.018;
    const nz = Math.cos(p.t * 0.55 + i * 0.09) * 0.018;
    p.vx = p.vx * drag + nx * dt * 14;
    p.vy = p.vy * drag + (0.012 + k * 0.018) * dt;
    p.vz = p.vz * drag + nz * dt * 14;

    p.x += p.vx;
    p.y += p.vy;
    p.z += p.vz;

    /* Recentre if player moved away. */
    if (Math.abs(p.x - px) > HALF || Math.abs(p.z - pz) > HALF || p.y > py + Y_HI + 2 || p.y < py + Y_LO - 3) {
      p.y = -999;
    }

    const j = i * 3;
    posArr[j] = p.x;
    posArr[j + 1] = p.y;
    posArr[j + 2] = p.z;

    const flicker = 0.72 + 0.28 * Math.sin(p.t * 2.1 + i);
    const dim = 0.45 + k * 0.5;
    colArr[j] = (0.55 + flicker * 0.2) * dim;
    colArr[j + 1] = (0.48 + flicker * 0.15) * dim;
    colArr[j + 2] = (0.38 + flicker * 0.1) * dim;
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  points.position.set(0, 0, 0);
}

/**
 * @param {THREE.Scene} scene
 */
export function disposeCaveDustParticles(scene) {
  if (points) {
    scene.remove(points);
    points.geometry.dispose();
    const m = points.material;
    if (m instanceof THREE.Material) m.dispose();
    points = null;
  }
  if (spriteTex) {
    spriteTex.dispose();
    spriteTex = null;
  }
  parts.length = 0;
}
