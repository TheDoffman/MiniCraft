import * as THREE from 'three';
import { BLOCKS, TILE_PX, ATLAS_TILES, TOOL_INFO } from './blocktypes.js';
import { buildFirstPersonArmMaterialSet } from './playerTextures.js';

const ATLAS_SIZE = ATLAS_TILES * TILE_PX;

/** Same vertical scale as `playerModel` (32px Steve stack → 1.74m). */
const PLAYER_H = 1.74;

function uvCorners(tx, ty) {
  const u0 = (tx * TILE_PX) / ATLAS_SIZE;
  const u1 = ((tx + 1) * TILE_PX) / ATLAS_SIZE;
  const vTop = 1 - (ty * TILE_PX) / ATLAS_SIZE;
  const vBot = 1 - ((ty + 1) * TILE_PX) / ATLAS_SIZE;
  return {
    bl: [u0, vBot],
    br: [u1, vBot],
    tl: [u0, vTop],
    tr: [u1, vTop],
  };
}

/** @type {Map<number, THREE.BufferGeometry>} */
const heldGeometryCache = new Map();

/**
 * @param {number} blockId
 */
function buildHeldBlockGeometry(blockId) {
  const def = BLOCKS[blockId];
  const s = 0.1;
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  let b = 0;

  /**
   * @param {number} nx
   * @param {number} ny
   * @param {number} nz
   * @param {[number,number,number][]} corners
   * @param {[number, number]} tile
   * @param {[number, number][]} uv4
   */
  function quad(nx, ny, nz, corners, tile, uv4) {
    const c = uvCorners(tile[0], tile[1]);
    const map = [c.bl, c.tl, c.tr, c.br];
    for (let i = 0; i < 4; i++) {
      const [x, y, z] = corners[i];
      pos.push(x * s, y * s, z * s);
      nrm.push(nx, ny, nz);
      const [uu, vv] = uv4[i] ?? map[i];
      uv.push(uu, vv);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    b += 4;
  }

  quad(1, 0, 0, [
    [1, -1, -1],
    [1, 1, -1],
    [1, 1, 1],
    [1, -1, 1],
  ], def.side, []);
  {
    const cx = uvCorners(def.side[0], def.side[1]);
    quad(-1, 0, 0, [
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, -1],
    ], def.side, [cx.br, cx.tr, cx.tl, cx.bl]);
  }
  quad(0, 1, 0, [
    [-1, 1, -1],
    [-1, 1, 1],
    [1, 1, 1],
    [1, 1, -1],
  ], def.top, []);
  const cb = uvCorners(def.bottom[0], def.bottom[1]);
  quad(0, -1, 0, [
    [-1, -1, -1],
    [1, -1, -1],
    [1, -1, 1],
    [-1, -1, 1],
  ], def.bottom, [cb.bl, cb.br, cb.tr, cb.tl]);
  const cs = uvCorners(def.side[0], def.side[1]);
  quad(0, 0, 1, [
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
    [-1, -1, 1],
  ], def.side, [cs.br, cs.tr, cs.tl, cs.bl]);
  quad(0, 0, -1, [
    [-1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [1, -1, -1],
  ], def.side, []);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Build a flat textured quad for non-tool items (food, armor, etc.) held in hand.
 */
function buildHeldItemGeometry(blockId) {
  const def = BLOCKS[blockId];
  const tile = def.top;
  const c = uvCorners(tile[0], tile[1]);
  const s = 0.1;
  const pos = new Float32Array([
    -s, -s, 0,
     s, -s, 0,
     s,  s, 0,
    -s,  s, 0,
  ]);
  const nrm = new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1]);
  const uv = new Float32Array([
    c.bl[0], c.bl[1],
    c.br[0], c.br[1],
    c.tr[0], c.tr[1],
    c.tl[0], c.tl[1],
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Build a proper 3D model for a held tool (pickaxe, axe, shovel, sword).
 * Coordinates are in normalized space [-1, 1] and scaled by s=0.1.
 * Y-axis: handle at bottom (y=-1), head/blade at top (y=+1).
 * The full atlas tile is mapped onto every face; transparent pixels are
 * cut by alphaTest so only the coloured tool pixels render.
 */
function buildHeldToolGeometry(blockId) {
  const def = BLOCKS[blockId];
  const tile = def.top;
  const s = 0.1;
  const c = uvCorners(tile[0], tile[1]);

  const posArr = [];
  const nrmArr = [];
  const uvArr  = [];
  const idxArr = [];
  let vi = 0;

  function quad(nx, ny, nz, p0, p1, p2, p3, uv0, uv1, uv2, uv3) {
    posArr.push(
      p0[0]*s, p0[1]*s, p0[2]*s,
      p1[0]*s, p1[1]*s, p1[2]*s,
      p2[0]*s, p2[1]*s, p2[2]*s,
      p3[0]*s, p3[1]*s, p3[2]*s,
    );
    nrmArr.push(nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz);
    uvArr.push(uv0[0],uv0[1], uv1[0],uv1[1], uv2[0],uv2[1], uv3[0],uv3[1]);
    idxArr.push(vi, vi+1, vi+2,  vi, vi+2, vi+3);
    vi += 4;
  }

  /** Push all 6 faces of an axis-aligned box. */
  function box(x0, y0, z0, x1, y1, z1) {
    // +X
    quad( 1,0,0, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],  c.bl,c.tl,c.tr,c.br);
    // -X
    quad(-1,0,0, [x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0],  c.br,c.tr,c.tl,c.bl);
    // +Y (top)
    quad(0, 1,0, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],  c.tl,c.bl,c.br,c.tr);
    // -Y (bottom)
    quad(0,-1,0, [x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0],  c.bl,c.br,c.tr,c.tl);
    // +Z (front — most visible face; sprite displayed correctly here)
    quad(0,0, 1, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],  c.bl,c.br,c.tr,c.tl);
    // -Z (back)
    quad(0,0,-1, [x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],  c.br,c.bl,c.tl,c.tr);
  }

  const type = TOOL_INFO[blockId]?.type;

  if (type === 'sword') {
    // Grip / handle — slightly wider than blade
    box(-0.13, -1.00, -0.07,  0.13, -0.22, 0.07);
    // Cross-guard — wide, short, slightly proud of blade
    box(-0.58, -0.34, -0.065, 0.58, -0.10, 0.065);
    // Blade — thin, runs from guard to tip
    box(-0.085, -0.15, -0.042, 0.085, 1.00, 0.042);

  } else if (type === 'pickaxe') {
    // Handle
    box(-0.085, -1.00, -0.09,  0.085,  0.44, 0.09);
    // Head centre post (connects handle to cross-bar)
    box(-0.085,  0.44, -0.09,  0.085,  0.70, 0.09);
    // Left arm — longer prong
    box(-0.84,   0.28, -0.09, -0.04,   0.52, 0.09);
    // Right arm — shorter prong
    box( 0.04,   0.28, -0.09,  0.54,   0.52, 0.09);

  } else if (type === 'axe') {
    // Handle
    box(-0.085, -1.00, -0.09,  0.085,  0.46, 0.09);
    // Upper blade (wide, extends right)
    box(-0.04,   0.38, -0.12,  0.74,   0.84, 0.12);
    // Lower blade (narrower extension)
    box(-0.04,   0.06, -0.12,  0.48,   0.42, 0.12);

  } else if (type === 'shovel') {
    // Handle (long and thin)
    box(-0.065, -1.00, -0.065, 0.065,  0.56, 0.065);
    // Blade plate (wider, at top)
    box(-0.28,   0.36, -0.068, 0.28,   1.00, 0.068);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nrmArr, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvArr,  2));
  geo.setIndex(idxArr);
  geo.computeBoundingSphere();
  return geo;
}

