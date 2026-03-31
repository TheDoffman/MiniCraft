import * as THREE from 'three';
import { buildPlayerModelMaterials } from './playerTextures.js';
import { getHeldBlockGeometry } from './firstPersonHand.js';

/**
 * Minecraft Steve-style proportions (4×12 limbs, 8×12 body, 8×8 head in 32px vertical stack),
 * scaled to match gameplay player height (1.74). Procedural pixel-style textures per face.
 * @param {THREE.Texture} atlasTexture block atlas (shared map; do not dispose with model)
 * @returns {THREE.Group}
 */
export function createPlayerModel(atlasTexture) {
  const group = new THREE.Group();
  group.name = 'playerModel';

  const mats = buildPlayerModelMaterials();

  const H = 1.74;
  /** One vertical "pixel" of the classic 32px stack (leg+body+head). */
  const ps = H / 32;

  const legW = 4 * ps;
  const legH = 12 * ps;
  const legD = 4 * ps;
  const bodyW = 8 * ps;
  const bodyH = 12 * ps;
  const bodyD = 4 * ps;
  const armW = 4 * ps;
  const armH = 12 * ps;
  const armD = 4 * ps;
  const headS = 8 * ps;

  const hipY = legH;
  const legOffX = 2 * ps;
  const armOffX = 6 * ps;
  const shoulderY = hipY + bodyH;

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-legOffX, hipY, 0);
  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(legOffX, hipY, 0);

  const legGeo = new THREE.BoxGeometry(legW, legH, legD);
  const leftLeg = new THREE.Mesh(legGeo, mats.legMats);
  leftLeg.position.set(0, -legH / 2, 0);
  const rightLeg = new THREE.Mesh(legGeo, mats.legMats);
  rightLeg.position.set(0, -legH / 2, 0);

  leftLegPivot.add(leftLeg);
  rightLegPivot.add(rightLeg);

  const baseTorsoY = hipY + bodyH / 2;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), mats.torsoMats);
  torso.position.set(0, baseTorsoY, 0);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-armOffX, shoulderY, 0);
  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(armOffX, shoulderY, 0);

  const armGeo = new THREE.BoxGeometry(armW, armH, armD);
  const leftArm = new THREE.Mesh(armGeo, mats.armMats);
  leftArm.position.set(0, -armH / 2, 0);
  const rightArm = new THREE.Mesh(armGeo, mats.armMats);
  rightArm.position.set(0, -armH / 2, 0);

  const handGeo = new THREE.BoxGeometry(armW * 0.98, 3 * ps, armD * 0.98);
  const leftHand = new THREE.Mesh(handGeo, mats.handMat);
  leftHand.position.set(0, -armH - 1.5 * ps, 0);
  const rightHand = new THREE.Mesh(handGeo, mats.handMat);
  rightHand.position.set(0, -armH - 1.5 * ps, 0);

  leftArmPivot.add(leftArm, leftHand);
  rightArmPivot.add(rightArm, rightHand);

  const tpHeldMat = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    flatShading: true,
    alphaTest: 0.5,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  });
  tpHeldMat.userData.sharedAtlasMap = true;

  const tpHeld = new THREE.Mesh(getHeldBlockGeometry(1), tpHeldMat);
  tpHeld.name = 'tpHeldBlock';
  tpHeld.visible = false;
  tpHeld.frustumCulled = false;
  tpHeld.castShadow = true;
  tpHeld.receiveShadow = false;
  rightArmPivot.add(tpHeld);

  const baseHeadY = shoulderY + headS / 2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(headS, headS, headS), mats.headMats);
  head.position.set(0, baseHeadY, 0);

  const headOverlayS = headS + 2 * ps * 1.05;
  const headOverlay = new THREE.Mesh(
    new THREE.BoxGeometry(headOverlayS, headOverlayS, headOverlayS),
    mats.overlayMats,
  );
  headOverlay.position.set(0, baseHeadY, 0);

  group.add(
    leftLegPivot,
    rightLegPivot,
    torso,
    leftArmPivot,
    rightArmPivot,
    head,
    headOverlay,
  );

  group.userData.pivots = {
    leftLegPivot,
    rightLegPivot,
    leftArmPivot,
    rightArmPivot,
    torso,
    head,
    headOverlay,
    baseTorsoY,
    baseHeadY,
  };
  group.userData.walkPhase = 0;
  group.userData.smoothedSwing = 0;
  group.userData.tpHeldBlock = tpHeld;

  return group;
}

/**
 * @param {THREE.Group} group
 * @param {number} dt
 * @param {{ walking: boolean, sprinting?: boolean }} opts
 */
export function updatePlayerModelAnimation(group, dt, opts) {
  const ud = group.userData;
  const piv = ud.pivots;
  if (!piv) return;

  const { walking, sprinting } = opts;
  if (walking) {
    ud.walkPhase += dt * (sprinting ? 20 : 14);
  }
  const targetSwing = walking ? Math.sin(ud.walkPhase) * 0.52 : 0;
  ud.smoothedSwing = THREE.MathUtils.lerp(ud.smoothedSwing, targetSwing, 1 - Math.exp(-dt * 14));

  const s = ud.smoothedSwing;
  piv.leftLegPivot.rotation.x = s;
  piv.rightLegPivot.rotation.x = -s;
  piv.leftArmPivot.rotation.x = -s * 0.68;
  piv.rightArmPivot.rotation.x = s * 0.68;

  const bob = Math.abs(s) * 0.028;
  piv.torso.position.y = piv.baseTorsoY + bob;
  const headBob = bob * 0.92;
  piv.head.position.y = piv.baseHeadY + headBob;
  piv.headOverlay.position.y = piv.baseHeadY + headBob;
}

/**
 * @param {THREE.Group} group
 */
export function disposePlayerModel(group) {
  const seenGeo = new Set();
  const seenMat = new Set();
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.name !== 'tpHeldBlock' && !seenGeo.has(obj.geometry)) {
        seenGeo.add(obj.geometry);
        obj.geometry.dispose();
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!seenMat.has(m)) {
          seenMat.add(m);
          if (m.userData?.sharedAtlasMap) {
            m.map = null;
            m.dispose();
          } else {
            m.map?.dispose();
            m.dispose();
          }
        }
      }
    }
  });
}
