import * as THREE from 'three';
import { createPlayerModel, disposePlayerModel, updatePlayerModelAnimation } from './playerModel';
import { updateThirdPersonHeldBlock } from './firstPersonHand';

/**
 * Minecraft-style rotating 3D player doll in the inventory panel (separate WebGL context).
 */
export function createInventoryPlayerPreview(container, atlasTexture) {
  if (!container) {
    return {
      tick() {},
      resize() {},
      dispose() {},
    };
  }

  const scene = new THREE.Scene();
  const model = createPlayerModel(atlasTexture);
  scene.add(model);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 12);
  camera.position.set(2.15, 1.02, 2.45);
  camera.lookAt(0, 0.9, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x5a5a62, 1.08);
  const dir = new THREE.DirectionalLight(0xfff0e0, 0.62);
  dir.position.set(2.8, 5.5, 3.2);
  scene.add(hemi, dir);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'inv-preview-canvas';
  container.appendChild(renderer.domElement);

  const FIXED_ANGLE = Math.PI * 0.92;

  const FALLBACK_W = 176;
  const FALLBACK_H = 214;

  function fitSize() {
    let w = Math.floor(container.clientWidth);
    let h = Math.floor(container.clientHeight);
    if (w < 8) w = FALLBACK_W;
    if (h < 8) h = FALLBACK_H;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  fitSize();

  return {
    /**
     * @param {number} dt
     * @param {boolean} inventoryOpen
     * @param {{ heldBlockId: number, leftHanded: boolean }} opts
     */
    tick(dt, inventoryOpen, opts) {
      if (!inventoryOpen) return;
      model.rotation.y = FIXED_ANGLE;
      updatePlayerModelAnimation(model, dt, { walking: false, sprinting: false });
      updateThirdPersonHeldBlock(model, opts.heldBlockId, opts.leftHanded);
      renderer.render(scene, camera);
    },

    resize() {
      fitSize();
    },

    dispose() {
      disposePlayerModel(model);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