function getHeldGeometry(blockId) {
  let g = heldGeometryCache.get(blockId);
  if (!g) {
    const def = BLOCKS[blockId];
    const isTool = !!TOOL_INFO[blockId];
    if (isTool) {
      g = buildHeldToolGeometry(blockId);
    } else if (def && !def.solid) {
      g = buildHeldItemGeometry(blockId);
    } else {
      g = buildHeldBlockGeometry(blockId);
    }
    heldGeometryCache.set(blockId, g);
  }
  return g;
}

/** Shared with third-person held item; dispose only through disposeHeldBlockGeometryCache on teardown. */
export function getHeldBlockGeometry(blockId) {
  return getHeldGeometry(blockId);
}

export function disposeHeldBlockGeometryCache() {
  for (const g of heldGeometryCache.values()) {
    g.dispose();
  }
  heldGeometryCache.clear();
}

/**
 * Minecraft-style first-person arm: same 4×12×4 proportions and pixel textures as the third-person Steve arm.
 * @param {THREE.Texture} atlasTexture
 * @returns {THREE.Group}
 */
export function createFirstPersonHand(atlasTexture) {
  const group = new THREE.Group();
  group.name = 'firstPersonHand';

  const ps = PLAYER_H / 32;
  const armW = 4 * ps;
  const armH = 12 * ps;
  const armD = 4 * ps;
  const handStripH = 3 * ps;

  const { armMats, handMat } = buildFirstPersonArmMaterialSet();

  const FP_RO = 14;
  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, armD), armMats);
  armMesh.name = 'fpArm';
  armMesh.position.set(0, -armH * 0.5, 0);
  armMesh.renderOrder = FP_RO;

  const handStrip = new THREE.Mesh(
    new THREE.BoxGeometry(armW * 0.98, handStripH, armD * 0.98),
    handMat,
  );
  handStrip.name = 'fpHandStrip';
  handStrip.position.set(0, -armH - 1.5 * ps, 0);
  handStrip.renderOrder = FP_RO;

  const armRig = new THREE.Group();
  armRig.name = 'fpArmRig';
  /** Steve arm is modeled along −Y (same as third-person). Camera space −Y is “down” on screen; −Z is forward into the world. Rotate so the arm reaches toward the crosshair instead of hanging toward the bottom edge (fixes inverted / upside-down look). */
  armRig.rotation.x = Math.PI / 2;
  armRig.add(armMesh, handStrip);

  const heldMat = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const heldMesh = new THREE.Mesh(getHeldGeometry(1), heldMat);
  heldMesh.name = 'heldBlock';
  heldMesh.frustumCulled = false;
  heldMesh.renderOrder = 6;
  heldMesh.visible = false;

  group.add(armRig, heldMesh);
  group.renderOrder = 12;
  group.frustumCulled = false;
  group.userData.heldBlock = heldMesh;
  group.userData.armRig = armRig;
  /** Wrist depth along camera −Z (group local); same magnitude as old palm Y before arm rig rotation. */
  group.userData.palmLocalY = -armH - 1.5 * ps;
  group.userData.armHalfW = armW * 0.5;

  return group;
}

