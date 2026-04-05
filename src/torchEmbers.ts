/**
 * Rising ember sparks above torch flames (nearby torches only).
 */
import * as THREE from 'three';
import { gatherNearbyTorches } from './torchLight';
import { effectiveTorchAttach, torchLightOffset } from './torchAttach';

const EMBER_TORCH_CAP = 24;
const EMBERS_PER_TORCH = 8;
const TOTAL = EMBER_TORCH_CAP * EMBERS_PER_TORCH;

/** @type {THREE.Points | null} */
let points = null;
/** @type {{ life: number, x: number, y: number, z: number, vx: number, vy: number, vz: number }[]} */
const parts = [];

function softSpriteTexture() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,240,200,0.65)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _flameWorldScratch = { x: 0, y: 0, z: 0 };

function flameWorldPos(world, tx, ty, tz) {
  const att = effectiveTorchAttach(world, tx, ty, tz);
  const off = torchLightOffset(att);
  _flameWorldScratch.x = tx + off.ox;
  _flameWorldScratch.y = ty + off.oy + 0.08;
  _flameWorldScratch.z = tz + off.oz;
  return _flameWorldScratch;
}

function respawn(p, fx, fy, fz) {
  p.x = fx + (Math.random() - 0.5) * 0.14;
  p.y = fy + Math.random() * 0.06;
  p.z = fz + (Math.random() - 0.5) * 0.14;
  p.vx = (Math.random() - 0.5) * 0.42;
  p.vy = 0.38 + Math.random() * 0.62;
  p.vz = (Math.random() - 0.5) * 0.42;
  p.life = 0.35 + Math.random() * 0.55;
}

/**
 * @param {THREE.Scene} scene
 */
export function initTorchEmbers(scene) {
  for (let i = 0; i < TOTAL; i++) {
    parts.push({ life: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0 });
  }

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(TOTAL * 3);
  const col = new Float32Array(TOTAL * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const map = softSpriteTexture();
  const mat = new THREE.PointsMaterial({
    map: map ?? undefined,
    size: 0.11,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
  });

  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  scene.add(points);
}

/**
 * @param {import('./world.js').World} world
 * @param {{ x: number, y: number, z: number }} player
 * @param {number} dt
 * @param {number} [maxTorchCap] align ember sources with torch light budget.
 */
export function updateTorchEmbers(world, player, dt, maxTorchCap = EMBER_TORCH_CAP) {
  if (!points) return;

  const cap = Math.min(EMBER_TORCH_CAP, Math.max(1, Math.floor(maxTorchCap)));
  const torches = gatherNearbyTorches(world, player).slice(0, cap);
  const posAttr = points.geometry.getAttribute('position');
  const colAttr = points.geometry.getAttribute('color');
  const posArr = /** @type {Float32Array} */ (posAttr.array);
  const colArr = /** @type {Float32Array} */ (colAttr.array);

  if (torches.length === 0) {
    points.visible = false;
    return;
  }
  points.visible = true;

  const drag = Math.exp(-dt * 2.4);

  for (let i = 0; i < TOTAL; i++) {
    const p = parts[i];
    const t = torches[i % torches.length];
    const f = flameWorldPos(world, t.x, t.y, t.z);

    if (p.life <= 0) {
      respawn(p, f.x, f.y, f.z);
    } else {
      p.life -= dt * 1.05;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= drag;
      p.vz *= drag;
      p.vy += dt * 0.22;
      if (p.life <= 0) {
        respawn(p, f.x, f.y, f.z);
      }
    }

    const k = i * 3;
    posArr[k] = p.x;
    posArr[k + 1] = p.y;
    posArr[k + 2] = p.z;

    const a = Math.max(0, Math.min(1, p.life * 1.6));
    const hot = 0.55 + 0.45 * a;
    colArr[k] = 1;
    colArr[k + 1] = 0.35 + 0.45 * hot;
    colArr[k + 2] = 0.08 + 0.12 * a;
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}

/**
 * @param {THREE.Scene} scene
 */
export function disposeTorchEmbers(scene) {
  if (!points) return;
  scene.remove(points);
  const map = points.material.map;
  if (map) map.dispose();
  points.geometry.dispose();
  points.material.dispose();
  points = null;
  parts.length = 0;
}
