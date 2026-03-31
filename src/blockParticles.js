import * as THREE from 'three';
import { BLOCKS, TILE_PX, ATLAS_TILES } from './blocktypes.js';

const GRAVITY = 24;
const PARTICLE_COUNT = 36;
const ATLAS_SIZE = ATLAS_TILES * TILE_PX;
const POINT_SIZE = 0.14;

/** @type {THREE.Texture | null} */
let atlasTexture = null;

/** @type {THREE.WebGLRenderer | null} */
let rendererRef = null;

export function setBlockParticleAtlasTexture(tex) {
  atlasTexture = tex;
}

export function setBlockParticleRenderer(renderer) {
  rendererRef = renderer;
}

function pickRandomTile(blockId) {
  const def = BLOCKS[blockId];
  if (!def) return [0, 0];
  const tiles = [def.top];
  const add = (t) => {
    if (!tiles.some((o) => o[0] === t[0] && o[1] === t[1])) tiles.push(t);
  };
  add(def.bottom);
  add(def.side);
  return tiles[Math.floor(Math.random() * tiles.length)];
}

/**
 * Random sub-rect inside tile → normalized atlas UV (uMin, vMin, uSpan, vSpan).
 * v matches mesher / CanvasTexture flipY sampling.
 */
function randomSubRectUv(tx, ty) {
  const spanMax = Math.min(8, Math.max(3, Math.floor(TILE_PX / 2)));
  const spanMin = Math.max(2, Math.floor(TILE_PX / 8));
  const sw = spanMin + Math.floor(Math.random() * (spanMax - spanMin + 1));
  const sh = spanMin + Math.floor(Math.random() * (spanMax - spanMin + 1));
  const px = Math.floor(Math.random() * (TILE_PX - sw + 1));
  const py = Math.floor(Math.random() * (TILE_PX - sh + 1));

  const uMin = (tx * TILE_PX + px) / ATLAS_SIZE;
  const uSpan = sw / ATLAS_SIZE;

  const vTopEdge = 1 - (ty * TILE_PX + py) / ATLAS_SIZE;
  const vBotEdge = 1 - (ty * TILE_PX + py + sh) / ATLAS_SIZE;
  const vMin = vBotEdge;
  const vSpan = vTopEdge - vBotEdge;

  return [uMin, vMin, uSpan, vSpan];
}

function makeBurstMaterial() {
  if (!atlasTexture) {
    throw new Error('setBlockParticleAtlasTexture must be called first');
  }

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.points]);
  uniforms.map.value = atlasTexture;
  uniforms.size.value = POINT_SIZE;
  uniforms.opacity.value = 1;
  uniforms.diffuse.value.set(0xffffff);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    defines: { USE_SIZEATTENUATION: 1 },
    vertexShader: /* glsl */ `
uniform float size;
uniform float scale;

in vec4 uvRect;
out vec4 vUvRect;

#include <common>
#include <color_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {
  vUvRect = uvRect;

  #include <color_vertex>
  #include <morphinstance_vertex>
  #include <morphcolor_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <project_vertex>

  gl_PointSize = size;

  #ifdef USE_SIZEATTENUATION
    bool isPerspective = isPerspectiveMatrix( projectionMatrix );
    if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
  #endif

  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  #include <worldpos_vertex>
}
`,
    fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

uniform sampler2D map;
uniform float opacity;
in vec4 vUvRect;
out vec4 fragColor;

void main() {
  vec2 uv = vUvRect.xy + gl_PointCoord * vUvRect.zw;
  vec4 texel = texture( map, uv );
  if ( texel.a < 0.32 ) discard;
  fragColor = vec4( texel.rgb, texel.a * opacity );
  #include <logdepthbuf_fragment>
  #include <clipping_planes_fragment>
}
`,
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  return mat;
}

/** @type {Array<{ points: THREE.Points; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial; vels: {vx:number;vy:number;vz:number}[]; life: number; maxLife: number }>} */
const bursts = [];

function updateScaleUniform() {
  const r = rendererRef;
  if (!r) return;
  const h = r.domElement.height;
  const pr = r.getPixelRatio();
  const scale = h * pr * 0.5;
  for (const b of bursts) {
    b.mat.uniforms.scale.value = scale;
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {number} blockId
 */
export function addBlockBreakBurst(scene, bx, by, bz, blockId) {
  if (!atlasTexture) return;

  const cx = bx + 0.5;
  const cy = by + 0.5;
  const cz = bz + 0.5;

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const uvRects = new Float32Array(PARTICLE_COUNT * 4);
  /** @type {{vx:number;vy:number;vz:number}[]} */
  const vels = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = cx + (Math.random() - 0.5) * 0.9;
    positions[i * 3 + 1] = cy + (Math.random() - 0.5) * 0.9;
    positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 0.9;

    const [tx, ty] = pickRandomTile(blockId);
    const rect = randomSubRectUv(tx, ty);
    uvRects[i * 4] = rect[0];
    uvRects[i * 4 + 1] = rect[1];
    uvRects[i * 4 + 2] = rect[2];
    uvRects[i * 4 + 3] = rect[3];

    const speed = 2.2 + Math.random() * 3.2;
    const u = Math.random();
    const v = Math.random();
    const th = u * Math.PI * 2;
    const ph = Math.acos(2 * v - 1);
    const sx = Math.sin(ph) * Math.cos(th);
    const sy = Math.abs(Math.cos(ph)) * 0.55 + 0.45;
    const sz = Math.sin(ph) * Math.sin(th);
    vels.push({
      vx: sx * speed,
      vy: sy * speed * 1.1 + 1.2,
      vz: sz * speed,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uvRect', new THREE.BufferAttribute(uvRects, 4));

  const mat = makeBurstMaterial();
  if (rendererRef) {
    mat.uniforms.scale.value = rendererRef.domElement.height * rendererRef.getPixelRatio() * 0.5;
  }

  const points = new THREE.Points(geo, mat);
  points.renderOrder = 2;
  points.frustumCulled = false;
  scene.add(points);

  bursts.push({
    points,
    geo,
    mat,
    vels,
    life: 0,
    maxLife: 0.48 + Math.random() * 0.2,
  });
}

export function updateBlockBreakParticles(dt) {
  updateScaleUniform();

  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life += dt;
    const pos = b.geo.attributes.position.array;
    const n = b.vels.length;
    for (let j = 0; j < n; j++) {
      b.vels[j].vy -= GRAVITY * dt;
      pos[j * 3] += b.vels[j].vx * dt;
      pos[j * 3 + 1] += b.vels[j].vy * dt;
      pos[j * 3 + 2] += b.vels[j].vz * dt;
    }
    b.geo.attributes.position.needsUpdate = true;
    const t = b.life / b.maxLife;
    b.mat.uniforms.opacity.value = Math.max(0, 1 - t * t);

    if (b.life >= b.maxLife) {
      b.points.removeFromParent();
      b.geo.dispose();
      b.mat.dispose();
      bursts.splice(i, 1);
    }
  }
}

/**
 * @param {THREE.Scene} scene
 */
export function disposeAllBlockParticles(scene) {
  while (bursts.length) {
    const b = bursts.pop();
    scene.remove(b.points);
    b.geo.dispose();
    b.mat.dispose();
  }
}