const _fpLocal = new THREE.Vector3();
const _fpSwing = new THREE.Quaternion();
const _fpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fpPush = new THREE.Vector3();

/**
 * @typedef {{ kind: 'break' | 'place', t: number }} HandSwingState
 */

/**
 * @param {THREE.Group} hand
 * @param {number} blockId 0 = hide
 * @param {boolean} leftHanded
 */
export function updateFirstPersonHeldBlock(hand, blockId, leftHanded) {
  const mesh = hand.userData.heldBlock;
  if (!(mesh instanceof THREE.Mesh)) return;

  const side = leftHanded ? -1 : 1;
  const palmZ = typeof hand.userData.palmLocalY === 'number' ? hand.userData.palmLocalY : -0.55;
  const ax = typeof hand.userData.armHalfW === 'number' ? hand.userData.armHalfW + 0.04 : 0.11;

  mesh.position.set(ax * side, 0.02, palmZ + 0.065);
  mesh.rotation.set(-0.1, 0.22 * side, 0.04 * side);

  if (!blockId || !BLOCKS[blockId]) {
    mesh.visible = false;
    return;
  }
  const def = BLOCKS[blockId];
  const isTool = !!TOOL_INFO[blockId];
  const isItem = !def.solid && !isTool; // flat sprite items (food, armor, etc.)

  mesh.geometry = getHeldGeometry(blockId);
  mesh.visible = true;

  if (isTool) {
    // 3D tool model — held at a natural grip angle, handle down toward hand
    mesh.position.set(ax * side, 0.0, palmZ + 0.07);
    mesh.rotation.set(-0.55, 0.42 * side, -0.12 * side);
    mesh.scale.setScalar(1);
  } else if (isItem) {
    // Flat sprite — tilt diagonally like a held item
    mesh.position.set(ax * side, 0.0, palmZ + 0.08);
    mesh.rotation.set(-0.3, 0.35 * side, -0.75 * side);
    mesh.scale.setScalar(1.3);
  } else {
    mesh.scale.setScalar(1);
  }

  const mat = mesh.material;
  if (mat instanceof THREE.MeshLambertMaterial) {
    mat.opacity = def.alpha ? 0.94 : 1;
    mat.depthWrite = !def.alpha && !isItem;
  }
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Group} hand
 * @param {boolean} leftHanded
 * @param {HandSwingState | null} swing normalized time t in [0, 1)
 */
export function syncFirstPersonHand(camera, hand, leftHanded, swing) {
  const side = leftHanded ? -1 : 1;

  const armRig = hand.userData.armRig;
  if (armRig instanceof THREE.Group) {
    armRig.scale.x = side;
  }

  /* Camera-local: +X toward outer hand, −Y down, −Z forward. Smaller |Z| tucks the arm into the corner instead of floating in front of the view. */
  _fpLocal.set(0.46 * side, -0.36, -0.4);
  _fpLocal.applyQuaternion(camera.quaternion);
  hand.position.copy(camera.position).add(_fpLocal);

  if (swing && swing.t < 1) {
    const t = swing.t;
    const lr = leftHanded ? -1 : 1;
    let pitch = 0;
    let yaw = 0;
    let roll = 0;
    let pz = 0;

    if (swing.kind === 'break') {
      const w = Math.sin(Math.PI * Math.min(1, t * 2.65));
      pitch = w * 0.78;
      pz = -w * 0.1;
      roll = w * 0.14 * lr;
      yaw = w * 0.05 * lr;
    } else {
      const w = Math.sin(Math.PI * t);
      pitch = w * 0.52;
      pz = -w * 0.13;
      roll = -w * 0.1 * lr;
    }

    _fpEuler.set(pitch, yaw, roll, 'YXZ');
    _fpSwing.setFromEuler(_fpEuler);
    hand.quaternion.copy(camera.quaternion).multiply(_fpSwing);
    _fpPush.set(0, 0, pz);
    _fpPush.applyQuaternion(camera.quaternion);
    hand.position.add(_fpPush);
  } else {
    hand.quaternion.copy(camera.quaternion);
  }
}

const PLAYER_MODEL_H = 1.74;

/**
 * Parents the held block to the main hand arm and matches hotbar block (third-person).
 * @param {THREE.Group} playerModel
 * @param {number} blockId 0 = hide
 * @param {boolean} leftHanded
 */
export function updateThirdPersonHeldBlock(playerModel, blockId, leftHanded) {
  const mesh = playerModel.userData.tpHeldBlock;
  if (!(mesh instanceof THREE.Mesh)) return;
  const pivots = playerModel.userData.pivots;
  if (!pivots) return;

  const primary = leftHanded ? pivots.leftArmPivot : pivots.rightArmPivot;
  const secondary = leftHanded ? pivots.rightArmPivot : pivots.leftArmPivot;
  if (mesh.parent !== primary) {
    secondary.remove(mesh);
    primary.add(mesh);
  }

  const armH = 12 * (PLAYER_MODEL_H / 32);
  const side = leftHanded ? -1 : 1;
  mesh.position.set(0.014 * side, -armH * 0.85, 0.118);
  mesh.rotation.set(0.5, -0.26 * side, 0.12 * side);

  if (!blockId || !BLOCKS[blockId]) {
    mesh.visible = false;
    return;
  }
  const def = BLOCKS[blockId];
  const isTool = !!TOOL_INFO[blockId];
  const isItem = !def.solid && !isTool;

  mesh.geometry = getHeldGeometry(blockId);
  mesh.visible = true;

  if (isTool) {
    // 3D tool — angled so the head points upward and outward from the arm
    mesh.position.set(0.014 * side, -armH * 0.80, 0.12);
    mesh.rotation.set(0.55, -0.32 * side, -0.55 * side);
    mesh.scale.setScalar(1);
  } else if (isItem) {
    mesh.position.set(0.014 * side, -armH * 0.75, 0.13);
    mesh.rotation.set(0.3, -0.2 * side, -0.7 * side);
    mesh.scale.setScalar(1.2);
  } else {
    mesh.scale.setScalar(1);
  }

  const mat = mesh.material;
  if (mat instanceof THREE.MeshLambertMaterial) {
    mat.opacity = def.alpha ? 0.94 : 1;
    mat.depthWrite = !def.alpha && !isItem;
  }
}

export function disposeFirstPersonHand(group) {
  disposeHeldBlockGeometryCache();
  const seenMat = new Set();
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.name !== 'heldBlock') {
        obj.geometry.dispose();
      } else {
        obj.geometry = new THREE.BufferGeometry();
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!seenMat.has(m)) {
          seenMat.add(m);
          const tex = m.map;
          m.dispose();
          if (tex && !tex.userData?.sharedAtlasMap) tex.dispose();
        }
      }
    }
  });
}
