import * as THREE from 'three';
import { World } from './world.js';
import { buildRegionMesh } from './mesher.js';
import {
  buildAtlasCanvas,
  configureAtlasTextureSettings,
} from './textures.js';
import {
  buildMinecraftStyleMoonCanvas,
  buildMinecraftStyleSunCanvas,
  canvasToCelestialTexture,
} from './celestialSprites.js';
import {
  BLOCKS,
  BlockId,
  TILE_PX,
  TOOL_INFO,
  armorSlotForBlock,
  totalArmorPoints,
  armorDamageMultiplier,
  SMELTING_RECIPES,
  FUEL_BURN_TIME,
  getBlockDrop,
} from './blocktypes.js';
import { Player } from './player.js';
import { raycastBlocks } from './raycast.js';
import { buildSelectionOutlineGeometry } from './selectionOutline.js';
import { aabbFullySubmergedInFluid } from './physics.js';
import { CHUNK_XZ, regionForChunk, chunkKeysForBlock } from './chunks.js';
import { saveToLocalStorage, loadFromLocalStorage } from './save.js';
import {
  createInventory,
  createCreativeInventory,
  createArmorSlots,
  HOTBAR_OFFSET,
  addItemToInventory,
  consumeFromSlot,
  isEmptySlot,
  displayBlockName,
  canPickupBlock,
  damageToolInSlot,
  MAX_STACK,
  INV_SIZE,
  listCreativePaletteBlockIds,
  creativePaletteGrabSlot,
  clearBackpackSlots,
} from './inventory.js';
import {
  addBlockBreakBurst,
  updateBlockBreakParticles,
  disposeAllBlockParticles,
  setBlockParticleAtlasTexture,
  setBlockParticleRenderer,
} from './blockParticles.js';
import { createPlayerModel, disposePlayerModel, updatePlayerModelAnimation } from './playerModel.js';
import { createInventoryPlayerPreview } from './inventoryPlayerPreview.js';
import { initMainMenuTerrain } from './mainMenuTerrain.js';
import {
  createFirstPersonHand,
  syncFirstPersonHand,
  updateFirstPersonHeldBlock,
  updateThirdPersonHeldBlock,
  disposeFirstPersonHand,
} from './firstPersonHand.js';
import {
  createCloudLayer,
  tickCloudLayer,
  syncCloudLayerPosition,
  disposeCloudLayer,
} from './cloudLayer.js';
import { sampleWeather, smoothWeatherSample } from './weather.js';
import {
  createWeatherEventState,
  resetWeatherEventState,
  tickWeatherEvents,
  mergeWeatherEventBase,
} from './weatherEvents.js';
import { computeRainParticleExposure, computeRainShelter } from './weatherSoundExposure.js';
import { computeCaveLightFactors } from './caveLighting.js';
import {
  createWeatherParticles,
  updateWeatherParticles,
  disposeWeatherParticles,
} from './weatherParticles.js';
import {
  PIG_PUNCH_DAMAGE,
  raycastNearestPigWithT,
  raycastNearestCowWithT,
  raycastNearestSquidWithT,
  raycastNearestZombieWithT,
  updatePig,
  updateCow,
  updateSquid,
  updateZombie,
  orientDropsToCamera,
  tryPickupDrops,
  damageNearestPig,
  damageNearestCow,
  damageSquid,
  damageZombie,
  finalizeDeadPig,
  finalizeDeadCow,
  finalizeDeadSquid,
  finalizeDeadZombie,
  zombieContactDamage,
  clearMobsFromScene,
  spawnPigsAroundWorld,
  spawnCowsAroundWorld,
  spawnSquidsInWater,
  spawnZombiesAroundPlayer,
  restoreMobsFromSave,
  serializeMobsState,
  disposeMobsSharedResources,
} from './mobs.js';
import { createGroundDrop, tickGroundDrops } from './mobDrops.js';
import { disposePigMaterialBundle } from './pigTextures.js';
import { disposeCowMaterialBundle } from './cowTextures.js';
import { disposeSquidMaterialBundle } from './squidTextures.js';
import { disposeZombieMaterialBundle } from './zombieTextures.js';
import { playSound, startAmbient, updateAmbient, setMasterVolume } from './sound.js';
import { loadSettings, saveSettings } from './gameSettings.js';
import {
  initTorchLights,
  updateTorchLights,
  disposeTorchLights,
} from './torchLight.js';
import {
  initTorchEmbers,
  updateTorchEmbers,
  disposeTorchEmbers,
} from './torchEmbers.js';
import { torchSupportDeltaToAttach, TorchAttach } from './torchAttach.js';
import { recomputeWaterAround, needsWaterRecomputeAfterBreak } from './waterFlow.js';
import {
  WORLD_H,
  CHUNK_MESH_MARGIN,
  MAX_HEALTH,
  MAX_STAMINA,
  MAX_HUNGER,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  HUNGER_DRAIN_PER_SEC,
  HUNGER_SPRINT_DRAIN_PER_SEC,
  HEALTH_REGEN_PER_SEC,
  HUNGER_REGEN_THRESHOLD,
  HUNGER_STARVE_THRESHOLD,
  STARVE_DAMAGE_PER_SEC,
  PORKCHOP_HUNGER_RESTORE,
  BEEF_HUNGER_RESTORE,
  PORKCHOP_HEAL,
  BEEF_HEAL,
  MOB_RESPAWN_INTERVAL,
  TARGET_PIG_COUNT,
  TARGET_COW_COUNT,
  TARGET_SQUID_COUNT,
  TARGET_ZOMBIE_COUNT_NIGHT,
  BASE_MINE_TIME,
  REACH,
  FALL_SHAKE_MAX,
  FALL_SHAKE_DECAY,
  FALL_SHAKE_PER_DAMAGE,
  WALK_BOB_LERP,
  WALK_BOB_FREQ,
  SPRINT_BOB_FREQ,
  WALK_BOB_VERT,
  WALK_BOB_LAT,
  SPRINT_BOB_MUL,
  W_DOUBLE_TAP_MS,
  SPACE_DOUBLE_TAP_MS,
  gameMode,
  setGameMode,
} from './gameState.js';
import {
  createCraftingGrid,
  createCraftingGrid3x3,
  findRecipe,
  findRecipe3x3,
} from './crafting.js';

let gameSettings = loadSettings();

const canvas = document.getElementById('c');
const uiRoot = document.getElementById('ui');
const startEl = document.getElementById('start');
/** Title-screen terrain backdrop; set after block materials exist. */
let mainMenuTerrainCtl = null;
const pauseMenuEl = document.getElementById('pauseMenu');
const pauseWorldMetaEl = document.getElementById('pauseWorldMeta');
const pauseResumeBtn = document.getElementById('pauseResumeBtn');
const pauseSaveBtn = document.getElementById('pauseSaveBtn');
const pauseLoadBtn = document.getElementById('pauseLoadBtn');
const pauseMainMenuBtn = document.getElementById('pauseMainMenuBtn');

/** True after Play — lost pointer capture shows the pause menu instead of the title screen. */
let inGame = false;

/** Title (#start) or pause overlay visible — hide HUD that would stack above menus. */
function syncMenuOpenUiClass() {
  const startOpen = !!(startEl && !startEl.classList.contains('hidden'));
  const pauseOpen = !!(pauseMenuEl && !pauseMenuEl.classList.contains('hidden'));
  uiRoot?.classList.toggle('menu-open', startOpen || pauseOpen);
}

function updatePauseWorldMeta() {
  if (!pauseWorldMetaEl) return;
  const modeLabel = gameMode === 'creative' ? 'Creative' : 'Survival';
  pauseWorldMetaEl.textContent = `${modeLabel} · seed ${world.seed}`;
}

function showPauseMenu() {
  updatePauseWorldMeta();
  syncSettingsUiFromState();
  applyLeftHandedToUI();
  pauseMenuEl?.classList.remove('hidden');
  pauseMenuEl?.setAttribute('aria-hidden', 'false');
  syncMenuOpenUiClass();
  requestAnimationFrame(() => {
    pauseResumeBtn?.focus();
  });
}

function hidePauseMenu() {
  pauseMenuEl?.classList.add('hidden');
  pauseMenuEl?.setAttribute('aria-hidden', 'true');
  syncMenuOpenUiClass();
}

/** Leave the world UI: pause → title. Does not reset the world; use Play to continue this seed. */
function goToMainMenu() {
  closeOverlayPanelsForMenuOrDeath();
  keys.forward = false;
  keys.back = false;
  keys.left = false;
  keys.right = false;
  keys.jump = false;
  keys.swimDown = false;
  sprintLatched = false;
  mouseLeftDown = false;
  miningBlock = null;
  miningProgress = 0;
  crackMesh.visible = false;
  pendingPointerLock = false;
  inGame = false;
  hidePauseMenu();
  startEl?.classList.remove('hidden');
  applyLeftHandedToUI();
  syncMenuOpenUiClass();
  document.exitPointerLock();
}

const playBtn = document.getElementById('playBtn');
const newWorldBtn = document.getElementById('newWorldBtn');
const loadBtn = document.getElementById('loadBtn');
const seedInput = document.getElementById('seedInput');
const hotbarEl = document.getElementById('hotbar');
const invPanelEl = document.getElementById('inventoryPanel');
const invGridBackpackEl = document.getElementById('invGridBackpack');
const invGridHotbarEl = document.getElementById('invGridHotbar');
const invBackpackSectionEl = document.getElementById('invBackpackSection');
const creativeCatalogSectionEl = document.getElementById('creativeCatalogSection');
const creativeCatalogGridEl = document.getElementById('creativeCatalogGrid');
const creativeSearchEl = document.getElementById('creativeSearch');
/** Lowercase filter for creative palette search (while inventory open). */
let creativeInventorySearch = '';
creativeSearchEl?.addEventListener('input', () => {
  if (creativeSearchEl instanceof HTMLInputElement) {
    creativeInventorySearch = creativeSearchEl.value;
    if (invPanelEl && !invPanelEl.classList.contains('hidden')) refreshInventoryPanel();
  }
});
const invArmorRail = document.getElementById('invArmorRail');
const invPlayerPreviewMount = document.getElementById('invPlayerPreviewMount');

const craftGridEl = document.getElementById('craftGrid');
const craftResultEl = document.getElementById('craftResult');

const ARMOR_SLOT_TITLES = ['Helmet', 'Chestplate', 'Leggings', 'Boots'];
const healthFill = document.getElementById('healthFill');
const staminaFill = document.getElementById('staminaFill');
const hungerFill = document.getElementById('hungerFill');
const leftHandedInput = document.getElementById('leftHandedInput');
const pauseLeftHandedInput = document.getElementById('pauseLeftHandedInput');
const underwaterOverlay = document.getElementById('underwaterOverlay');
const deathScreen = document.getElementById('deathScreen');
const deathReason = document.getElementById('deathReason');
const respawnBtn = document.getElementById('respawnBtn');
const toastContainer = document.getElementById('toastContainer');
const coordsHudEl = document.getElementById('coordsHud');
const fpsHudEl = document.getElementById('fpsHud');
const furnacePanelEl = document.getElementById('furnacePanel');
const furnaceInputMount = document.getElementById('furnaceInput');
const furnaceFuelMount = document.getElementById('furnaceFuel');
const furnaceOutputMount = document.getElementById('furnaceOutput');
const furnaceProgressFillEl = document.getElementById('furnaceProgressFill');
const craftingTablePanelEl = document.getElementById('craftingTablePanel');
const craftTableGridEl = document.getElementById('craftTableGrid');
const craftTableResultEl = document.getElementById('craftTableResult');
const craftTableInvBackpackEl = document.getElementById('craftTableInvBackpack');
const craftTableInvHotbarEl = document.getElementById('craftTableInvHotbar');

const modeSurvivalBtn = document.getElementById('modeSurvivalBtn');
const modeCreativeBtn = document.getElementById('modeCreativeBtn');
const statBarsEl = document.getElementById('statBars');

function syncModeButtons() {
  modeSurvivalBtn?.classList.toggle('active', gameMode === 'survival');
  modeCreativeBtn?.classList.toggle('active', gameMode === 'creative');
}

modeSurvivalBtn?.addEventListener('click', () => {
  setGameMode('survival');
  syncModeButtons();
  syncStatBarsVisibility();
});
modeCreativeBtn?.addEventListener('click', () => {
  setGameMode('creative');
  syncModeButtons();
  syncStatBarsVisibility();
});

const CREATIVE_PALETTE_IDS = listCreativePaletteBlockIds();

const LEFT_HANDED_STORAGE_KEY = 'minicraft-left-handed';

if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas');
if (!(healthFill instanceof HTMLElement) || !(staminaFill instanceof HTMLElement)) {
  throw new Error('health/stamina bars missing');
}

function loadLeftHandedSetting() {
  return localStorage.getItem(LEFT_HANDED_STORAGE_KEY) === '1';
}

let leftHanded = loadLeftHandedSetting();

function allLeftHandedInputs() {
  return [leftHandedInput, pauseLeftHandedInput].filter((el) => el instanceof HTMLInputElement);
}

function applyLeftHandedToUI() {
  for (const el of allLeftHandedInputs()) {
    el.checked = leftHanded;
  }
}

function setLeftHandedFromCheckbox(/** @type {HTMLInputElement} */ source) {
  leftHanded = source.checked;
  localStorage.setItem(LEFT_HANDED_STORAGE_KEY, leftHanded ? '1' : '0');
  for (const el of allLeftHandedInputs()) {
    if (el !== source) el.checked = leftHanded;
  }
}

applyLeftHandedToUI();
syncMenuOpenUiClass();

/**
 * Blue tint, vignette, and light caustic motion when the camera is submerged.
 */
function syncUnderwaterScreenEffect() {
  if (!(underwaterOverlay instanceof HTMLElement)) return;
  const { min, max } = player.aabb();
  const wet = inGame && aabbFullySubmergedInFluid(world, min, max);
  underwaterOverlay.classList.toggle('is-active', wet);
  underwaterOverlay.setAttribute('aria-hidden', wet ? 'false' : 'true');
}

const menuSplashEl = document.getElementById('menuSplash');
const MENU_SPLASHES = [
  'Now with cubes!',
  'Z is up!',
  '404 chunks not found',
  'Casual voxel gaming!',
  'Limited edition!',
  'Don’t dig straight down!',
];
if (menuSplashEl) {
  menuSplashEl.textContent = MENU_SPLASHES[Math.floor(Math.random() * MENU_SPLASHES.length)];
}

leftHandedInput?.addEventListener('change', () => {
  if (leftHandedInput instanceof HTMLInputElement) setLeftHandedFromCheckbox(leftHandedInput);
});
pauseLeftHandedInput?.addEventListener('change', () => {
  if (pauseLeftHandedInput instanceof HTMLInputElement) setLeftHandedFromCheckbox(pauseLeftHandedInput);
});

function readSeedFromURL() {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null || raw === '') return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return ((n % 2147483647) + 2147483647) % 2147483647;
}

function readSeedFromInput() {
  if (!(seedInput instanceof HTMLInputElement)) return 135792;
  const raw = String(seedInput.value).trim();
  if (raw === '') return 135792;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 135792;
  return ((n % 2147483647) + 2147483647) % 2147483647;
}

/** No-op until {@link createInventoryPlayerPreview} runs (main renderer sizes earlier in init). */
let resizeInvPlayerPreview = () => {};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
});
applyRendererPixelRatioAndSize();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
/** Kept in sync with {@link applyShadowQualityFromSettings}. */
let shadowMapResolution = 2048;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e8);
scene.fog = new THREE.FogExp2(0xb8d4f0, 0.012);

const camera = new THREE.PerspectiveCamera(
  gameSettings.fov,
  window.innerWidth / window.innerHeight,
  0.08,
  500,
);
setMasterVolume(gameSettings.masterVolume);

const _shakeView = new THREE.Vector3();
const _shakeRight = new THREE.Vector3();
const _shakeUp = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _lookDir = new THREE.Vector3();

/**
 * Block targeting / mining ray: first-person and behind-camera use the camera;
 * front-facing selfie cam uses eye position + player yaw/pitch so you still aim where you look.
 */
function getInteractionRayOriginAndDir() {
  if (cameraViewMode === 2) {
    const e = eyePos();
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    return { ox: e.x, oy: e.y, oz: e.z, dx: fx, dy: fy, dz: fz };
  }
  camera.getWorldDirection(_lookDir);
  return {
    ox: camera.position.x,
    oy: camera.position.y,
    oz: camera.position.z,
    dx: _lookDir.x,
    dy: _lookDir.y,
    dz: _lookDir.z,
  };
}

/** Decaying amplitude for fall-damage camera shake (position wobble, radians-scale driver). */
let fallCameraShake = 0;

function addFallDamageCameraShake(damage) {
  if (!gameSettings.cameraShake) return;
  const bump = Math.min(0.024, damage * FALL_SHAKE_PER_DAMAGE);
  fallCameraShake = Math.min(FALL_SHAKE_MAX, fallCameraShake + bump);
}

function updateFallCameraShake(dt) {
  fallCameraShake *= Math.exp(-dt * FALL_SHAKE_DECAY);
  if (fallCameraShake < 1e-5) fallCameraShake = 0;
}

/** Smoothed 0–1 for first-person walk/sprint head bob. */
let walkBobEnvelope = 0;

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a5a4a, 0.72);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e0, 0.85);
sun.position.set(40, 80, 30);
scene.add(sun);
scene.add(sun.target);

const SHADOW_ORTHO = 72;
const SHADOW_NEAR = 2;
const SHADOW_FAR = 300;
function setupDirShadow(light) {
  light.castShadow = true;
  light.shadow.mapSize.set(shadowMapResolution, shadowMapResolution);
  light.shadow.camera.near = SHADOW_NEAR;
  light.shadow.camera.far = SHADOW_FAR;
  light.shadow.camera.left = -SHADOW_ORTHO;
  light.shadow.camera.right = SHADOW_ORTHO;
  light.shadow.camera.top = SHADOW_ORTHO;
  light.shadow.camera.bottom = -SHADOW_ORTHO;
  light.shadow.bias = -0.00025;
  light.shadow.normalBias = 0.035;
}
setupDirShadow(sun);

/** Cool fill when the sun is down (moonlight). */
const moon = new THREE.DirectionalLight(0xc4d2ff, 0);
moon.position.set(-40, 60, -40);
scene.add(moon);
scene.add(moon.target);
setupDirShadow(moon);

/** FP hand uses camera layer 1; lights must match or the arm is unlit in the hand pass. */
sun.layers.enable(1);
hemi.layers.enable(1);
moon.layers.enable(1);

const _worldDayCenter = new THREE.Vector3();
const _moonPosScratch = new THREE.Vector3();
const _skyScratch = new THREE.Color();
const _fogTint = new THREE.Color();
const _weatherGray = new THREE.Color();
const _weatherFogMist = new THREE.Color(0x6a7588);

function createStarField(cx, cz) {
  const count = 340;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = (i * 12.9898 + 78.233) % 1000;
    const b = (i * 78.233 + 19.989) % 1000;
    const u = a / 1000;
    const v = b / 1000;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = 265;
    const sp = Math.sin(phi);
    positions[i * 3] = cx + r * sp * Math.cos(theta);
    positions[i * 3 + 1] = 28 + r * Math.cos(phi) * 0.92;
    positions[i * 3 + 2] = cz + r * sp * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe8f0ff,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -8;
  return pts;
}

_worldDayCenter.set(0, 26, 0);
sun.target.position.copy(_worldDayCenter);
moon.target.position.copy(_worldDayCenter);
const starField = createStarField(0, 0);
scene.add(starField);

function createSunSpriteMaterial() {
  const tex = canvasToCelestialTexture(buildMinecraftStyleSunCanvas());
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xfffef0,
    transparent: true,
    opacity: 1,
    /* Must test depth or the sprite draws after chunks and shows through solid ground. */
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  return { mat, tex };
}

function createMoonSpriteMaterial() {
  const tex = canvasToCelestialTexture(buildMinecraftStyleMoonCanvas());
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xe8ecf5,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  return { mat, tex };
}

const sunSpriteBundle = createSunSpriteMaterial();
const sunSprite = new THREE.Sprite(sunSpriteBundle.mat);
sunSprite.scale.setScalar(56);
sunSprite.renderOrder = -6;
sunSprite.frustumCulled = false;

const moonSpriteBundle = createMoonSpriteMaterial();
const moonSprite = new THREE.Sprite(moonSpriteBundle.mat);
moonSprite.scale.setScalar(46);
moonSprite.renderOrder = -5;
moonSprite.frustumCulled = false;

scene.add(sunSprite, moonSprite);

const cloudLayer = createCloudLayer();
scene.add(cloudLayer.group);
const weatherParticles = createWeatherParticles(scene);
initTorchLights(scene);
initTorchEmbers(scene);

const _toSunVis = new THREE.Vector3();
const _toMoonVis = new THREE.Vector3();
let celestialSunVis = 0;
let currentNightF = 0;
let celestialMoonVis = 0;

function syncCelestialDiscs() {
  const skyDist = 252;
  _toSunVis.subVectors(sun.position, camera.position).normalize();
  sunSprite.position.copy(camera.position).addScaledVector(_toSunVis, skyDist);
  sunSprite.material.opacity = THREE.MathUtils.clamp(celestialSunVis * 1.08, 0, 1);
  sunSprite.visible = sunSprite.material.opacity > 0.03;

  _toMoonVis.subVectors(moon.position, camera.position).normalize();
  moonSprite.position.copy(camera.position).addScaledVector(_toMoonVis, skyDist);
  moonSprite.material.opacity = THREE.MathUtils.clamp(celestialMoonVis * 1.12, 0, 1);
  moonSprite.visible = moonSprite.material.opacity > 0.04;
}

/* Build the procedural atlas once — supplies both WebGL texture and
   the raw canvas for 2D inventory slot icons. */
const _atlasCanvas = buildAtlasCanvas();
let atlasTex = configureAtlasTextureSettings(new THREE.CanvasTexture(_atlasCanvas));
/** Previous atlas texture after swapping to file atlas (dispose on teardown if distinct). */
let proceduralAtlasForDrops = atlasTex;
/** Canvas used for 2D slot icons (drawImage). Always the procedural canvas. */
let atlasDrawSource = /** @type {CanvasImageSource} */ (_atlasCanvas);
setBlockParticleAtlasTexture(atlasTex);

function swapBlockAtlasFromFile(/** @type {THREE.Texture} */ loadedTex) {
  const img = loadedTex.image;
  if (!(img instanceof HTMLImageElement || img instanceof ImageBitmap)) return;
  proceduralAtlasForDrops = atlasTex;
  atlasTex = loadedTex;
  atlasDrawSource = img;
  worldMat.map = loadedTex;
  cutoutMat.map = loadedTex;
  waterMat.map = loadedTex;
  lavaMat.map = loadedTex;
  worldMat.needsUpdate = true;
  cutoutMat.needsUpdate = true;
  waterMat.needsUpdate = true;
  lavaMat.needsUpdate = true;
  setBlockParticleAtlasTexture(loadedTex);
  const held = fpHand.userData.heldBlock;
  if (held?.material) {
    held.material.map = loadedTex;
    held.material.needsUpdate = true;
  }
  const tpm = playerModel.getObjectByName('tpHeldBlock');
  if (tpm?.material) {
    tpm.material.map = loadedTex;
    tpm.material.needsUpdate = true;
  }
  mainMenuTerrainCtl?.syncAtlas(loadedTex);
  refreshInventoryUI();
}

setBlockParticleRenderer(renderer);

const fpHand = createFirstPersonHand(atlasTex);
fpHand.visible = false;
/** Layer 1 = second pass after depth clear so cutout/water cannot cover the hand. */
const FP_HAND_LAYER = 1;
fpHand.traverse((obj) => {
  if ('layers' in obj && obj.layers) {
    obj.layers.disableAll();
    obj.layers.enable(FP_HAND_LAYER);
  }
  if (obj instanceof THREE.Mesh) {
    obj.castShadow = false;
    obj.receiveShadow = false;
  }
});
scene.add(fpHand);

const worldMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  transparent: false,
  alphaTest: 0.5,
  depthWrite: true,
  depthTest: true,
  vertexColors: true,
});

/** Slow UV drift on water (see {@link attachWaterDepthMurkShader}). */
const waterShimmerUniforms = { uWaterTime: { value: 0 } };

function attachWaterDepthMurkShader(/** @type {THREE.MeshLambertMaterial} */ mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterShimmerUniforms.uWaterTime;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <color_pars_vertex>',
        `#include <color_pars_vertex>
attribute float waterDepth;
attribute vec2 waterFlow;
varying float vWaterDepth;
varying vec2 vWaterFlow;
`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vWaterDepth = waterDepth;
vWaterFlow = waterFlow;
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
uniform float uWaterTime;
varying vec2 vWaterFlow;
`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
		float _wt = uWaterTime;
	vec2 _cell = floor(vMapUv * 16.0 + 0.0001);
	vec2 _loc = fract(vMapUv * 16.0);
	vec2 _flow = vec2(_wt * 0.022, _wt * 0.016) + vWaterFlow * (0.05 + 0.02 * sin(_wt * 1.7));
	vec2 _tf = fract(_loc + _flow);
	vec2 _wShUv = (_cell + _tf) / 16.0;
	vec4 sampledDiffuseColor = texture2D( map, _wShUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <color_pars_fragment>',
        `#include <color_pars_fragment>
varying float vWaterDepth;
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
	float wd = clamp( vWaterDepth, 0.0, 1.0 );
	float murk = 1.0 - exp( -wd * 4.8 );
	vec3 deepCol = vec3( 0.035, 0.12, 0.2 );
	diffuseColor.rgb = mix( diffuseColor.rgb, deepCol, murk * 0.9 );
	float a1 = diffuseColor.a + murk * 0.52;
	diffuseColor.a = min( a1, 0.94 );
}
`,
      );
  };
}

/**
 * Leaves / glass: texture cutout (alphaTest), depth write on visible texels — not blended like water.
 */
const cutoutMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  transparent: false,
  alphaTest: 0.5,
  depthWrite: true,
  depthTest: true,
  side: THREE.DoubleSide,
  vertexColors: true,
});

/**
 * Water-only chunk mesh: depth write + slight polygon offset stops transparency sort flicker
 * vs terrain and between chunks.
 */
const waterMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  transparent: true,
  opacity: 1.0,
  depthWrite: true,
  depthTest: true,
  side: THREE.DoubleSide,
  vertexColors: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
attachWaterDepthMurkShader(waterMat);
waterMat.customProgramCacheKey = () => 'waterdepthW+flow+lv';

function attachLavaDepthMurkShader(/** @type {THREE.MeshLambertMaterial} */ mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterShimmerUniforms.uWaterTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <color_pars_vertex>',
        `#include <color_pars_vertex>
attribute float waterDepth;
varying float vWaterDepth;
`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vWaterDepth = waterDepth;
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
uniform float uWaterTime;
`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
		float _wt = uWaterTime;
	vec2 _cell = floor(vMapUv * 16.0 + 0.0001);
	vec2 _loc = fract(vMapUv * 16.0);
	vec2 _flow = vec2(_wt * -0.026, _wt * 0.019);
	vec2 _tf = fract(_loc + _flow);
	vec2 _lShUv = (_cell + _tf) / 16.0;
	vec4 sampledDiffuseColor = texture2D( map, _lShUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <color_pars_fragment>',
        `#include <color_pars_fragment>
varying float vWaterDepth;
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
	float wd = clamp( vWaterDepth, 0.0, 1.0 );
	float murk = 1.0 - exp( -wd * 3.6 );
	vec3 deepCol = vec3( 0.14, 0.02, 0.0 );
	diffuseColor.rgb = mix( diffuseColor.rgb, deepCol, murk * 0.82 );
	float a1 = diffuseColor.a + murk * 0.42;
	diffuseColor.a = min( a1, 0.92 );
}
`,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	vec3 lavaAlb = diffuseColor.rgb;
	float lavaHot = max( lavaAlb.r, max( lavaAlb.g * 0.58, lavaAlb.b * 0.22 ) );
	float lavaPulse = 0.88 + 0.12 * sin( uWaterTime * 2.6 + lavaHot * 5.5 );
	vec3 lavaGlowTint = vec3( 1.0, 0.4, 0.1 );
	outgoingLight += lavaGlowTint * lavaHot * lavaHot * ( 1.25 * lavaPulse );
`,
      );
  };
}

const lavaMat = new THREE.MeshLambertMaterial({
  map: atlasTex,
  transparent: true,
  opacity: 1.0,
  depthWrite: true,
  depthTest: true,
  side: THREE.DoubleSide,
  vertexColors: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
attachLavaDepthMurkShader(lavaMat);
lavaMat.customProgramCacheKey = () => 'lavadepthW+flow+glow';

const mainMenuTerrainCanvas = document.getElementById('mainMenuTerrainCanvas');
if (mainMenuTerrainCanvas instanceof HTMLCanvasElement && startEl) {
  mainMenuTerrainCtl = initMainMenuTerrain({
    canvas: mainMenuTerrainCanvas,
    startEl,
    worldHeight: WORLD_H,
    worldMatTemplate: worldMat,
    cutoutMatTemplate: cutoutMat,
    waterMatTemplate: waterMat,
    lavaMatTemplate: lavaMat,
  });
}

/** Block-breaking crack overlay — slightly inset box with animated opacity. */
const crackGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
const crackMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0,
  depthTest: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const crackMesh = new THREE.Mesh(crackGeo, crackMat);
crackMesh.visible = false;
crackMesh.renderOrder = 2;

/** Mining state */
let miningBlock = null;
let miningProgress = 0;
let miningTimeForBlock = BASE_MINE_TIME;
let mouseLeftDown = false;

/** Calculate how long to mine a block given held item. */
function getMineTime(blockId, heldBlockId) {
  if (gameMode === 'creative') return 0;
  const def = BLOCKS[blockId];
  if (!def) return BASE_MINE_TIME;
  const hardness = def.hardness ?? 0.5;
  const tool = TOOL_INFO[heldBlockId];
  let speed = 1;
  if (tool) {
    if (def.toolType && tool.type === def.toolType) {
      speed = tool.speed * 1.5;
    } else {
      speed = tool.speed * 0.8;
    }
  }
  return Math.max(0.05, (hardness * BASE_MINE_TIME) / speed);
}

let selectionOutlineKey = '';
const selectionMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  linewidth: 1,
  transparent: true,
  opacity: 0.85,
});
const selectionGeomInitial = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001));
const selection = new THREE.LineSegments(selectionGeomInitial, selectionMat);
selection.visible = false;
selection.frustumCulled = false;
scene.add(selection);
scene.add(crackMesh);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

/** Offset from eye along look axis for third-person modes. */
const VIEW_BACK_DIST = 3.8;
const VIEW_FRONT_DIST = 3.85;
/**
 * 0 = first-person, 1 = third-person behind player, 2 = third-person in front (faces the player).
 * Cycle with F5.
 */
let cameraViewMode = 0;

const playerModel = createPlayerModel(atlasTex);
playerModel.renderOrder = 3;
playerModel.visible = false;
playerModel.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
});
scene.add(playerModel);

const invPlayerPreview = createInventoryPlayerPreview(invPlayerPreviewMount, atlasTex);
resizeInvPlayerPreview = () => invPlayerPreview.resize();

/* block_atlas.png override removed — all textures are now generated
   procedurally by buildAtlasCanvas() so new blocks always appear correctly. */

/** @type {Map<string, { opaque: THREE.Mesh, cutout: THREE.Mesh, water: THREE.Mesh, lava: THREE.Mesh }>} */
const chunkMeshes = new Map();

const urlSeedOnLoad = readSeedFromURL();
if (seedInput instanceof HTMLInputElement && urlSeedOnLoad !== null) {
  seedInput.value = String(urlSeedOnLoad);
}
const initialSeed = urlSeedOnLoad ?? readSeedFromInput();
if (seedInput instanceof HTMLInputElement && urlSeedOnLoad === null) {
  seedInput.value = String(initialSeed);
}

/** @type {World} */
let world = new World(WORLD_H, initialSeed);

/** @type {Array<{ x: number, y: number, z: number, vx: number, vy: number, vz: number, hp: number, mesh: import('three').Group }>} */
let pigs = [];
/** @type {Array<{ x: number, y: number, z: number, hp: number, mesh: import('three').Group }>} */
let cows = [];
/** @type {Array<{ x: number, y: number, z: number, hp: number, mesh: import('three').Group }>} */
let squids = [];
/** @type {Array<*>} */
let zombies = [];
/** @type {Array<{ x: number, y: number, z: number, blockId: number, count: number, mesh: import('three').Mesh }>} */
let drops = [];
spawnPigsAroundWorld(world, scene, pigs);
spawnCowsAroundWorld(world, scene, cows);
spawnSquidsInWater(world, scene, squids);

function disposeAllChunks() {
  chunkBuildPending.clear();
  for (const key of [...chunkMeshes.keys()]) {
    disposeChunkMeshByKey(key);
  }
}

function disposeChunkMeshByKey(key) {
  const old = chunkMeshes.get(key);
  if (!old) return;
  worldGroup.remove(old.opaque);
  worldGroup.remove(old.cutout);
  if (old.water) worldGroup.remove(old.water);
  if (old.lava) worldGroup.remove(old.lava);
  old.opaque.geometry.dispose();
  old.cutout.geometry.dispose();
  if (old.water) old.water.geometry.dispose();
  if (old.lava) old.lava.geometry.dispose();
  chunkMeshes.delete(key);
  chunkVisibilityEpoch++;
}

/** Last player chunk used for streaming; NaN forces a full resync. */
let lastStreamChunkX = NaN;
let lastStreamChunkZ = NaN;
/** Bumps when chunk meshes are added/removed so draw visibility is recomputed. */
let chunkVisibilityEpoch = 0;
/** Chunk keys not yet meshed; drained by {@link processChunkBuildQueue} with time + count limits. */
const chunkBuildPending = new Set();
/** Hard cap on chunks built in one frame (safety valve; {@link CHUNK_BUILD_TIME_BUDGET_MS_PLAY} is primary). */
const CHUNK_BUILD_MAX_PER_FRAME_PLAY = 3;
const CHUNK_BUILD_MAX_PER_FRAME_MENU = 24;
/** Stop meshing after this much wall time so movement & rendering stay smooth (~60 FPS budget). */
const CHUNK_BUILD_TIME_BUDGET_MS_PLAY = 2.6;
/** Slightly more time when far behind so the world catches up without 8-chunk spikes. */
const CHUNK_BUILD_TIME_BUDGET_MS_PLAY_CATCHUP = 3.4;
const CHUNK_BUILD_TIME_BUDGET_MS_MENU = 14;
/** When pending count exceeds this in-game, use the slightly looser catch-up time budget only. */
const CHUNK_BACKLOG_CATCHUP_THRESHOLD = 88;

function getChunkRenderRadius() {
  return gameSettings.chunkRenderRadius;
}

/**
 * Keep GPU meshes only near the player (Minecraft-style streaming).
 * @param {boolean} [force] recompute wanted set even if player stayed in the same chunk
 */
function syncVisibleChunks(force = false) {
  const pcx = Math.floor(player.x / CHUNK_XZ);
  const pcz = Math.floor(player.z / CHUNK_XZ);
  if (!force && pcx === lastStreamChunkX && pcz === lastStreamChunkZ) return;
  lastStreamChunkX = pcx;
  lastStreamChunkZ = pcz;

  const rMesh = getChunkRenderRadius() + CHUNK_MESH_MARGIN;
  const r2Mesh = rMesh * rMesh;

  const want = new Set();
  for (let dcx = -rMesh; dcx <= rMesh; dcx++) {
    for (let dcz = -rMesh; dcz <= rMesh; dcz++) {
      if (dcx * dcx + dcz * dcz > r2Mesh) continue;
      const cx = pcx + dcx;
      const cz = pcz + dcz;
      want.add(`${cx},${cz}`);
    }
  }

  for (const key of [...chunkMeshes.keys()]) {
    if (!want.has(key)) disposeChunkMeshByKey(key);
  }

  for (const key of chunkBuildPending) {
    if (!want.has(key)) chunkBuildPending.delete(key);
  }

  for (const key of want) {
    if (!chunkMeshes.has(key)) chunkBuildPending.add(key);
  }
}

let lastChunkVisSig = '';

/** Hide chunk meshes between display radius and mesh margin (still loaded, not drawn — saves GPU). */
function updateChunkDrawVisibility() {
  const pcx = Math.floor(player.x / CHUNK_XZ);
  const pcz = Math.floor(player.z / CHUNK_XZ);
  const sig = `${pcx},${pcz},${chunkMeshes.size},${chunkVisibilityEpoch}`;
  if (sig === lastChunkVisSig) return;
  lastChunkVisSig = sig;
  const rDraw = getChunkRenderRadius();
  const r2 = rDraw * rDraw;
  for (const [key, meshes] of chunkMeshes) {
    const comma = key.indexOf(',');
    const cx = Number(key.slice(0, comma));
    const cz = Number(key.slice(comma + 1));
    const dcx = cx - pcx;
    const dcz = cz - pcz;
    const vis = dcx * dcx + dcz * dcz <= r2;
    meshes.opaque.visible = vis;
    meshes.cutout.visible = vis;
    if (meshes.water) meshes.water.visible = vis;
    if (meshes.lava) meshes.lava.visible = vis;
  }
}

/**
 * Builds nearest pending chunks until a wall-time budget runs out (keeps frames fluid while moving).
 * Sorts the queue once per call so we do not O(n) scan for every chunk.
 */
function processChunkBuildQueue(maxChunks, budgetMs) {
  if (chunkBuildPending.size === 0) return;
  const t0 = performance.now();
  const deadline = t0 + budgetMs;
  const pcx = Math.floor(player.x / CHUNK_XZ);
  const pcz = Math.floor(player.z / CHUNK_XZ);
  const pendingArr = [...chunkBuildPending];
  pendingArr.sort((ka, kb) => {
    const ca = ka.indexOf(',');
    const cb = kb.indexOf(',');
    const ax = Number(ka.slice(0, ca));
    const az = Number(ka.slice(ca + 1));
    const bx = Number(kb.slice(0, cb));
    const bz = Number(kb.slice(cb + 1));
    const da = (ax - pcx) ** 2 + (az - pcz) ** 2;
    const db = (bx - pcx) ** 2 + (bz - pcz) ** 2;
    return da - db;
  });
  let built = 0;
  for (let i = 0; i < pendingArr.length; i++) {
    if (built >= maxChunks || performance.now() >= deadline) break;
    const bestKey = pendingArr[i];
    if (!chunkBuildPending.has(bestKey)) continue;
    chunkBuildPending.delete(bestKey);
    if (chunkMeshes.has(bestKey)) continue;
    const comma = bestKey.indexOf(',');
    rebuildChunk(Number(bestKey.slice(0, comma)), Number(bestKey.slice(comma + 1)));
    built++;
  }
}

function rebuildChunk(cx, cz) {
  const { x0, x1, z0, z1 } = regionForChunk(cx, cz);
  const { opaque, cutout, water, lava } = buildRegionMesh(world, x0, x1, z0, z1);
  const key = `${cx},${cz}`;
  const old = chunkMeshes.get(key);
  if (old) {
    worldGroup.remove(old.opaque);
    worldGroup.remove(old.cutout);
    if (old.water) worldGroup.remove(old.water);
    if (old.lava) worldGroup.remove(old.lava);
    old.opaque.geometry.dispose();
    old.cutout.geometry.dispose();
    if (old.water) old.water.geometry.dispose();
    if (old.lava) old.lava.geometry.dispose();
  }
  const mo = new THREE.Mesh(opaque, worldMat);
  mo.castShadow = true;
  mo.receiveShadow = true;
  const tieBreak = ((cx * 311 + cz * 173) & 0x1ff) * 1e-4;
  const mc = new THREE.Mesh(cutout, cutoutMat);
  mc.castShadow = false;
  mc.receiveShadow = true;
  mc.renderOrder = 1 + tieBreak;
  const mw = new THREE.Mesh(water, waterMat);
  mw.castShadow = false;
  mw.receiveShadow = true;
  mw.renderOrder = 1 + tieBreak + 0.02;
  const ml = new THREE.Mesh(lava, lavaMat);
  ml.castShadow = false;
  ml.receiveShadow = true;
  ml.renderOrder = 1 + tieBreak + 0.035;
  worldGroup.add(mo, mc, mw, ml);
  chunkMeshes.set(key, { opaque: mo, cutout: mc, water: mw, lava: ml });
  chunkVisibilityEpoch++;
}

function rebuildChunksForBlock(bx, bz) {
  for (const key of chunkKeysForBlock(bx, bz)) {
    const [cx, cz] = key.split(',').map(Number);
    rebuildChunk(cx, cz);
  }
}

/**
 * @param {World} newWorld
 * @param {'spawn' | { pigs: { x: number, y: number, z: number, hp: number }[], cows?: { x: number, y: number, z: number, hp: number }[], squids?: { x: number, y: number, z: number, hp: number }[], drops: { x: number, y: number, z: number, blockId: number, count: number }[] }} [mobData]
 */
function applyWorld(newWorld, mobData = 'spawn') {
  clearMobsFromScene(scene, pigs, cows, squids, drops, zombies);
  disposeAllChunks();
  furnaceStates.clear();
  furnaceOpen = false;
  openFurnaceKey = '';
  furnacePanelEl?.classList.add('hidden');
  furnacePanelEl?.setAttribute('aria-hidden', 'true');
  craftTableOpen = false;
  craftTableGrid = createCraftingGrid3x3();
  craftingTablePanelEl?.classList.add('hidden');
  craftingTablePanelEl?.setAttribute('aria-hidden', 'true');
  world = newWorld;
  resetWeatherEventState(weatherEventState);
  if (seedInput instanceof HTMLInputElement) {
    seedInput.value = String(world.seed);
  }
  lastStreamChunkX = NaN;
  lastStreamChunkZ = NaN;
  player = spawnPlayer();
  resetPlayerVitals();
  syncVisibleChunks(true);
  syncCamera();
  if (mobData && typeof mobData === 'object') {
    restoreMobsFromSave(scene, atlasTex, pigs, cows, squids, drops, mobData, zombies, world);
  } else {
    spawnPigsAroundWorld(world, scene, pigs, 14, player.x, player.z);
    spawnCowsAroundWorld(world, scene, cows, 10, player.x, player.z);
    spawnSquidsInWater(world, scene, squids, 10, player.x, player.z);
  }
}

function spawnPlayer() {
  const sx = 0;
  const sz = 0;
  const sy = world.topSolidY(sx, sz) + 1;
  return new Player(sx + 0.5, sy, sz + 0.5);
}

let player = spawnPlayer();
syncVisibleChunks(true);

let yaw = 0;
let pitch = 0;
const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  /** In water: hold Shift to swim down. */
  swimDown: false,
  sprint: false,
};

let hotbarIndex = 0;
/** @type {import('./inventory.js').InvSlot[]} */
let invSlots = createInventory();
/** @type {import('./inventory.js').InvSlot[]} */
let armorSlots = createArmorSlots();
let craftGrid = createCraftingGrid();
let invOpen = false;

const SMELT_TIME_SEC = 8;
let furnaceOpen = false;
let craftTableOpen = false;
/** @type {number[]} */
let craftTableGrid = createCraftingGrid3x3();

function worldGuiOpen() {
  return furnaceOpen || craftTableOpen;
}

/** @type {string} */
let openFurnaceKey = '';
/**
 * Per-world furnace tile entities: "x,y,z" → slots + timers.
 * @type {Map<string, { input: import('./inventory.js').InvSlot, fuel: import('./inventory.js').InvSlot, output: import('./inventory.js').InvSlot, burnLeft: number, smeltProgress: number }>}
 */
const furnaceStates = new Map();

/* ── Cursor item (Minecraft-style click-to-move inventory) ── */
/** @type {import('./inventory.js').InvSlot} */
let cursorItem = { blockId: 0, count: 0 };

/** Floating DOM element that follows the mouse while holding an item. */
const cursorItemEl = document.createElement('div');
cursorItemEl.className = 'cursor-item';
cursorItemEl.style.display = 'none';
document.getElementById('ui')?.appendChild(cursorItemEl);

function updateCursorItemDisplay() {
  if (isEmptySlot(cursorItem)) {
    cursorItemEl.style.display = 'none';
    return;
  }
  cursorItemEl.style.display = '';
  cursorItemEl.innerHTML = '';
  const sc = document.createElement('canvas');
  sc.width = 32;
  sc.height = 32;
  drawSlotIcon(sc, cursorItem.blockId, cursorItem);
  cursorItemEl.appendChild(sc);
  if (cursorItem.count > 1) {
    const countEl = document.createElement('span');
    countEl.className = 'slot-count';
    countEl.textContent = String(cursorItem.count);
    cursorItemEl.appendChild(countEl);
  }
}

/** @param {MouseEvent} e */
function snapCursorItemElToEvent(e) {
  if (!isEmptySlot(cursorItem)) {
    cursorItemEl.style.left = `${e.clientX}px`;
    cursorItemEl.style.top = `${e.clientY}px`;
  }
}

/** Place cursor item back into inventory (on close / escape). */
function flushCursorToInventory() {
  if (isEmptySlot(cursorItem)) return;
  const hotbarOnly = gameMode === 'creative';
  const leftover = addItemToInventory(invSlots, cursorItem.blockId, cursorItem.count, { hotbarOnly });
  if (hotbarOnly) {
    cursorItem = { blockId: 0, count: 0 };
  } else if (leftover <= 0) {
    cursorItem = { blockId: 0, count: 0 };
  } else {
    cursorItem.count = leftover;
  }
  updateCursorItemDisplay();
}

/**
 * Left-click an inventory slot: swap cursor ↔ slot, or merge same-type stacks.
 * @param {number} slotIdx
 */
function invSlotLeftClick(slotIdx) {
  const slot = invSlots[slotIdx];
  if (isEmptySlot(cursorItem)) {
    // Pick up item from slot
    if (isEmptySlot(slot)) return;
    cursorItem = { blockId: slot.blockId, count: slot.count, meta: slot.meta };
    slot.blockId = 0;
    slot.count = 0;
    delete slot.meta;
  } else if (isEmptySlot(slot)) {
    // Place cursor item into empty slot
    slot.blockId = cursorItem.blockId;
    slot.count = cursorItem.count;
    if (cursorItem.meta !== undefined) slot.meta = cursorItem.meta;
    cursorItem = { blockId: 0, count: 0 };
  } else if (slot.blockId === cursorItem.blockId && !TOOL_INFO[slot.blockId]) {
    // Merge same-type stacks (not tools)
    const canAdd = MAX_STACK - slot.count;
    if (canAdd <= 0) {
      // Stack full — swap
      const tmp = { blockId: slot.blockId, count: slot.count, meta: slot.meta };
      slot.blockId = cursorItem.blockId;
      slot.count = cursorItem.count;
      if (cursorItem.meta !== undefined) slot.meta = cursorItem.meta; else delete slot.meta;
      cursorItem = tmp;
    } else {
      const add = Math.min(cursorItem.count, canAdd);
      slot.count += add;
      cursorItem.count -= add;
      if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
    }
  } else {
    // Different item — swap
    const tmp = { blockId: slot.blockId, count: slot.count, meta: slot.meta };
    slot.blockId = cursorItem.blockId;
    slot.count = cursorItem.count;
    if (cursorItem.meta !== undefined) slot.meta = cursorItem.meta; else delete slot.meta;
    cursorItem = tmp;
  }
  updateCursorItemDisplay();
  refreshInventoryUI();
}

/**
 * Right-click an inventory slot: place 1 from cursor, or pick up half.
 * @param {number} slotIdx
 */
function invSlotRightClick(slotIdx) {
  const slot = invSlots[slotIdx];
  if (isEmptySlot(cursorItem)) {
    // Pick up half the stack
    if (isEmptySlot(slot)) return;
    const take = Math.ceil(slot.count / 2);
    cursorItem = { blockId: slot.blockId, count: take };
    if (slot.meta !== undefined) cursorItem.meta = slot.meta;
    slot.count -= take;
    if (slot.count <= 0) {
      slot.blockId = 0;
      slot.count = 0;
      delete slot.meta;
    }
  } else {
    // Place one item from cursor
    if (TOOL_INFO[cursorItem.blockId]) {
      // Tools: treat right-click same as left-click (can't split tools)
      invSlotLeftClick(slotIdx);
      return;
    }
    if (isEmptySlot(slot)) {
      slot.blockId = cursorItem.blockId;
      slot.count = 1;
      cursorItem.count -= 1;
      if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
    } else if (slot.blockId === cursorItem.blockId && slot.count < MAX_STACK) {
      slot.count += 1;
      cursorItem.count -= 1;
      if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
    } else {
      // Different item — swap (same as left click)
      invSlotLeftClick(slotIdx);
      return;
    }
  }
  updateCursorItemDisplay();
  refreshInventoryUI();
}

/**
 * Shift-click: move whole stack between backpack (0–26) and hotbar (27–35).
 * @param {number} slotIdx
 */
function invSlotShiftClick(slotIdx) {
  if (!isEmptySlot(cursorItem)) return;
  const slot = invSlots[slotIdx];
  if (isEmptySlot(slot)) return;
  const inBackpack = slotIdx < HOTBAR_OFFSET;
  const lo = inBackpack ? HOTBAR_OFFSET : 0;
  const hi = inBackpack ? INV_SIZE - 1 : HOTBAR_OFFSET - 1;
  const bid = slot.blockId;
  const cnt = slot.count;
  const meta = slot.meta;
  const isTool = !!TOOL_INFO[bid];

  for (let i = lo; i <= hi; i++) {
    const t = invSlots[i];
    if (!isTool && t.blockId === bid && t.count < MAX_STACK) {
      const move = Math.min(cnt, MAX_STACK - t.count);
      t.count += move;
      slot.count -= move;
      if (slot.count <= 0) {
        slot.blockId = 0;
        slot.count = 0;
        delete slot.meta;
      }
      refreshInventoryUI();
      return;
    }
  }
  for (let i = lo; i <= hi; i++) {
    if (isEmptySlot(invSlots[i])) {
      invSlots[i].blockId = bid;
      invSlots[i].count = cnt;
      if (meta !== undefined) invSlots[i].meta = meta;
      else delete invSlots[i].meta;
      slot.blockId = 0;
      slot.count = 0;
      delete slot.meta;
      refreshInventoryUI();
      return;
    }
  }
}
/** True after requestPointerLock until lock is acquired — avoids flashing the start menu. */
let pendingPointerLock = false;
let pointerLocked = false;
let lastRay = null;

let lastWKeyUpTime = 0;
/** True after double-tap W until W released or sprint cancelled. */
let sprintLatched = false;
let footstepCooldown = 0;

/** Timestamp of last Space key-up for creative flight double-tap. */
let lastSpaceUpTime = 0;

let playerHealth = MAX_HEALTH;
let playerStamina = MAX_STAMINA;
let playerHunger = MAX_HUNGER;

function resetPlayerVitals() {
  playerHealth = MAX_HEALTH;
  playerStamina = MAX_STAMINA;
  playerHunger = MAX_HUNGER;
  fallCameraShake = 0;
  walkBobEnvelope = 0;
  player.flying = false;
  syncStatBarsVisibility();
  updateStatBarsUI();
}

/** Show/hide stat bars based on game mode. */
function syncStatBarsVisibility() {
  uiRoot?.classList.toggle('game-mode-creative', gameMode === 'creative');
  if (statBarsEl) {
    const hide = gameMode === 'creative';
    statBarsEl.style.display = hide ? 'none' : '';
    statBarsEl.setAttribute('aria-hidden', hide ? 'true' : 'false');
  }
}

function updateStatBarsUI() {
  const h = Math.max(0, Math.min(1, playerHealth / MAX_HEALTH));
  const s = Math.max(0, Math.min(1, playerStamina / MAX_STAMINA));
  const f = Math.max(0, Math.min(1, playerHunger / MAX_HUNGER));
  healthFill.style.transform = `scaleX(${h})`;
  staminaFill.style.transform = `scaleX(${s})`;
  if (hungerFill) hungerFill.style.transform = `scaleX(${f})`;
}

const ZOMBIE_DESPAWN_DAYLIGHT = true;
let mobRespawnTimer = 0;

let playerDead = false;

function showToast(msg, durationMs = 2500) {
  if (!toastContainer) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  el.style.animationDuration = `${durationMs}ms`;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), durationMs + 100);
}

function showDeathScreen(reason) {
  closeOverlayPanelsForMenuOrDeath();
  playerDead = true;
  if (deathReason) deathReason.textContent = reason;
  deathScreen?.classList.remove('hidden');
  deathScreen?.setAttribute('aria-hidden', 'false');
  document.exitPointerLock();
  requestAnimationFrame(() => respawnBtn?.focus());
}

function hideDeathScreen() {
  playerDead = false;
  deathScreen?.classList.add('hidden');
  deathScreen?.setAttribute('aria-hidden', 'true');
}

function doRespawn() {
  hideDeathScreen();
  craftGrid = createCraftingGrid();
  craftTableGrid = createCraftingGrid3x3();
  invSlots = gameMode === 'creative' ? createCreativeInventory() : createInventory();
  armorSlots = createArmorSlots();
  refreshInventoryUI();
  player = spawnPlayer();
  resetPlayerVitals();
  lastStreamChunkX = NaN;
  lastStreamChunkZ = NaN;
  syncVisibleChunks(true);
  syncCamera();
  pendingPointerLock = true;
  canvas.requestPointerLock();
}

function canSprintNow() {
  return (
    pointerLocked &&
    !invOpen &&
    !worldGuiOpen() &&
    sprintLatched &&
    keys.forward &&
    (gameMode === 'creative' || playerStamina > 0.5)
  );
}

function eyePos() {
  return new THREE.Vector3(
    player.x,
    player.y + player.eyeHeight,
    player.z,
  );
}

function syncPlayerModel(dt) {
  playerModel.position.set(player.x, player.y, player.z);
  playerModel.rotation.y = yaw;
  const moving =
    (pointerLocked || invOpen) &&
    !worldGuiOpen() &&
    (keys.forward || keys.back || keys.left || keys.right);
  const walking =
    moving && player.onGround && Math.hypot(player.vx, player.vz) > 0.1;
  const sprinting =
    canSprintNow() && player.onGround && !player.inWater && !player.inLava;
  if (playerModel.visible) {
    updatePlayerModelAnimation(playerModel, dt, { walking, sprinting });
  }
  const slot = invSlots[HOTBAR_OFFSET + hotbarIndex];
  const heldId = isEmptySlot(slot) ? 0 : slot.blockId;
  updateThirdPersonHeldBlock(playerModel, heldId, leftHanded);
}

const clock = new THREE.Clock();

/**
 * @param {number} [dtSec] delta time for bob smoothing; 0 skips envelope update.
 */
function syncCamera(dtSec = 0) {
  const e = eyePos();
  const fx = -Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * Math.cos(pitch);
  let px;
  let py;
  let pz;
  if (cameraViewMode === 0) {
    px = e.x;
    py = e.y;
    pz = e.z;
  } else if (cameraViewMode === 1) {
    px = e.x - fx * VIEW_BACK_DIST;
    py = e.y - fy * VIEW_BACK_DIST;
    pz = e.z - fz * VIEW_BACK_DIST;
  } else {
    px = e.x + fx * VIEW_FRONT_DIST;
    py = e.y + fy * VIEW_FRONT_DIST;
    pz = e.z + fz * VIEW_FRONT_DIST;
  }

  if (dtSec > 0) {
    const fp = cameraViewMode === 0 && (pointerLocked || invOpen) && !worldGuiOpen();
    const movingKeys = keys.forward || keys.back || keys.left || keys.right;
    const horizSpd = Math.hypot(player.vx, player.vz);
    const wantBob =
      fp &&
      movingKeys &&
      player.onGround &&
      !player.inWater &&
      !player.inLava &&
      horizSpd > 0.08;
    const bobTarget = wantBob ? 1 : 0;
    const k = Math.min(1, dtSec * WALK_BOB_LERP);
    walkBobEnvelope += (bobTarget - walkBobEnvelope) * k;
    if (walkBobEnvelope < 0.002) walkBobEnvelope = 0;
  }

  if (gameSettings.viewBobbing && walkBobEnvelope > 0.01 && cameraViewMode === 0) {
    const sprinting =
      canSprintNow() && player.onGround && !player.inWater && !player.inLava;
    const freq = sprinting ? SPRINT_BOB_FREQ : WALK_BOB_FREQ;
    const ampMul = sprinting ? SPRINT_BOB_MUL : 1;
    const t = clock.getElapsedTime();
    const ph = t * freq;
    const env = walkBobEnvelope * ampMul;
    const vert = Math.sin(ph) * WALK_BOB_VERT * env;
    const lat = Math.cos(ph * 2) * WALK_BOB_LAT * env;

    _shakeView.set(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    _shakeRight.crossVectors(_worldUp, _shakeView);
    if (_shakeRight.lengthSq() < 1e-8) _shakeRight.set(1, 0, 0);
    else _shakeRight.normalize();
    _shakeUp.crossVectors(_shakeView, _shakeRight).normalize();

    px += _shakeRight.x * lat + _shakeUp.x * vert;
    py += _shakeRight.y * lat + _shakeUp.y * vert;
    pz += _shakeRight.z * lat + _shakeUp.z * vert;
  }

  const s = fallCameraShake;
  if (gameSettings.cameraShake && s > 1e-6) {
    const t = clock.getElapsedTime();
    _shakeView.set(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    _shakeRight.crossVectors(_worldUp, _shakeView);
    if (_shakeRight.lengthSq() < 1e-8) _shakeRight.set(1, 0, 0);
    else _shakeRight.normalize();
    _shakeUp.crossVectors(_shakeView, _shakeRight).normalize();

    const h = s * 0.19;
    const v = s * 0.16;
    const f = s * 0.06;
    const ox =
      h *
      (Math.sin(t * 41) * 0.55 + Math.sin(t * 27 + 0.9) * 0.45 + Math.sin(t * 63) * 0.12);
    const oy =
      v * (Math.cos(t * 35) * 0.5 + Math.sin(t * 49 + 1.1) * 0.5 + Math.sin(t * 71) * 0.1);
    const oz = f * (Math.sin(t * 31 + 0.4) * 0.7 + Math.cos(t * 44) * 0.3);

    px += _shakeRight.x * ox + _shakeUp.x * oy + _shakeView.x * oz;
    py += _shakeRight.y * ox + _shakeUp.y * oy + _shakeView.y * oz;
    pz += _shakeRight.z * ox + _shakeUp.z * oy + _shakeView.z * oz;
  }

  camera.position.set(px, py, pz);
  if (cameraViewMode === 2) {
    camera.lookAt(player.x, player.y + 0.92, player.z);
  } else {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }
}

/** @type {'break' | 'place' | null} */
let fpHandSwingKind = null;
let fpHandSwingStart = 0;
const FP_HAND_SWING_BREAK = 0.24;
const FP_HAND_SWING_PLACE = 0.3;

function triggerFpHandSwing(kind) {
  fpHandSwingKind = kind;
  fpHandSwingStart = clock.getElapsedTime();
}

/** @returns {import('./firstPersonHand.js').HandSwingState | null} */
function getFpHandSwing() {
  if (!fpHandSwingKind) return null;
  const dur = fpHandSwingKind === 'break' ? FP_HAND_SWING_BREAK : FP_HAND_SWING_PLACE;
  let t = (clock.getElapsedTime() - fpHandSwingStart) / dur;
  if (t >= 1) {
    fpHandSwingKind = null;
    return null;
  }
  if (t < 0) t = 0;
  return { kind: fpHandSwingKind, t };
}

function syncFirstPersonHandView() {
  const swing = getFpHandSwing();
  const show = cameraViewMode === 0 && pointerLocked && !invOpen && !worldGuiOpen();
  fpHand.visible = show;
  const slot = invSlots[HOTBAR_OFFSET + hotbarIndex];
  const heldId = isEmptySlot(slot) ? 0 : slot.blockId;
  updateFirstPersonHeldBlock(fpHand, heldId, leftHanded);
  if (show) {
    syncFirstPersonHand(camera, fpHand, leftHanded, swing);
  }
}

syncPlayerModel(0);
syncCamera();
syncFirstPersonHandView();
syncStatBarsVisibility();
updateStatBarsUI();

/** Java Edition overworld: 24000 ticks per full cycle, 20 ticks per real second → 20 min per day. */
const MC_DAY_TICKS = 24000;
const MC_TICKS_PER_REAL_SECOND = 20;
/** Starting world time (ticks); 6000 ≈ noon, 7440 ≈ prior default phase (~0.31 of cycle). */
let worldTimeTicks = 7440;

/** Smoothed biome-driven weather (updated in {@link updateDayNight}). */
let weatherDisplay = {
  kind: 'clear',
  strength: 0,
  fogAdd: 0,
  skyDim: 0,
  cloudDarken: 0,
  biome: 0,
};

/** Random ramp-in / hold / fade-out storms on top of {@link sampleWeather}. */
const weatherEventState = createWeatherEventState();

const _palNightSky = new THREE.Color().setHSL(0.62, 0.55, 0.075);
const _palDaySky = new THREE.Color().setHSL(0.54, 0.42, 0.62);
const _palSunset = new THREE.Color().setHSL(0.045, 0.78, 0.52);
const _palDuskBand = new THREE.Color().setHSL(0.72, 0.42, 0.14);

/** Smoothed outdoor light multipliers — depth below nominal terrain dims sun/moon/hemi (see {@link computeCaveLightFactors}). */
let caveSunMoonMulSm = 1;
let caveHemiMulSm = 1;

function updateDayNight(dt) {
  worldTimeTicks =
    (worldTimeTicks + dt * MC_TICKS_PER_REAL_SECOND) % MC_DAY_TICKS;
  const timeOfDay = worldTimeTicks / MC_DAY_TICKS;
  const sunAngle = timeOfDay * Math.PI * 2;
  const cx = 0;
  const cz = 0;
  const px = player.x - cx;
  const pz = player.z - cz;
  const orbitR = 92;
  sun.position.set(
    cx + Math.cos(sunAngle) * orbitR + px,
    Math.sin(sunAngle) * orbitR,
    cz + Math.sin(sunAngle * 0.85) * orbitR * 0.32 + pz,
  );

  const sunH = sun.position.y / orbitR;

  const dayF = THREE.MathUtils.clamp((sunH + 0.22) / 0.44, 0, 1);
  const nightF = 1 - dayF;
  currentNightF = nightF;

  const baseWx = sampleWeather(world, player.x, player.z, worldTimeTicks, dayF);
  tickWeatherEvents(weatherEventState, dt, baseWx.biome, dayF);
  const targetWx = mergeWeatherEventBase(baseWx, weatherEventState, dayF);
  weatherDisplay = smoothWeatherSample(weatherDisplay, targetWx, dt);

  const sunsetT =
    THREE.MathUtils.smoothstep(sunH, -0.12, 0.06) *
    (1 - THREE.MathUtils.smoothstep(sunH, 0.1, 0.38));

  _skyScratch.copy(_palNightSky).lerp(_palDaySky, dayF);
  _skyScratch.lerp(_palSunset, sunsetT * 0.78);
  _skyScratch.lerp(_palDuskBand, nightF * sunsetT * 0.42);
  const sd = weatherDisplay.skyDim;
  if (sd > 0.001) {
    _weatherGray.setRGB(0.52, 0.56, 0.6);
    _skyScratch.lerp(_weatherGray, sd);
  }
  scene.background.copy(_skyScratch);

  _fogTint.setHex(0x151a2b);
  scene.fog.color.copy(_skyScratch).lerp(_fogTint, nightF * 0.38);
  scene.fog.color.lerp(_weatherFogMist, weatherDisplay.skyDim * 0.26);
  if (scene.fog instanceof THREE.FogExp2) {
    const dayD = 0.0098;
    const nightD = 0.0162;
    scene.fog.density = dayD + nightF * (nightD - dayD) + weatherDisplay.fogAdd;
  }

  const sunVis = THREE.MathUtils.smoothstep(sunH, -0.1, 0.05);
  const wk = weatherDisplay.kind;
  const ws = weatherDisplay.strength;
  let stormDim = 0;
  if (wk === 'rain' || wk === 'snow') stormDim = ws * 0.36;
  else if (wk === 'dust') stormDim = ws * 0.2;
  else if (wk === 'mist') stormDim = ws * 0.14;
  sun.intensity = sunVis * 1.08 * (1 - stormDim);
  sun.color.setHSL(0.095, 0.42 + sunVis * 0.28, 0.88 - nightF * 0.12);

  const moonVis = THREE.MathUtils.smoothstep(-sunH, -0.04, 0.2);
  moon.intensity = moonVis * 0.52 * (1 - stormDim * 0.55);
  moon.color.setHSL(0.62, 0.35, 0.72 + moonVis * 0.12);

  sun.target.position.set(cx + px, _worldDayCenter.y, cz + pz);
  moon.target.position.copy(sun.target);
  _moonPosScratch.copy(sun.target).multiplyScalar(2).sub(sun.position);
  moon.position.copy(_moonPosScratch);

  hemi.intensity = (0.28 + dayF * 0.54) * (1 - stormDim * 0.22);
  hemi.color.setHSL(0.56, 0.38 + dayF * 0.18, 0.42 + dayF * 0.32);
  hemi.groundColor.setHSL(0.2, 0.22 + dayF * 0.2, 0.14 + dayF * 0.32);

  const cave = computeCaveLightFactors(
    player.y + player.eyeHeight,
    Math.floor(player.x),
    Math.floor(player.z),
    world.seed,
  );
  const caveK = Math.min(1, dt * 3.4);
  caveSunMoonMulSm += (cave.sunMoonMul - caveSunMoonMulSm) * caveK;
  caveHemiMulSm += (cave.hemiMul - caveHemiMulSm) * caveK;
  sun.intensity *= caveSunMoonMulSm;
  moon.intensity *= caveSunMoonMulSm;
  hemi.intensity *= caveHemiMulSm;

  const allowShadow = gameSettings.shadowsEnabled;
  sun.castShadow = allowShadow && sunVis > 0.1;
  moon.castShadow = allowShadow && moonVis > 0.08 && sunVis < 0.2;

  celestialSunVis = sunVis;
  celestialMoonVis = moonVis;

  syncCelestialDiscs();
  tickCloudLayer(cloudLayer, dt, dayF, nightF, weatherDisplay.cloudDarken);

  const starMat = starField.material;
  if (starMat instanceof THREE.PointsMaterial) {
    starMat.opacity = nightF * 0.92;
  }
}

updateDayNight(0);
syncCloudLayerPosition(cloudLayer, camera);

function getHotbarHeldToolId() {
  const slot = invSlots[HOTBAR_OFFSET + hotbarIndex];
  if (isEmptySlot(slot)) return 0;
  const info = TOOL_INFO[slot.blockId];
  if (!info) return slot.blockId;
  const max = info.durability;
  const cur = slot.meta !== undefined ? slot.meta : max;
  return cur > 0 ? slot.blockId : 0;
}

function updateSelection() {
  const { ox, oy, oz, dx, dy, dz } = getInteractionRayOriginAndDir();
  lastRay = raycastBlocks(world, ox, oy, oz, dx, dy, dz, REACH);
  if (lastRay) {
    const { x, y, z } = lastRay.hit;
    const id = world.get(x, y, z);
    const key = `${x},${y},${z},${id}`;
    if (key !== selectionOutlineKey) {
      selectionOutlineKey = key;
      const nextGeom = buildSelectionOutlineGeometry(world, x, y, z, id, atlasDrawSource);
      selection.geometry.dispose();
      selection.geometry = nextGeom;
    }
    selection.visible = true;
    selection.position.set(0, 0, 0);
  } else {
    selectionOutlineKey = '';
    selection.visible = false;
  }
}

function getHeldAttackDamage() {
  const heldId = getHotbarHeldToolId();
  const tool = TOOL_INFO[heldId];
  return tool ? tool.damage : PIG_PUNCH_DAMAGE;
}

function damageHeldToolForMining() {
  const idx = HOTBAR_OFFSET + hotbarIndex;
  const slot = invSlots[idx];
  if (!TOOL_INFO[slot.blockId]) return;
  const broke = damageToolInSlot(slot, 1);
  if (broke) showToast('Tool broke');
}

function damageHeldToolMelee() {
  if (gameMode === 'creative') return;
  const idx = HOTBAR_OFFSET + hotbarIndex;
  const slot = invSlots[idx];
  const t = TOOL_INFO[slot.blockId];
  if (!t || t.type !== 'sword') return;
  const broke = damageToolInSlot(slot, 1);
  refreshInventoryUI();
  if (broke) showToast('Sword broke');
}

function tryHitMob() {
  const { ox, oy, oz, dx, dy, dz } = getInteractionRayOriginAndDir();
  const pigHit = raycastNearestPigWithT(ox, oy, oz, dx, dy, dz, REACH, pigs);
  const cowHit = raycastNearestCowWithT(ox, oy, oz, dx, dy, dz, REACH, cows);
  const squidHit = raycastNearestSquidWithT(ox, oy, oz, dx, dy, dz, REACH, squids);
  const zombieHit = raycastNearestZombieWithT(ox, oy, oz, dx, dy, dz, REACH, zombies);
  const blockHit = raycastBlocks(world, ox, oy, oz, dx, dy, dz, REACH);
  const pigT = pigHit ? pigHit.t : Infinity;
  const cowT = cowHit ? cowHit.t : Infinity;
  const squidT = squidHit ? squidHit.t : Infinity;
  const zombieT = zombieHit ? zombieHit.t : Infinity;
  const blockT = blockHit ? blockHit.t : Infinity;
  const mobT = Math.min(pigT, cowT, squidT, zombieT);
  if (mobT <= blockT) {
    const dmg = getHeldAttackDamage();
    if (zombieHit && zombieT <= pigT && zombieT <= cowT && zombieT <= squidT) {
      damageZombie(scene, zombies, dmg, zombieHit.zombie, dx, dz);
      damageHeldToolMelee();
    } else if (pigHit && pigT <= cowT && pigT <= squidT) {
      damageNearestPig(scene, pigs, dmg, atlasTex, drops, pigHit.pig, dx, dz);
      damageHeldToolMelee();
    } else if (cowHit && cowT <= squidT) {
      damageNearestCow(scene, cows, dmg, atlasTex, drops, cowHit.cow, dx, dz);
      damageHeldToolMelee();
    } else if (squidHit) {
      damageSquid(scene, squids, dmg, atlasTex, drops, squidHit.squid, dx, dz);
      damageHeldToolMelee();
    }
    triggerFpHandSwing('break');
    playSound('break');
    return true;
  }
  return false;
}

function completeBlockBreak(x, y, z) {
  const blockId = world.get(x, y, z);
  if (blockId === 0 || BLOCKS[blockId]?.indestructible) return;
  if (blockId === BlockId.FURNACE) {
    const fk = furnaceKey(x, y, z);
    const fs = furnaceStates.get(fk);
    if (fs) {
      for (const part of ['input', 'fuel', 'output']) {
        const s = fs[part];
        if (!isEmptySlot(s)) {
          addItemToInventory(invSlots, s.blockId, s.count, {
            hotbarOnly: gameMode === 'creative',
          });
        }
      }
      furnaceStates.delete(fk);
    }
  }
  if (blockId === BlockId.CRAFTING_TABLE) {
    flushCraftTableGridToInventory();
    if (craftTableOpen) {
      craftTableOpen = false;
      craftingTablePanelEl?.classList.add('hidden');
      craftingTablePanelEl?.setAttribute('aria-hidden', 'true');
      updateCursorItemDisplay();
      pendingPointerLock = true;
    }
  }
  const wasWater = blockId === BlockId.WATER;
  if (blockId === BlockId.DOOR || blockId === BlockId.DOOR_OPEN) {
    const t = world.get(x, y + 1, z);
    if (t === BlockId.DOOR_TOP || t === BlockId.DOOR_OPEN_TOP) {
      world.set(x, y + 1, z, 0);
      if (gameSettings.blockBreakParticles) addBlockBreakBurst(scene, x, y + 1, z, t);
    }
  }
  if (blockId === BlockId.DOOR_TOP || blockId === BlockId.DOOR_OPEN_TOP) {
    const b = world.get(x, y - 1, z);
    if (b === BlockId.DOOR || b === BlockId.DOOR_OPEN) {
      world.set(x, y - 1, z, 0);
      if (gameSettings.blockBreakParticles) addBlockBreakBurst(scene, x, y - 1, z, b);
    }
  }
  if (blockId === BlockId.TALL_GRASS_BOTTOM) {
    const t = world.get(x, y + 1, z);
    if (t === BlockId.TALL_GRASS_TOP) {
      world.set(x, y + 1, z, 0);
      if (gameSettings.blockBreakParticles) addBlockBreakBurst(scene, x, y + 1, z, t);
    }
  }
  if (blockId === BlockId.TALL_GRASS_TOP) {
    const b = world.get(x, y - 1, z);
    if (b === BlockId.TALL_GRASS_BOTTOM) {
      world.set(x, y - 1, z, 0);
      if (gameSettings.blockBreakParticles) addBlockBreakBurst(scene, x, y - 1, z, b);
    }
  }
  world.set(x, y, z, 0);
  if (gameSettings.blockBreakParticles) addBlockBreakBurst(scene, x, y, z, blockId);
  const rebuildCols = new Set([`${x},${z}`]);
  if (needsWaterRecomputeAfterBreak(world, x, y, z, wasWater)) {
    for (const c of recomputeWaterAround(world, x, y, z)) {
      rebuildCols.add(`${c.x},${c.z}`);
    }
  }
  for (const key of rebuildCols) {
    const [cx, cz] = key.split(',').map(Number);
    rebuildChunksForBlock(cx, cz);
  }
  if (gameMode === 'survival') {
    const drop = getBlockDrop(blockId);
    if (drop.count > 0 && canPickupBlock(drop.blockId)) {
      const spread = 0.35;
      const gd = createGroundDrop(
        x + 0.5 + (Math.random() - 0.5) * spread,
        y + 0.2,
        z + 0.5 + (Math.random() - 0.5) * spread,
        drop.blockId,
        drop.count,
        atlasTex,
        world
      );
      gd.vy = -(1.8 + Math.random() * 1.4);
      scene.add(gd.mesh);
      drops.push(gd);
    }
    damageHeldToolForMining();
  }
  refreshInventoryUI();
  triggerFpHandSwing('break');
  playSound('break');
}

function updateMining(dt) {
  if (!mouseLeftDown || !pointerLocked || invOpen || worldGuiOpen() || playerDead) {
    miningBlock = null;
    miningProgress = 0;
    crackMesh.visible = false;
    return;
  }
  const { ox, oy, oz, dx, dy, dz } = getInteractionRayOriginAndDir();
  const blockHit = raycastBlocks(world, ox, oy, oz, dx, dy, dz, REACH);
  if (!blockHit) {
    miningBlock = null;
    miningProgress = 0;
    crackMesh.visible = false;
    return;
  }
  const { x, y, z } = blockHit.hit;
  const blockId = world.get(x, y, z);
  if (blockId === 0 || BLOCKS[blockId]?.indestructible) {
    miningBlock = null;
    miningProgress = 0;
    crackMesh.visible = false;
    return;
  }
  const key = `${x},${y},${z}`;
  if (miningBlock !== key) {
    miningBlock = key;
    miningProgress = 0;
    const heldId = getHotbarHeldToolId();
    miningTimeForBlock = getMineTime(blockId, heldId);
  }
  miningProgress += dt;
  const frac = Math.min(miningProgress / miningTimeForBlock, 1);
  crackMesh.visible = true;
  crackMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  crackMat.opacity = frac * 0.45;
  if (miningProgress >= miningTimeForBlock) {
    completeBlockBreak(x, y, z);
    miningBlock = null;
    miningProgress = 0;
    crackMesh.visible = false;
  }
}

/**
 * Torch: place in the air cell {@link raycastBlocks} crossed immediately before the solid hit
 * — that cell touches the exact face clicked. Attachment follows support − torch.
 * @returns {boolean} true if a torch was placed
 */
function tryPlaceTorch() {
  if (!lastRay) return false;
  const slotIdx = HOTBAR_OFFSET + hotbarIndex;
  const slot = invSlots[slotIdx];
  if (isEmptySlot(slot) || slot.blockId !== BlockId.TORCH) return false;
  const { hit, prev } = lastRay;
  const hx = hit.x;
  const hy = hit.y;
  const hz = hit.z;
  const px = prev.x;
  const py = prev.y;
  const pz = prev.z;

  const supportId = world.get(hx, hy, hz);
  const supportDef = BLOCKS[supportId];
  if (!supportDef || supportDef.fluid) return false;
  if (!supportDef.solid && !supportDef.torch) return false;

  if (!world.inBounds(px, py, pz)) return false;
  if (world.get(px, py, pz) !== 0) return false;
  /* Must be face-adjacent (same as a single ray step into the solid). */
  const manh =
    Math.abs(px - hx) + Math.abs(py - hy) + Math.abs(pz - hz);
  if (manh !== 1) return false;

  const bestAtt = torchSupportDeltaToAttach(hx - px, hy - py, hz - pz);

  const hw = player.halfW + 0.01;
  const playerMinX = player.x - hw;
  const playerMaxX = player.x + hw;
  const playerMinZ = player.z - hw;
  const playerMaxZ = player.z + hw;
  const playerMinY = player.y;
  const playerMaxY = player.y + player.height;
  if (
    playerMaxX > px && playerMinX < px + 1 &&
    playerMaxZ > pz && playerMinZ < pz + 1 &&
    playerMaxY > py && playerMinY < py + 1
  ) {
    return false;
  }

  world.set(px, py, pz, BlockId.TORCH);
  world.setTorchAttach(px, py, pz, bestAtt);
  rebuildChunksForBlock(px, pz);
  if (gameMode === 'survival') {
    consumeFromSlot(invSlots, slotIdx, 1);
  }
  refreshInventoryUI();
  triggerFpHandSwing('place');
  playSound('place');
  return true;
}

function tryPlace() {
  if (!lastRay) return;
  const slotIdx = HOTBAR_OFFSET + hotbarIndex;
  if (isEmptySlot(invSlots[slotIdx])) return;
  const id = invSlots[slotIdx].blockId;
  if (id === BlockId.TORCH) {
    tryPlaceTorch();
    return;
  }
  if (BLOCKS[id]?.placeable === false) return;
  const { x, y, z } = lastRay.prev;
  if (!world.inBounds(x, y, z)) return;
  if (world.get(x, y, z) !== 0) return;

  if (id === BlockId.DOOR) {
    if (y + 1 >= world.height) return;
    if (world.get(x, y + 1, z) !== 0) return;
    const { hit, prev } = lastRay;
    const dx = hit.x - prev.x;
    const dz = hit.z - prev.z;
    let facing = 0;
    if (dx === 1) facing = 0;
    else if (dx === -1) facing = 1;
    else if (dz === 1) facing = 2;
    else if (dz === -1) facing = 3;
    else return;
    const cx = x + 0.5;
    const cz = z + 0.5;
    const vx = player.x - cx;
    const vz = player.z - cz;
    const nx = -dx;
    const nz = -dz;
    const cross = nx * vz - nz * vx;
    const hingeRight = cross > 0;
    const meta = facing | (hingeRight ? 4 : 0);
    world.set(x, y, z, BlockId.DOOR);
    world.set(x, y + 1, z, BlockId.DOOR_TOP);
    world.setDoorMeta(x, y, z, meta);
    rebuildChunksForBlock(x, z);
    if (gameMode === 'survival') {
      consumeFromSlot(invSlots, slotIdx, 1);
    }
    refreshInventoryUI();
    triggerFpHandSwing('place');
    playSound('place');
    return;
  }

  if (id === BlockId.SHORT_GRASS) {
    const below = world.get(x, y - 1, z);
    if (below !== BlockId.GRASS && below !== BlockId.DIRT) return;
    world.set(x, y, z, BlockId.SHORT_GRASS);
    rebuildChunksForBlock(x, z);
    if (gameMode === 'survival') {
      consumeFromSlot(invSlots, slotIdx, 1);
    }
    refreshInventoryUI();
    triggerFpHandSwing('place');
    playSound('place');
    return;
  }

  if (id === BlockId.TALL_GRASS_BOTTOM) {
    if (y + 1 >= world.height) return;
    if (world.get(x, y + 1, z) !== 0) return;
    const below = world.get(x, y - 1, z);
    if (below !== BlockId.GRASS && below !== BlockId.DIRT) return;
    world.set(x, y, z, BlockId.TALL_GRASS_BOTTOM);
    world.set(x, y + 1, z, BlockId.TALL_GRASS_TOP);
    rebuildChunksForBlock(x, z);
    if (gameMode === 'survival') {
      consumeFromSlot(invSlots, slotIdx, 1);
    }
    refreshInventoryUI();
    triggerFpHandSwing('place');
    playSound('place');
    return;
  }

  const hw = player.halfW + 0.01;
  const playerMinX = player.x - hw;
  const playerMaxX = player.x + hw;
  const playerMinZ = player.z - hw;
  const playerMaxZ = player.z + hw;
  const playerMinY = player.y;
  const playerMaxY = player.y + player.height;
  if (
    playerMaxX > x && playerMinX < x + 1 &&
    playerMaxZ > z && playerMinZ < z + 1 &&
    playerMaxY > y && playerMinY < y + 1
  ) {
    return;
  }

  world.set(x, y, z, id);
  rebuildChunksForBlock(x, z);
  if (id === BlockId.WATER) {
    const affected = recomputeWaterAround(world, x, y, z);
    const rebuilt = new Set();
    rebuilt.add(`${x},${z}`);
    for (const a of affected) {
      const key = `${a.x},${a.z}`;
      if (!rebuilt.has(key)) {
        rebuilt.add(key);
        rebuildChunksForBlock(a.x, a.z);
      }
    }
  }
  if (gameMode === 'survival') {
    consumeFromSlot(invSlots, slotIdx, 1);
  }
  refreshInventoryUI();
  triggerFpHandSwing('place');
  playSound('place');
}

function tryEat() {
  const slotIdx = HOTBAR_OFFSET + hotbarIndex;
  const slot = invSlots[slotIdx];
  if (isEmptySlot(slot)) return false;
  const isPork = slot.blockId === BlockId.PORKCHOP;
  const isBeef = slot.blockId === BlockId.BEEF;
  const isRotten = slot.blockId === BlockId.ROTTEN_FLESH;
  if (!isPork && !isBeef && !isRotten) return false;
  if (gameMode === 'creative') return false;
  if (playerHunger >= MAX_HUNGER) {
    showToast('Not hungry');
    return false;
  }
  const hungerAmt = isRotten ? 14 : isBeef ? BEEF_HUNGER_RESTORE : PORKCHOP_HUNGER_RESTORE;
  consumeFromSlot(invSlots, slotIdx, 1);
  playerHunger = Math.min(MAX_HUNGER, playerHunger + hungerAmt);
  updateStatBarsUI();
  refreshInventoryUI();
  const label = isRotten ? 'Ate Rotten Flesh' : isBeef ? 'Ate Beef' : 'Ate Porkchop';
  showToast(`${label} (+${hungerAmt} hunger)`);
  playSound('eat');
  return true;
}

/**
 * @param {HTMLCanvasElement} c
 * @param {number} blockId
 */
function tryInteractArmorSlot(armorIndex) {
  const hi = HOTBAR_OFFSET + hotbarIndex;
  const hot = invSlots[hi];
  const arm = armorSlots[armorIndex];

  if (isEmptySlot(hot) && !isEmptySlot(arm)) {
    hot.blockId = arm.blockId;
    hot.count = arm.count;
    arm.blockId = 0;
    arm.count = 0;
    refreshInventoryUI();
    return;
  }

  if (!isEmptySlot(hot) && armorSlotForBlock(hot.blockId) === armorIndex) {
    const prev = { blockId: arm.blockId, count: arm.count };
    arm.blockId = hot.blockId;
    arm.count = 1;
    hot.count -= 1;
    if (hot.count <= 0) {
      hot.blockId = 0;
      hot.count = 0;
    }
    if (!isEmptySlot(prev)) {
      addItemToInventory(invSlots, prev.blockId, prev.count, {
        hotbarOnly: gameMode === 'creative',
      });
    }
    refreshInventoryUI();
  }
}

/**
 * @param {number} armorIndex 0–3
 */
function createArmorSlotElement(armorIndex) {
  const slot = armorSlots[armorIndex];
  const bid = slot.blockId;
  const wrap = document.createElement('div');
  wrap.className = 'slot slot-armor';
  wrap.role = 'button';
  wrap.tabIndex = 0;
  const titleBase = ARMOR_SLOT_TITLES[armorIndex] ?? 'Armor';
  wrap.title =
    titleBase +
    (bid > 0
      ? ` — ${displayBlockName(bid)}`
      : ' (empty — select Glass / Cobble / Planks / Sand on hotbar to equip)');
  const sc = document.createElement('canvas');
  sc.width = 32;
  sc.height = 32;
  drawSlotIcon(sc, bid, slot);
  const countEl = document.createElement('span');
  countEl.className = 'slot-count';
  if (!isEmptySlot(slot) && slot.count > 1) countEl.textContent = String(slot.count);
  wrap.appendChild(sc);
  wrap.appendChild(countEl);
  const activate = () => tryInteractArmorSlot(armorIndex);
  wrap.addEventListener('click', (e) => {
    e.preventDefault();
    activate();
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      activate();
    }
  });
  return wrap;
}

function refreshArmorRail() {
  if (!invArmorRail) return;
  invArmorRail.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    invArmorRail.appendChild(createArmorSlotElement(i));
  }
}

/**
 * @param {import('./inventory.js').InvSlot | null} [slot]
 */
function drawSlotIcon(c, blockId, slot = null) {
  const sctx = c.getContext('2d');
  if (!sctx) return;
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = '#373737';
  sctx.fillRect(0, 0, 32, 32);
  if (blockId > 0 && BLOCKS[blockId] && atlasDrawSource) {
    const [tx, ty] = BLOCKS[blockId].top;
    sctx.drawImage(atlasDrawSource, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX, 0, 0, 32, 32);
  }
  const ti = TOOL_INFO[blockId];
  if (ti && slot && !isEmptySlot(slot)) {
    const max = ti.durability;
    const cur = slot.meta !== undefined ? slot.meta : max;
    const t = Math.max(0, Math.min(1, cur / max));
    sctx.fillStyle = '#1a1a1a';
    sctx.fillRect(2, 26, 28, 4);
    sctx.fillStyle = t > 0.25 ? '#3a9a3a' : t > 0.1 ? '#c9a019' : '#a02828';
    sctx.fillRect(2, 26, Math.max(0, Math.floor(28 * t)), 4);
  }
}

function furnaceKey(x, y, z) {
  return `${x},${y},${z}`;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function getOrCreateFurnaceState(x, y, z) {
  const k = furnaceKey(x, y, z);
  if (!furnaceStates.has(k)) {
    furnaceStates.set(k, {
      input: { blockId: 0, count: 0 },
      fuel: { blockId: 0, count: 0 },
      output: { blockId: 0, count: 0 },
      burnLeft: 0,
      smeltProgress: 0,
    });
  }
  return furnaceStates.get(k);
}

function serializeFurnaceStatesForSave() {
  const out = [];
  for (const [k, fs] of furnaceStates) {
    const parts = k.split(',').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) continue;
    const [x, y, z] = parts;
    if (world.get(x, y, z) !== BlockId.FURNACE) continue;
    const slotJson = (s) => {
      const o = { blockId: s.blockId, count: s.count };
      if (s.meta !== undefined && typeof s.meta === 'number') o.meta = s.meta;
      return o;
    };
    out.push({
      k,
      input: slotJson(fs.input),
      fuel: slotJson(fs.fuel),
      output: slotJson(fs.output),
      burnLeft: fs.burnLeft,
      smeltProgress: fs.smeltProgress,
    });
  }
  return out;
}

function canFurnaceSmelt(fs) {
  const inId = fs.input.blockId;
  const outId = SMELTING_RECIPES[inId];
  if (!outId || isEmptySlot(fs.input)) return false;
  if (isEmptySlot(fs.output)) return true;
  return fs.output.blockId === outId && fs.output.count < MAX_STACK;
}

function tryConsumeOneFuel(fs) {
  if (isEmptySlot(fs.fuel)) return false;
  const t = FUEL_BURN_TIME[fs.fuel.blockId];
  if (t === undefined) return false;
  fs.fuel.count -= 1;
  if (fs.fuel.count <= 0) {
    fs.fuel.blockId = 0;
    fs.fuel.count = 0;
  }
  fs.burnLeft += t;
  return true;
}

function tickFurnace(fs, dt) {
  if (!canFurnaceSmelt(fs)) {
    return;
  }
  if (fs.burnLeft <= 0) {
    if (!tryConsumeOneFuel(fs)) return;
  }
  fs.burnLeft -= dt;
  fs.smeltProgress += dt;
  while (fs.smeltProgress >= SMELT_TIME_SEC && canFurnaceSmelt(fs)) {
    fs.smeltProgress -= SMELT_TIME_SEC;
    const inId = fs.input.blockId;
    const outId = SMELTING_RECIPES[inId];
    fs.input.count -= 1;
    if (fs.input.count <= 0) {
      fs.input.blockId = 0;
      fs.input.count = 0;
    }
    if (isEmptySlot(fs.output)) {
      fs.output.blockId = outId;
      fs.output.count = 1;
    } else {
      fs.output.count += 1;
    }
    if (fs.burnLeft <= 0 && !tryConsumeOneFuel(fs)) break;
  }
}

function tickAllFurnaces(dt) {
  for (const fs of furnaceStates.values()) {
    tickFurnace(fs, dt);
  }
}

/**
 * @param {'input' | 'fuel' | 'output'} which
 * @param {import('./inventory.js').InvSlot} slotRef
 */
function furnaceSlotLeftClick(which, slotRef) {
  const fs = furnaceStates.get(openFurnaceKey);
  if (!fs) return;
  if (isEmptySlot(cursorItem) && isEmptySlot(slotRef)) return;
  if (which === 'output' && !isEmptySlot(cursorItem) && SMELTING_RECIPES[cursorItem.blockId]) return;

  if (isEmptySlot(cursorItem)) {
    if (isEmptySlot(slotRef)) return;
    cursorItem = { blockId: slotRef.blockId, count: slotRef.count, meta: slotRef.meta };
    slotRef.blockId = 0;
    slotRef.count = 0;
    delete slotRef.meta;
  } else if (isEmptySlot(slotRef)) {
    if (which === 'output' && SMELTING_RECIPES[cursorItem.blockId]) return;
    slotRef.blockId = cursorItem.blockId;
    slotRef.count = cursorItem.count;
    if (cursorItem.meta !== undefined) slotRef.meta = cursorItem.meta;
    cursorItem = { blockId: 0, count: 0 };
  } else if (slotRef.blockId === cursorItem.blockId && !TOOL_INFO[slotRef.blockId]) {
    const canAdd = MAX_STACK - slotRef.count;
    if (canAdd <= 0) {
      const tmp = { blockId: slotRef.blockId, count: slotRef.count, meta: slotRef.meta };
      slotRef.blockId = cursorItem.blockId;
      slotRef.count = cursorItem.count;
      if (cursorItem.meta !== undefined) slotRef.meta = cursorItem.meta;
      else delete slotRef.meta;
      cursorItem = tmp;
    } else {
      const add = Math.min(cursorItem.count, canAdd);
      slotRef.count += add;
      cursorItem.count -= add;
      if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
    }
  } else {
    const tmp = { blockId: slotRef.blockId, count: slotRef.count, meta: slotRef.meta };
    slotRef.blockId = cursorItem.blockId;
    slotRef.count = cursorItem.count;
    if (cursorItem.meta !== undefined) slotRef.meta = cursorItem.meta;
    else delete slotRef.meta;
    cursorItem = tmp;
  }
  updateCursorItemDisplay();
  refreshFurnacePanel();
}

function refreshFurnacePanel() {
  if (!furnaceOpen || !openFurnaceKey || !furnaceStates.has(openFurnaceKey)) return;
  const fs = furnaceStates.get(openFurnaceKey);
  const mounts = [
    [furnaceInputMount, fs.input, 'input'],
    [furnaceFuelMount, fs.fuel, 'fuel'],
    [furnaceOutputMount, fs.output, 'output'],
  ];
  for (const [el, slot, which] of mounts) {
    if (!el) continue;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'slot';
    const bid = slot.blockId;
    wrap.title = displayBlockName(bid) || 'Empty';
    const sc = document.createElement('canvas');
    sc.width = 32;
    sc.height = 32;
    drawSlotIcon(sc, bid, slot);
    const countEl = document.createElement('span');
    countEl.className = 'slot-count';
    if (!isEmptySlot(slot)) countEl.textContent = String(slot.count);
    wrap.appendChild(sc);
    wrap.appendChild(countEl);
    wrap.style.cursor = 'pointer';
    const w = which;
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      furnaceSlotLeftClick(w, slot);
      snapCursorItemElToEvent(e);
    });
    el.appendChild(wrap);
  }
  if (furnaceProgressFillEl) {
    const p = Math.min(1, fs.smeltProgress / SMELT_TIME_SEC);
    furnaceProgressFillEl.style.width = `${Math.round(p * 100)}%`;
  }
}

function openFurnaceAt(x, y, z) {
  if (craftTableOpen) closeCraftingTable();
  getOrCreateFurnaceState(x, y, z);
  openFurnaceKey = furnaceKey(x, y, z);
  furnaceOpen = true;
  furnacePanelEl?.classList.remove('hidden');
  furnacePanelEl?.setAttribute('aria-hidden', 'false');
  refreshFurnacePanel();
  document.exitPointerLock();
}

function closeFurnace() {
  flushCursorToInventory();
  furnaceOpen = false;
  openFurnaceKey = '';
  furnacePanelEl?.classList.add('hidden');
  furnacePanelEl?.setAttribute('aria-hidden', 'true');
  updateCursorItemDisplay();
  pendingPointerLock = true;
  canvas.requestPointerLock();
}

function flushCraftTableGridToInventory() {
  const hotbarOnly = gameMode === 'creative';
  for (let i = 0; i < 9; i++) {
    if (craftTableGrid[i] > 0) {
      addItemToInventory(invSlots, craftTableGrid[i], 1, { hotbarOnly });
      craftTableGrid[i] = 0;
    }
  }
}

function closeCraftingTable() {
  flushCraftTableGridToInventory();
  flushCursorToInventory();
  craftTableOpen = false;
  craftingTablePanelEl?.classList.add('hidden');
  craftingTablePanelEl?.setAttribute('aria-hidden', 'true');
  updateCursorItemDisplay();
  pendingPointerLock = true;
  canvas.requestPointerLock();
  refreshInventoryUI();
}

function openCraftingTable() {
  if (furnaceOpen) closeFurnace();
  craftTableOpen = true;
  craftingTablePanelEl?.classList.remove('hidden');
  craftingTablePanelEl?.setAttribute('aria-hidden', 'false');
  refreshCraftingTablePanel();
  document.exitPointerLock();
}

function refreshCraftingTablePanel() {
  if (!craftTableGridEl || !craftTableResultEl || !craftTableInvBackpackEl || !craftTableInvHotbarEl) return;
  craftTableGridEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'slot';
    wrap.title = craftTableGrid[i] > 0 ? displayBlockName(craftTableGrid[i]) : 'Empty';
    const sc = document.createElement('canvas');
    sc.width = 32;
    sc.height = 32;
    drawSlotIcon(sc, craftTableGrid[i]);
    wrap.appendChild(sc);
    const idx = i;
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isEmptySlot(cursorItem)) {
        if (craftTableGrid[idx] > 0) {
          cursorItem = { blockId: craftTableGrid[idx], count: 1 };
          craftTableGrid[idx] = 0;
          updateCursorItemDisplay();
          snapCursorItemElToEvent(e);
          refreshCraftingTablePanel();
        }
      } else if (craftTableGrid[idx] === 0) {
        craftTableGrid[idx] = cursorItem.blockId;
        cursorItem.count -= 1;
        if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
        updateCursorItemDisplay();
        snapCursorItemElToEvent(e);
        refreshCraftingTablePanel();
      } else if (craftTableGrid[idx] === cursorItem.blockId) {
        craftTableGrid[idx] = 0;
        cursorItem.count += 1;
        updateCursorItemDisplay();
        snapCursorItemElToEvent(e);
        refreshCraftingTablePanel();
      } else {
        const oldId = craftTableGrid[idx];
        craftTableGrid[idx] = cursorItem.blockId;
        cursorItem.count -= 1;
        if (cursorItem.count <= 0) {
          cursorItem = { blockId: oldId, count: 1 };
        } else {
          addItemToInventory(invSlots, oldId, 1);
        }
        updateCursorItemDisplay();
        snapCursorItemElToEvent(e);
        refreshCraftingTablePanel();
      }
    });
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isEmptySlot(cursorItem) && craftTableGrid[idx] === 0) {
        craftTableGrid[idx] = cursorItem.blockId;
        cursorItem.count -= 1;
        if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
        updateCursorItemDisplay();
        snapCursorItemElToEvent(e);
        refreshCraftingTablePanel();
      } else if (isEmptySlot(cursorItem) && craftTableGrid[idx] > 0) {
        cursorItem = { blockId: craftTableGrid[idx], count: 1 };
        craftTableGrid[idx] = 0;
        updateCursorItemDisplay();
        snapCursorItemElToEvent(e);
        refreshCraftingTablePanel();
      }
    });
    craftTableGridEl.appendChild(wrap);
  }

  const recipe3 = findRecipe3x3(craftTableGrid);
  craftTableResultEl.innerHTML = '';
  if (recipe3) {
    const wrap = document.createElement('div');
    wrap.className = 'slot';
    wrap.title = `${displayBlockName(recipe3.blockId)} ×${recipe3.count}`;
    const sc = document.createElement('canvas');
    sc.width = 32;
    sc.height = 32;
    drawSlotIcon(sc, recipe3.blockId);
    const countEl = document.createElement('span');
    countEl.className = 'slot-count';
    countEl.textContent = String(recipe3.count);
    wrap.appendChild(sc);
    wrap.appendChild(countEl);
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (e) => {
      const r = findRecipe3x3(craftTableGrid);
      if (!r) return;
      if (isEmptySlot(cursorItem)) {
        cursorItem = { blockId: r.blockId, count: r.count };
      } else if (cursorItem.blockId === r.blockId && !TOOL_INFO[r.blockId]) {
        const canAdd = MAX_STACK - cursorItem.count;
        if (canAdd < r.count) return;
        cursorItem.count += r.count;
      } else {
        return;
      }
      for (let k = 0; k < 9; k++) craftTableGrid[k] = 0;
      playSound('place');
      updateCursorItemDisplay();
      snapCursorItemElToEvent(e);
      refreshCraftingTablePanel();
    });
    craftTableResultEl.appendChild(wrap);
  }

  craftTableInvBackpackEl.innerHTML = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const slotIdx = r * 9 + c;
      craftTableInvBackpackEl.appendChild(createSlotElement(slotIdx, false, true));
    }
  }
  craftTableInvHotbarEl.innerHTML = '';
  for (let c = 0; c < 9; c++) {
    const slotIdx = HOTBAR_OFFSET + c;
    craftTableInvHotbarEl.appendChild(createSlotElement(slotIdx, c === hotbarIndex, true));
  }
}

/**
 * Door / furnace / crafting table use. Returns true if handled.
 */
function tryInteractBlock() {
  if (!lastRay || !pointerLocked || invOpen || worldGuiOpen() || playerDead) return false;
  const { x, y, z } = lastRay.hit;
  const id = world.get(x, y, z);
  if (id === BlockId.DOOR || id === BlockId.DOOR_OPEN) {
    const topId = world.get(x, y + 1, z);
    if (topId === BlockId.DOOR_TOP || topId === BlockId.DOOR_OPEN_TOP) {
      const open = id === BlockId.DOOR_OPEN;
      world.set(x, y, z, open ? BlockId.DOOR : BlockId.DOOR_OPEN);
      world.set(x, y + 1, z, open ? BlockId.DOOR_TOP : BlockId.DOOR_OPEN_TOP);
    } else {
      world.set(x, y, z, id === BlockId.DOOR ? BlockId.DOOR_OPEN : BlockId.DOOR);
    }
    rebuildChunksForBlock(x, z);
    playSound('place');
    return true;
  }
  if (id === BlockId.DOOR_TOP || id === BlockId.DOOR_OPEN_TOP) {
    if (y <= 0) return false;
    const by = y - 1;
    const bot = world.get(x, by, z);
    if (bot !== BlockId.DOOR && bot !== BlockId.DOOR_OPEN) return false;
    const open = bot === BlockId.DOOR_OPEN;
    world.set(x, by, z, open ? BlockId.DOOR : BlockId.DOOR_OPEN);
    world.set(x, y, z, open ? BlockId.DOOR_TOP : BlockId.DOOR_OPEN_TOP);
    rebuildChunksForBlock(x, z);
    playSound('place');
    return true;
  }
  if (id === BlockId.FURNACE) {
    openFurnaceAt(x, y, z);
    return true;
  }
  if (id === BlockId.CRAFTING_TABLE) {
    openCraftingTable();
    playSound('place');
    return true;
  }
  return false;
}

/**
 * @param {number} raw
 * @returns {number}
 */
function damageAfterArmor(raw) {
  if (gameMode !== 'survival') return raw;
  const mult = armorDamageMultiplier(totalArmorPoints(armorSlots));
  return raw * mult;
}

/**
 * @param {number} slotIdx
 * @param {boolean} selected
 */
function createSlotElement(slotIdx, selected, interactive = false) {
  const slot = invSlots[slotIdx];
  const bid = slot.blockId;
  const wrap = document.createElement('div');
  wrap.className = 'slot' + (selected ? ' active' : '');
  wrap.title = displayBlockName(bid) || 'Empty';
  const sc = document.createElement('canvas');
  sc.width = 32;
  sc.height = 32;
  drawSlotIcon(sc, bid, slot);
  const countEl = document.createElement('span');
  countEl.className = 'slot-count';
  if (!isEmptySlot(slot)) countEl.textContent = String(slot.count);
  const nameEl = document.createElement('span');
  nameEl.className = 'slot-name';
  nameEl.textContent = isEmptySlot(slot) ? '' : displayBlockName(bid);
  wrap.appendChild(sc);
  wrap.appendChild(countEl);
  wrap.appendChild(nameEl);
  if (interactive) {
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.shiftKey) invSlotShiftClick(slotIdx);
      else {
        invSlotLeftClick(slotIdx);
        snapCursorItemElToEvent(e);
      }
    });
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      invSlotRightClick(slotIdx);
      snapCursorItemElToEvent(e);
    });
  }
  return wrap;
}

function refreshHotbarUI() {
  hotbarEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const idx = HOTBAR_OFFSET + i;
    hotbarEl.appendChild(createSlotElement(idx, hotbarIndex === i, invOpen));
  }
}

function filteredCreativePaletteIds() {
  const q = creativeInventorySearch.trim().toLowerCase();
  if (!q) return CREATIVE_PALETTE_IDS;
  return CREATIVE_PALETTE_IDS.filter((id) => displayBlockName(id).toLowerCase().includes(q));
}

function creativeCatalogShiftToHotbar(blockId) {
  if (!isEmptySlot(cursorItem)) return;
  const grab = creativePaletteGrabSlot(blockId);
  const bid = grab.blockId;
  const cnt = grab.count;
  const meta = grab.meta;
  const isTool = !!TOOL_INFO[bid];
  for (let i = HOTBAR_OFFSET; i < INV_SIZE; i++) {
    const t = invSlots[i];
    if (!isTool && t.blockId === bid && t.count < MAX_STACK) {
      const move = Math.min(cnt, MAX_STACK - t.count);
      t.count += move;
      refreshInventoryUI();
      return;
    }
  }
  for (let i = HOTBAR_OFFSET; i < INV_SIZE; i++) {
    if (isEmptySlot(invSlots[i])) {
      invSlots[i].blockId = bid;
      invSlots[i].count = isTool ? 1 : cnt;
      if (meta !== undefined) invSlots[i].meta = meta;
      else delete invSlots[i].meta;
      refreshInventoryUI();
      return;
    }
  }
}

/**
 * @param {number} blockId
 */
function createCreativeCatalogSlotElement(blockId) {
  const grab = creativePaletteGrabSlot(blockId);
  const wrap = document.createElement('div');
  wrap.className = 'slot slot-catalog';
  wrap.title = displayBlockName(blockId) || 'Item';
  const sc = document.createElement('canvas');
  sc.width = 32;
  sc.height = 32;
  drawSlotIcon(sc, blockId, grab);
  const countEl = document.createElement('span');
  countEl.className = 'slot-count';
  countEl.textContent = TOOL_INFO[blockId] ? '1' : String(MAX_STACK);
  const nameEl = document.createElement('span');
  nameEl.className = 'slot-name';
  nameEl.textContent = displayBlockName(blockId);
  wrap.appendChild(sc);
  wrap.appendChild(countEl);
  wrap.appendChild(nameEl);
  wrap.style.cursor = 'pointer';
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.shiftKey) {
      creativeCatalogShiftToHotbar(blockId);
    } else if (gameMode === 'creative' && isEmptySlot(cursorItem)) {
      const idx = HOTBAR_OFFSET + hotbarIndex;
      const g = creativePaletteGrabSlot(blockId);
      invSlots[idx].blockId = g.blockId;
      invSlots[idx].count = g.count;
      if (g.meta !== undefined) invSlots[idx].meta = g.meta;
      else delete invSlots[idx].meta;
      updateCursorItemDisplay();
      refreshInventoryUI();
    } else {
      cursorItem = {
        blockId: grab.blockId,
        count: grab.count,
        ...(grab.meta !== undefined ? { meta: grab.meta } : {}),
      };
      updateCursorItemDisplay();
      refreshInventoryUI();
    }
    snapCursorItemElToEvent(e);
  });
  wrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isTool = !!TOOL_INFO[blockId];
    if (isTool) {
      cursorItem = {
        blockId: grab.blockId,
        count: grab.count,
        ...(grab.meta !== undefined ? { meta: grab.meta } : {}),
      };
    } else if (isEmptySlot(cursorItem)) {
      cursorItem = { blockId, count: 1 };
    } else if (cursorItem.blockId === blockId && cursorItem.count < MAX_STACK) {
      cursorItem.count += 1;
    } else {
      cursorItem = { blockId, count: 1 };
    }
    updateCursorItemDisplay();
    refreshInventoryUI();
    snapCursorItemElToEvent(e);
  });
  return wrap;
}

function refreshInventoryPanel() {
  if (!invGridHotbarEl) return;
  const invPanelInner = invPanelEl?.querySelector('.inv-panel');
  if (gameMode === 'creative') {
    invPanelInner?.classList.add('inv-mode-creative');
    invBackpackSectionEl?.classList.add('hidden');
    invBackpackSectionEl?.setAttribute('aria-hidden', 'true');
    creativeCatalogSectionEl?.classList.remove('hidden');
    creativeCatalogSectionEl?.setAttribute('aria-hidden', 'false');
    if (invGridBackpackEl) invGridBackpackEl.innerHTML = '';
    if (creativeCatalogGridEl) {
      creativeCatalogGridEl.innerHTML = '';
      for (const id of filteredCreativePaletteIds()) {
        creativeCatalogGridEl.appendChild(createCreativeCatalogSlotElement(id));
      }
    }
  } else {
    invPanelInner?.classList.remove('inv-mode-creative');
    invBackpackSectionEl?.classList.remove('hidden');
    invBackpackSectionEl?.setAttribute('aria-hidden', 'false');
    creativeCatalogSectionEl?.classList.add('hidden');
    creativeCatalogSectionEl?.setAttribute('aria-hidden', 'true');
    if (invGridBackpackEl) {
      invGridBackpackEl.innerHTML = '';
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 9; c++) {
          const slotIdx = r * 9 + c;
          invGridBackpackEl.appendChild(createSlotElement(slotIdx, false, true));
        }
      }
    }
    if (creativeCatalogGridEl) creativeCatalogGridEl.innerHTML = '';
  }
  invGridHotbarEl.innerHTML = '';
  for (let c = 0; c < 9; c++) {
    const slotIdx = HOTBAR_OFFSET + c;
    const sel = c === hotbarIndex;
    invGridHotbarEl.appendChild(createSlotElement(slotIdx, sel, true));
  }
  refreshArmorRail();
  refreshCraftingUI();
}

function refreshCraftingUI() {
  if (!craftGridEl || !craftResultEl) return;
  if (gameMode === 'creative') {
    craftGridEl.innerHTML = '';
    craftResultEl.innerHTML = '';
    return;
  }
  craftGridEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'slot';
    wrap.title = craftGrid[i] > 0 ? displayBlockName(craftGrid[i]) : 'Empty';
    const sc = document.createElement('canvas');
    sc.width = 32;
    sc.height = 32;
    drawSlotIcon(sc, craftGrid[i]);
    wrap.appendChild(sc);
    const idx = i;
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isEmptySlot(cursorItem)) {
        // Pick up from craft grid
        if (craftGrid[idx] > 0) {
          cursorItem = { blockId: craftGrid[idx], count: 1 };
          craftGrid[idx] = 0;
          updateCursorItemDisplay();
          snapCursorItemElToEvent(e);
          refreshInventoryUI();
        }
      } else {
        // Place cursor item into craft grid
        if (craftGrid[idx] === 0) {
          craftGrid[idx] = cursorItem.blockId;
          cursorItem.count -= 1;
          if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
          updateCursorItemDisplay();
          snapCursorItemElToEvent(e);
          refreshInventoryUI();
        } else if (craftGrid[idx] === cursorItem.blockId) {
          // Same item already in grid — pick the grid item back up onto cursor
          craftGrid[idx] = 0;
          cursorItem.count += 1;
          updateCursorItemDisplay();
          snapCursorItemElToEvent(e);
          refreshInventoryUI();
        } else {
          // Different item — swap
          const oldId = craftGrid[idx];
          craftGrid[idx] = cursorItem.blockId;
          cursorItem.count -= 1;
          // Give old craft item back
          if (cursorItem.count <= 0) {
            cursorItem = { blockId: oldId, count: 1 };
          } else {
            addItemToInventory(invSlots, oldId, 1);
          }
          updateCursorItemDisplay();
          snapCursorItemElToEvent(e);
          refreshInventoryUI();
        }
      }
    });
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isEmptySlot(cursorItem) && craftGrid[idx] === 0) {
        // Place one from cursor into craft grid
        craftGrid[idx] = cursorItem.blockId;
        cursorItem.count -= 1;
        if (cursorItem.count <= 0) cursorItem = { blockId: 0, count: 0 };
        updateCursorItemDisplay();
        snapCursorItemElToEvent(e);
        refreshInventoryUI();
      } else if (!isEmptySlot(cursorItem) && craftGrid[idx] === cursorItem.blockId) {
        // Same item — no-op (craft grid is 1 per cell)
      } else if (isEmptySlot(cursorItem) && craftGrid[idx] > 0) {
        // Pick up from craft grid
        cursorItem = { blockId: craftGrid[idx], count: 1 };
        craftGrid[idx] = 0;
        updateCursorItemDisplay();
        snapCursorItemElToEvent(e);
        refreshInventoryUI();
      }
    });
    craftGridEl.appendChild(wrap);
  }

  const recipe = findRecipe(craftGrid);
  craftResultEl.innerHTML = '';
  if (recipe) {
    const wrap = document.createElement('div');
    wrap.className = 'slot';
    wrap.title = `${displayBlockName(recipe.blockId)} ×${recipe.count}`;
    const sc = document.createElement('canvas');
    sc.width = 32;
    sc.height = 32;
    drawSlotIcon(sc, recipe.blockId);
    const countEl = document.createElement('span');
    countEl.className = 'slot-count';
    countEl.textContent = String(recipe.count);
    wrap.appendChild(sc);
    wrap.appendChild(countEl);
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (e) => {
      const r = findRecipe(craftGrid);
      if (!r) return;
      // If cursor is empty or holds same item with room, place on cursor
      if (isEmptySlot(cursorItem)) {
        cursorItem = { blockId: r.blockId, count: r.count };
      } else if (cursorItem.blockId === r.blockId && !TOOL_INFO[r.blockId]) {
        const canAdd = MAX_STACK - cursorItem.count;
        if (canAdd < r.count) return; // not enough room on cursor
        cursorItem.count += r.count;
      } else {
        return; // cursor holds different item
      }
      craftGrid[0] = 0;
      craftGrid[1] = 0;
      craftGrid[2] = 0;
      craftGrid[3] = 0;
      playSound('place');
      updateCursorItemDisplay();
      snapCursorItemElToEvent(e);
      refreshInventoryUI();
    });
    craftResultEl.appendChild(wrap);
  }
}

function flushCraftGridToInventory() {
  const hotbarOnly = gameMode === 'creative';
  for (let i = 0; i < 4; i++) {
    if (craftGrid[i] > 0) {
      addItemToInventory(invSlots, craftGrid[i], 1, { hotbarOnly });
      craftGrid[i] = 0;
    }
  }
  flushCursorToInventory();
}

/** Flush and hide furnace, crafting table, and inventory panels (no pointer lock). */
function closeOverlayPanelsForMenuOrDeath() {
  if (furnaceOpen) {
    flushCursorToInventory();
    furnaceOpen = false;
    openFurnaceKey = '';
    furnacePanelEl?.classList.add('hidden');
    furnacePanelEl?.setAttribute('aria-hidden', 'true');
    updateCursorItemDisplay();
  }
  if (craftTableOpen) {
    flushCraftTableGridToInventory();
    flushCursorToInventory();
    craftTableOpen = false;
    craftingTablePanelEl?.classList.add('hidden');
    craftingTablePanelEl?.setAttribute('aria-hidden', 'true');
    updateCursorItemDisplay();
  }
  if (invOpen) {
    flushCraftGridToInventory();
    flushCursorToInventory();
    invOpen = false;
    invPanelEl?.classList.add('hidden');
    invPanelEl?.setAttribute('aria-hidden', 'true');
    refreshInventoryUI();
  }
}

function refreshInventoryUI() {
  refreshHotbarUI();
  if (invOpen) refreshInventoryPanel();
  if (craftTableOpen) refreshCraftingTablePanel();
}

refreshInventoryUI();

function buildPlayerSaveSnapshot() {
  return {
    gameMode,
    player: { x: player.x, y: player.y, z: player.z },
    worldTimeTicks,
    playerVitals:
      gameMode === 'survival'
        ? { health: playerHealth, stamina: playerStamina, hunger: playerHunger }
        : undefined,
  };
}

function doSave() {
  try {
    saveToLocalStorage(
      world,
      invSlots,
      serializeMobsState(pigs, cows, squids, drops, zombies),
      armorSlots,
      serializeFurnaceStatesForSave(),
      buildPlayerSaveSnapshot(),
    );
    showToast('World saved');
  } catch (err) {
    showToast('Save failed: storage full?');
  }
}

function doLoad() {
  const state = loadFromLocalStorage();
  if (!state) {
    showToast('No save found');
    return;
  }
  const { world: w, inventory } = state;
  if (w.height !== WORLD_H) {
    showToast('Save incompatible (world height changed)');
    return;
  }
  hideDeathScreen();
  const mobArg = state.mobs !== undefined ? state.mobs : 'spawn';
  applyWorld(w, mobArg);
  furnaceStates.clear();
  for (const row of state.furnaces ?? []) {
    furnaceStates.set(row.k, {
      input: { ...row.input },
      fuel: { ...row.fuel },
      output: { ...row.output },
      burnLeft: row.burnLeft,
      smeltProgress: row.smeltProgress,
    });
  }
  if (state.gameMode === 'creative' || state.gameMode === 'survival') {
    setGameMode(state.gameMode);
  }
  invSlots = inventory;
  armorSlots = state.armor ?? createArmorSlots();
  if (gameMode === 'creative') clearBackpackSlots(invSlots);

  if (state.player) {
    player.x = state.player.x;
    player.y = state.player.y;
    player.z = state.player.z;
  }
  if (typeof state.worldTimeTicks === 'number' && Number.isFinite(state.worldTimeTicks)) {
    const mc = MC_DAY_TICKS;
    worldTimeTicks = ((Math.floor(state.worldTimeTicks) % mc) + mc) % mc;
  }
  if (state.playerVitals && gameMode === 'survival') {
    playerHealth = Math.max(0, Math.min(MAX_HEALTH, state.playerVitals.health));
    playerStamina = Math.max(0, Math.min(MAX_STAMINA, state.playerVitals.stamina));
    playerHunger = Math.max(0, Math.min(MAX_HUNGER, state.playerVitals.hunger));
  }

  cursorItem = { blockId: 0, count: 0 };
  updateCursorItemDisplay();

  lastStreamChunkX = NaN;
  lastStreamChunkZ = NaN;
  syncVisibleChunks(true);
  syncCamera();

  syncModeButtons();
  syncStatBarsVisibility();
  refreshInventoryUI();
  if (pauseMenuEl && !pauseMenuEl.classList.contains('hidden')) {
    updatePauseWorldMeta();
  }
  showToast('World loaded');
}

window.addEventListener('keydown', (e) => {
  if (playerDead) {
    if (e.code === 'Escape') {
      e.preventDefault();
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      const t = e.target;
      if (
        !(t instanceof HTMLInputElement) &&
        !(t instanceof HTMLTextAreaElement) &&
        !(t instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        doRespawn();
      }
      return;
    }
  }
  if (pauseMenuEl && !pauseMenuEl.classList.contains('hidden')) {
    if (e.code === 'Space' || e.code === 'Enter') {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement) && !(t instanceof HTMLSelectElement)) {
        e.preventDefault();
        pauseResumeBtn?.click();
      }
    }
  }
  if (e.code === 'KeyW') {
    keys.forward = true;
    if (pointerLocked && !invOpen && !worldGuiOpen()) {
      const now = performance.now();
      if (lastWKeyUpTime > 0 && now - lastWKeyUpTime < W_DOUBLE_TAP_MS) {
        sprintLatched = true;
      }
    }
  }
  if (e.code === 'KeyA') keys.left = true;
  if (e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space') {
    keys.jump = true;
    if (pointerLocked) e.preventDefault();
    /* Creative: double-tap Space to toggle flight. */
    if (gameMode === 'creative' && pointerLocked && !invOpen && !worldGuiOpen()) {
      const now = performance.now();
      if (lastSpaceUpTime > 0 && now - lastSpaceUpTime < SPACE_DOUBLE_TAP_MS) {
        player.flying = !player.flying;
        showToast(player.flying ? 'Flying enabled' : 'Flying disabled');
        lastSpaceUpTime = 0;
      }
    }
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    keys.swimDown = true;
    if (pointerLocked) e.preventDefault();
  }
  if (pointerLocked && e.shiftKey && e.code === 'KeyS') {
    doSave();
    e.preventDefault();
  } else if (e.code === 'KeyS') {
    keys.back = true;
    sprintLatched = false;
  }
  if (pointerLocked && e.shiftKey && e.code === 'KeyL') {
    doLoad();
    e.preventDefault();
  }
  if (e.code === 'KeyE') {
    if (furnaceOpen) {
      closeFurnace();
      e.preventDefault();
      return;
    }
    if (craftTableOpen) {
      closeCraftingTable();
      e.preventDefault();
      return;
    }
    if (invOpen) {
      flushCraftGridToInventory();
      invOpen = false;
      invPanelEl?.classList.add('hidden');
      invPanelEl?.setAttribute('aria-hidden', 'true');
      refreshInventoryUI();
      pendingPointerLock = true;
      canvas.requestPointerLock();
      e.preventDefault();
      return;
    }
    if (pointerLocked) {
      invOpen = true;
      sprintLatched = false;
      invPanelEl?.classList.remove('hidden');
      invPanelEl?.setAttribute('aria-hidden', 'false');
      refreshInventoryUI();
      requestAnimationFrame(() => invPlayerPreview.resize());
      document.exitPointerLock();
      e.preventDefault();
    }
  }
  if (e.code === 'Escape' && furnaceOpen) {
    closeFurnace();
    e.preventDefault();
  }
  if (e.code === 'Escape' && craftTableOpen) {
    closeCraftingTable();
    e.preventDefault();
  }
  if (e.code === 'Escape' && invOpen) {
    flushCraftGridToInventory();
    invOpen = false;
    invPanelEl?.classList.add('hidden');
    invPanelEl?.setAttribute('aria-hidden', 'true');
    refreshInventoryUI();
    pendingPointerLock = true;
    canvas.requestPointerLock();
    e.preventDefault();
  }
  if (e.code === 'F5' && pointerLocked) {
    cameraViewMode = (cameraViewMode + 1) % 3;
    playerModel.visible = cameraViewMode !== 0;
    e.preventDefault();
  }
  if (e.code >= 'Digit1' && e.code <= 'Digit9') {
    const n = parseInt(e.code.slice(5), 10) - 1;
    if (n >= 0 && n < 9) {
      hotbarIndex = n;
      refreshInventoryUI();
    }
  }
  if (e.code === 'Tab') e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') {
    keys.forward = false;
    lastWKeyUpTime = performance.now();
    sprintLatched = false;
  }
  if (e.code === 'KeyS') keys.back = false;
  if (e.code === 'KeyA') keys.left = false;
  if (e.code === 'KeyD') keys.right = false;
  if (e.code === 'Space') {
    keys.jump = false;
    if (gameMode === 'creative') lastSpaceUpTime = performance.now();
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.swimDown = false;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (!pointerLocked || invOpen || worldGuiOpen() || gameSettings.disableHotbarScroll) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    hotbarIndex = ((hotbarIndex + dir) % 9 + 9) % 9;
    refreshInventoryUI();
  },
  { passive: false },
);

function applyRendererPixelRatioAndSize() {
  const dprCap = 2;
  const base = Math.min(window.devicePixelRatio || 1, dprCap);
  const scale = Math.max(0.5, Math.min(1, gameSettings.renderScale));
  renderer.setPixelRatio(Math.max(0.5, base * scale));
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeInvPlayerPreview();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyRendererPixelRatioAndSize();
});

/** @returns {{ size: number, type: number }} */
function getShadowPresetConfig() {
  switch (gameSettings.shadowQuality) {
    case 'fast':
      return { size: 512, type: THREE.BasicShadowMap };
    case 'balanced':
      return { size: 1024, type: THREE.PCFShadowMap };
    default:
      return { size: 2048, type: THREE.PCFSoftShadowMap };
  }
}

function applyShadowQualityFromSettings() {
  if (!gameSettings.shadowsEnabled) {
    renderer.shadowMap.enabled = false;
    return;
  }
  const { size, type } = getShadowPresetConfig();
  shadowMapResolution = size;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = type;
  for (const light of [sun, moon]) {
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.mapSize.set(size, size);
  }
}

function applyGraphicsSettingsFromState() {
  camera.fov = gameSettings.fov;
  camera.updateProjectionMatrix();
  setMasterVolume(gameSettings.masterVolume);
  applyShadowQualityFromSettings();
  applyRendererPixelRatioAndSize();
  cloudLayer.group.visible = gameSettings.showClouds;
}

const SETTINGS_UI_CLUSTERS = [
  {
    fov: 'settingsFov',
    fovVal: 'settingsFovVal',
    sens: 'settingsMouseSens',
    sensVal: 'settingsSensVal',
    vol: 'settingsVolume',
    volVal: 'settingsVolVal',
    renderDist: 'settingsRenderDist',
    renderDistVal: 'settingsRenderDistVal',
    terrainSpeed: 'settingsTerrainSpeed',
    terrainSpeedVal: 'settingsTerrainSpeedVal',
    renderScale: 'settingsRenderScale',
    renderScaleVal: 'settingsRenderScaleVal',
    shadowQuality: 'settingsShadowQuality',
    maxTorchLights: 'settingsMaxTorchLights',
    invertMouseY: 'settingsInvertMouseY',
    invertMouseX: 'settingsInvertMouseX',
    showCoords: 'settingsShowCoords',
    showFps: 'settingsShowFps',
    disableHotbarScroll: 'settingsDisableHotbarScroll',
    shadows: 'settingsShadows',
    clouds: 'settingsClouds',
    viewBob: 'settingsViewBob',
    camShake: 'settingsCamShake',
    blockParticles: 'settingsBlockParticles',
  },
  {
    fov: 'pauseSettingsFov',
    fovVal: 'pauseSettingsFovVal',
    sens: 'pauseSettingsMouseSens',
    sensVal: 'pauseSettingsSensVal',
    vol: 'pauseSettingsVolume',
    volVal: 'pauseSettingsVolVal',
    renderDist: 'pauseSettingsRenderDist',
    renderDistVal: 'pauseSettingsRenderDistVal',
    terrainSpeed: 'pauseSettingsTerrainSpeed',
    terrainSpeedVal: 'pauseSettingsTerrainSpeedVal',
    renderScale: 'pauseSettingsRenderScale',
    renderScaleVal: 'pauseSettingsRenderScaleVal',
    shadowQuality: 'pauseSettingsShadowQuality',
    maxTorchLights: 'pauseSettingsMaxTorchLights',
    invertMouseY: 'pauseSettingsInvertMouseY',
    invertMouseX: 'pauseSettingsInvertMouseX',
    showCoords: 'pauseSettingsShowCoords',
    showFps: 'pauseSettingsShowFps',
    disableHotbarScroll: 'pauseSettingsDisableHotbarScroll',
    shadows: 'pauseSettingsShadows',
    clouds: 'pauseSettingsClouds',
    viewBob: 'pauseSettingsViewBob',
    camShake: 'pauseSettingsCamShake',
    blockParticles: 'pauseSettingsBlockParticles',
  },
];

function syncSettingsUiFromState() {
  for (const ids of SETTINGS_UI_CLUSTERS) {
    const fovEl = document.getElementById(ids.fov);
    const sensEl = document.getElementById(ids.sens);
    const volEl = document.getElementById(ids.vol);
    const rdEl = document.getElementById(ids.renderDist);
    const fovOut = document.getElementById(ids.fovVal);
    const sensOut = document.getElementById(ids.sensVal);
    const volOut = document.getElementById(ids.volVal);
    const rdOut = document.getElementById(ids.renderDistVal);
    if (fovEl instanceof HTMLInputElement) {
      fovEl.value = String(gameSettings.fov);
      if (fovOut) fovOut.textContent = String(gameSettings.fov);
    }
    if (sensEl instanceof HTMLInputElement) {
      sensEl.value = String(gameSettings.mouseSens);
      if (sensOut) sensOut.textContent = `${gameSettings.mouseSens.toFixed(2)}×`;
    }
    if (volEl instanceof HTMLInputElement) {
      volEl.value = String(gameSettings.masterVolume);
      if (volOut) volOut.textContent = `${Math.round(gameSettings.masterVolume * 100)}%`;
    }
    if (rdEl instanceof HTMLInputElement) {
      rdEl.value = String(gameSettings.chunkRenderRadius);
      if (rdOut) rdOut.textContent = String(gameSettings.chunkRenderRadius);
    }
    const tsEl = document.getElementById(ids.terrainSpeed);
    const tsOut = document.getElementById(ids.terrainSpeedVal);
    if (tsEl instanceof HTMLInputElement) {
      tsEl.value = String(gameSettings.terrainLoadSpeed);
      if (tsOut) tsOut.textContent = `${Math.round(gameSettings.terrainLoadSpeed * 100)}%`;
    }
    const rsEl = document.getElementById(ids.renderScale);
    const rsOut = document.getElementById(ids.renderScaleVal);
    if (rsEl instanceof HTMLInputElement) {
      rsEl.value = String(gameSettings.renderScale);
      if (rsOut) rsOut.textContent = `${Math.round(gameSettings.renderScale * 100)}%`;
    }
    const sqEl = document.getElementById(ids.shadowQuality);
    if (sqEl instanceof HTMLSelectElement) sqEl.value = gameSettings.shadowQuality;
    const tlEl = document.getElementById(ids.maxTorchLights);
    if (tlEl instanceof HTMLSelectElement) tlEl.value = String(gameSettings.maxTorchLights);
    const invY = document.getElementById(ids.invertMouseY);
    if (invY instanceof HTMLInputElement) invY.checked = gameSettings.invertMouseY;
    const invX = document.getElementById(ids.invertMouseX);
    if (invX instanceof HTMLInputElement) invX.checked = gameSettings.invertMouseX;
    const sc = document.getElementById(ids.showCoords);
    if (sc instanceof HTMLInputElement) sc.checked = gameSettings.showCoordinates;
    const sf = document.getElementById(ids.showFps);
    if (sf instanceof HTMLInputElement) sf.checked = gameSettings.showFps;
    const dh = document.getElementById(ids.disableHotbarScroll);
    if (dh instanceof HTMLInputElement) dh.checked = gameSettings.disableHotbarScroll;
    const sh = document.getElementById(ids.shadows);
    if (sh instanceof HTMLInputElement) sh.checked = gameSettings.shadowsEnabled;
    const cl = document.getElementById(ids.clouds);
    if (cl instanceof HTMLInputElement) cl.checked = gameSettings.showClouds;
    const vb = document.getElementById(ids.viewBob);
    if (vb instanceof HTMLInputElement) vb.checked = gameSettings.viewBobbing;
    const cs = document.getElementById(ids.camShake);
    if (cs instanceof HTMLInputElement) cs.checked = gameSettings.cameraShake;
    const bp = document.getElementById(ids.blockParticles);
    if (bp instanceof HTMLInputElement) bp.checked = gameSettings.blockBreakParticles;
  }
}

function bindSettingsPanel() {
  for (const ids of SETTINGS_UI_CLUSTERS) {
    const fovEl = document.getElementById(ids.fov);
    const sensEl = document.getElementById(ids.sens);
    const volEl = document.getElementById(ids.vol);
    const rdEl = document.getElementById(ids.renderDist);
    if (fovEl instanceof HTMLInputElement) {
      fovEl.addEventListener('input', () => {
        const v = Number(fovEl.value);
        gameSettings = saveSettings({ fov: v });
        syncSettingsUiFromState();
        applyGraphicsSettingsFromState();
      });
    }
    if (sensEl instanceof HTMLInputElement) {
      sensEl.addEventListener('input', () => {
        const v = Number(sensEl.value);
        gameSettings = saveSettings({ mouseSens: v });
        syncSettingsUiFromState();
      });
    }
    if (volEl instanceof HTMLInputElement) {
      volEl.addEventListener('input', () => {
        const v = Number(volEl.value);
        gameSettings = saveSettings({ masterVolume: v });
        syncSettingsUiFromState();
        setMasterVolume(gameSettings.masterVolume);
      });
    }
    if (rdEl instanceof HTMLInputElement) {
      rdEl.addEventListener('input', () => {
        const v = Number(rdEl.value);
        gameSettings = saveSettings({ chunkRenderRadius: v });
        lastChunkVisSig = '';
        lastStreamChunkX = NaN;
        lastStreamChunkZ = NaN;
        syncVisibleChunks(true);
        syncSettingsUiFromState();
      });
    }
    const tsEl = document.getElementById(ids.terrainSpeed);
    if (tsEl instanceof HTMLInputElement) {
      tsEl.addEventListener('input', () => {
        const v = Number(tsEl.value);
        gameSettings = saveSettings({ terrainLoadSpeed: v });
        syncSettingsUiFromState();
      });
    }
    const rsEl = document.getElementById(ids.renderScale);
    if (rsEl instanceof HTMLInputElement) {
      rsEl.addEventListener('input', () => {
        const v = Number(rsEl.value);
        gameSettings = saveSettings({ renderScale: v });
        syncSettingsUiFromState();
        applyGraphicsSettingsFromState();
      });
    }
    const sqEl = document.getElementById(ids.shadowQuality);
    if (sqEl instanceof HTMLSelectElement) {
      sqEl.addEventListener('change', () => {
        const v = sqEl.value;
        if (v !== 'high' && v !== 'balanced' && v !== 'fast') return;
        gameSettings = saveSettings({ shadowQuality: v });
        syncSettingsUiFromState();
        applyGraphicsSettingsFromState();
      });
    }
    const tlEl = document.getElementById(ids.maxTorchLights);
    if (tlEl instanceof HTMLSelectElement) {
      tlEl.addEventListener('change', () => {
        const v = Number(tlEl.value);
        gameSettings = saveSettings({ maxTorchLights: v });
        syncSettingsUiFromState();
      });
    }
    /**
     * @param {string} elId
     * @param {'invertMouseY' | 'invertMouseX' | 'showCoordinates' | 'showFps' | 'disableHotbarScroll' | 'shadowsEnabled' | 'showClouds' | 'viewBobbing' | 'cameraShake' | 'blockBreakParticles'} key
     */
    const bindCheck = (elId, key) => {
      const el = document.getElementById(elId);
      if (!(el instanceof HTMLInputElement)) return;
      el.addEventListener('change', () => {
        gameSettings = saveSettings({ [key]: el.checked });
        syncSettingsUiFromState();
        if (key === 'shadowsEnabled' || key === 'showClouds') {
          applyGraphicsSettingsFromState();
        }
      });
    };
    bindCheck(ids.invertMouseY, 'invertMouseY');
    bindCheck(ids.invertMouseX, 'invertMouseX');
    bindCheck(ids.showCoords, 'showCoordinates');
    bindCheck(ids.showFps, 'showFps');
    bindCheck(ids.disableHotbarScroll, 'disableHotbarScroll');
    bindCheck(ids.shadows, 'shadowsEnabled');
    bindCheck(ids.clouds, 'showClouds');
    bindCheck(ids.viewBob, 'viewBobbing');
    bindCheck(ids.camShake, 'cameraShake');
    bindCheck(ids.blockParticles, 'blockBreakParticles');
  }
  syncSettingsUiFromState();
  applyGraphicsSettingsFromState();
}

bindSettingsPanel();

canvas.addEventListener(
  'mousedown',
  (e) => {
    if (!pointerLocked) return;
    if (e.button === 0) {
      mouseLeftDown = true;
      if (!tryHitMob()) {
        miningBlock = null;
        miningProgress = 0;
      }
    }
    if (e.button === 2) {
      e.preventDefault();
      if (!tryEat() && !tryInteractBlock()) tryPlace();
    }
  },
  { passive: false },
);

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    mouseLeftDown = false;
    miningBlock = null;
    miningProgress = 0;
    crackMesh.visible = false;
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousemove', (e) => {
  if (pointerLocked) {
    const sens = 0.0022 * gameSettings.mouseSens;
    const xLookSign = gameSettings.invertMouseX ? -1 : 1;
    yaw -= e.movementX * sens * xLookSign;
    const yLookSign = gameSettings.invertMouseY ? -1 : 1;
    pitch -= e.movementY * sens * yLookSign;
    const lim = Math.PI / 2 - 0.02;
    pitch = Math.max(-lim, Math.min(lim, pitch));
  }
  /* Track cursor position for floating held-item icon. */
  if ((invOpen || worldGuiOpen()) && !isEmptySlot(cursorItem)) {
    cursorItemEl.style.left = `${e.clientX}px`;
    cursorItemEl.style.top = `${e.clientY}px`;
  }
});

function startPlay() {
  const urlSeed = readSeedFromURL();
  const seed = urlSeed !== null ? urlSeed : readSeedFromInput();
  if (urlSeed === null && seed !== world.seed) {
    applyWorld(new World(WORLD_H, seed));
    if (gameMode === 'creative') {
      invSlots = createCreativeInventory();
    } else {
      invSlots = createInventory();
    }
  }
  syncStatBarsVisibility();
  refreshInventoryUI();
  const next = new URLSearchParams(location.search);
  next.set('seed', String(world.seed));
  history.replaceState({}, '', `${location.pathname}?${next}`);
  inGame = true;
  pauseMenuEl?.classList.add('hidden');
  pauseMenuEl?.setAttribute('aria-hidden', 'true');
  startEl.classList.add('hidden');
  syncMenuOpenUiClass();
  pendingPointerLock = true;
  canvas.requestPointerLock();
}

playBtn.addEventListener('click', () => {
  startPlay();
});

respawnBtn?.addEventListener('click', () => {
  doRespawn();
});

newWorldBtn?.addEventListener('click', () => {
  const seed = readSeedFromInput();
  applyWorld(new World(WORLD_H, seed));
  invSlots = gameMode === 'creative' ? createCreativeInventory() : createInventory();
  syncStatBarsVisibility();
  refreshInventoryUI();
  const next = new URLSearchParams(location.search);
  next.set('seed', String(seed));
  history.replaceState({}, '', `${location.pathname}?${next}`);
});

loadBtn?.addEventListener('click', () => {
  doLoad();
});

pauseResumeBtn?.addEventListener('click', () => {
  hidePauseMenu();
  pendingPointerLock = true;
  canvas.requestPointerLock();
});

pauseSaveBtn?.addEventListener('click', () => {
  doSave();
});

pauseLoadBtn?.addEventListener('click', () => {
  doLoad();
});

pauseMainMenuBtn?.addEventListener('click', () => {
  goToMainMenu();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) {
    pendingPointerLock = false;
    startEl.classList.add('hidden');
    hidePauseMenu();
    syncMenuOpenUiClass();
    startAmbient();
  } else {
    /* Inventory uses the mouse on DOM UI — pointer lock is released, but the game should keep running. */
    if (!invOpen) {
      keys.forward = false;
      keys.back = false;
      keys.left = false;
      keys.right = false;
      keys.jump = false;
      keys.swimDown = false;
      sprintLatched = false;
      mouseLeftDown = false;
    }
    if (!invOpen && !worldGuiOpen() && !pendingPointerLock && !playerDead) {
      if (inGame) {
        showPauseMenu();
      } else {
        hidePauseMenu();
        startEl.classList.remove('hidden');
        applyLeftHandedToUI();
      }
    }
    syncMenuOpenUiClass();
  }
});

function disposeEngine() {
  mainMenuTerrainCtl?.dispose();
  mainMenuTerrainCtl = null;
  clearMobsFromScene(scene, pigs, cows, squids, drops, zombies);
  disposePigMaterialBundle();
  disposeCowMaterialBundle();
  disposeSquidMaterialBundle();
  disposeZombieMaterialBundle();
  disposeMobsSharedResources();
  disposeAllBlockParticles(scene);
  disposeAllChunks();
  scene.remove(sunSprite, moonSprite);
  sunSpriteBundle.tex.dispose();
  sunSpriteBundle.mat.dispose();
  moonSpriteBundle.tex.dispose();
  moonSpriteBundle.mat.dispose();
  scene.remove(cloudLayer.group);
  disposeCloudLayer(cloudLayer);
  disposeWeatherParticles(scene, weatherParticles);
  scene.remove(starField);
  starField.geometry.dispose();
  const sm = starField.material;
  if (sm instanceof THREE.Material) sm.dispose();
  scene.remove(playerModel);
  invPlayerPreview.dispose();
  disposePlayerModel(playerModel);
  scene.remove(fpHand);
  disposeFirstPersonHand(fpHand);
  atlasTex.dispose();
  if (proceduralAtlasForDrops && proceduralAtlasForDrops !== atlasTex) {
    proceduralAtlasForDrops.dispose();
  }
  worldMat.dispose();
  cutoutMat.dispose();
  waterMat.dispose();
  lavaMat.dispose();
  selection.geometry.dispose();
  selectionMat.dispose();
  crackGeo.dispose();
  crackMat.dispose();
  disposeTorchEmbers(scene);
  disposeTorchLights(scene);
  renderer.dispose();
}

let rafId = 0;
let fpsHudAccumDt = 0;
let fpsHudFrames = 0;
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(rafId);
  disposeEngine();
});

function loop() {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  waterShimmerUniforms.uWaterTime.value = clock.getElapsedTime();
  updateFallCameraShake(dt);
  updateDayNight(dt);
  updateBlockBreakParticles(dt);

  tickAllFurnaces(dt);
  if (furnaceOpen) refreshFurnacePanel();

  const startHidden = startEl?.classList.contains('hidden');
  const pauseOpen = !!(pauseMenuEl && !pauseMenuEl.classList.contains('hidden'));
  const inGameHud = startHidden && !pauseOpen;
  if (
    coordsHudEl &&
    gameSettings.showCoordinates &&
    (pointerLocked || invOpen) &&
    inGameHud &&
    !worldGuiOpen()
  ) {
    coordsHudEl.textContent = `${Math.floor(player.x)} / ${Math.floor(player.y)} / ${Math.floor(player.z)}`;
    coordsHudEl.setAttribute('aria-hidden', 'false');
  } else if (coordsHudEl) {
    coordsHudEl.textContent = '';
    coordsHudEl.setAttribute('aria-hidden', 'true');
  }

  if (fpsHudEl) {
    if (gameSettings.showFps && inGameHud) {
      fpsHudAccumDt += dt;
      fpsHudFrames += 1;
      if (fpsHudAccumDt >= 0.5) {
        fpsHudEl.textContent = `${Math.round(fpsHudFrames / fpsHudAccumDt)} FPS`;
        fpsHudEl.setAttribute('aria-hidden', 'false');
        fpsHudAccumDt = 0;
        fpsHudFrames = 0;
      }
    } else {
      fpsHudEl.textContent = '';
      fpsHudEl.setAttribute('aria-hidden', 'true');
      fpsHudAccumDt = 0;
      fpsHudFrames = 0;
    }
  }

  if ((pointerLocked || invOpen) && !worldGuiOpen()) {
    const isSurvival = gameMode === 'survival';
    const sprintMove = canSprintNow() && !player.inWater && !player.inLava;
    keys.sprint = sprintMove || (gameMode === 'creative' && player.flying && sprintLatched && keys.forward);

    if (player.flying && gameMode === 'creative') {
      player.updateFlying(world, dt, keys, yaw);
    } else {
      player.update(world, dt, keys, yaw);
    }

    if (isSurvival) {
      if (sprintMove && player.onGround) {
        playerStamina = Math.max(0, playerStamina - STAMINA_DRAIN_PER_SEC * dt);
      } else {
        playerStamina = Math.min(MAX_STAMINA, playerStamina + STAMINA_REGEN_PER_SEC * dt);
      }

      /* ── Hunger drain ── */
      const hungerDrain = HUNGER_DRAIN_PER_SEC + (sprintMove ? HUNGER_SPRINT_DRAIN_PER_SEC : 0);
      playerHunger = Math.max(0, playerHunger - hungerDrain * dt);

      /* Passive HP regen when well-fed */
      if (playerHunger > HUNGER_REGEN_THRESHOLD && playerHealth < MAX_HEALTH) {
        playerHealth = Math.min(MAX_HEALTH, playerHealth + HEALTH_REGEN_PER_SEC * dt);
      }
      /* Starvation damage when hunger is critically low */
      if (playerHunger < HUNGER_STARVE_THRESHOLD && playerHealth > 1) {
        playerHealth = Math.max(1, playerHealth - STARVE_DAMAGE_PER_SEC * dt);
      }
    }

    const moving = keys.forward || keys.back || keys.left || keys.right;
    if (player.onGround && moving && !playerDead && !player.flying) {
      footstepCooldown -= dt;
      if (footstepCooldown <= 0) {
        playSound(player.inWater || player.inLava ? 'splash' : 'footstep');
        footstepCooldown = player.inWater || player.inLava ? 0.52 : 0.36;
      }
    } else {
      footstepCooldown = Math.min(footstepCooldown, 0.1);
    }

    if (isSurvival) {
      if (player.fellInVoid) {
        sprintLatched = false;
        showDeathScreen('Fell out of the world');
      } else {
        if (player.inLava && !player.flying) {
          playerHealth = Math.max(0, playerHealth - 6 * dt);
        }
        if (player.fallDamageThisFrame > 0) {
          const fd = damageAfterArmor(player.fallDamageThisFrame);
          playerHealth = Math.max(0, playerHealth - fd);
          addFallDamageCameraShake(player.fallDamageThisFrame);
          playSound('hurt');
        }
        if (playerHealth <= 0) {
          sprintLatched = false;
          const reason =
            player.inLava && !player.flying
              ? 'Burned in lava'
              : player.fallDamageThisFrame > 0
                ? 'Fell from a high place'
                : 'Starved to death';
          showDeathScreen(reason);
        }
      }
    }
  }
  updateStatBarsUI();
  syncPlayerModel(dt);
  if (invOpen) {
    const slot = invSlots[HOTBAR_OFFSET + hotbarIndex];
    const invHeldId = isEmptySlot(slot) ? 0 : slot.blockId;
    invPlayerPreview.tick(dt, true, { heldBlockId: invHeldId, leftHanded });
  }
  syncCamera(dt);
  syncCloudLayerPosition(cloudLayer, camera);
  if (startEl?.classList.contains('hidden')) {
    const rainParticleExposure = computeRainParticleExposure(
      world,
      player.y + player.eyeHeight,
      Math.floor(player.x),
      Math.floor(player.z),
      world.seed,
    ).exposure;
    updateWeatherParticles(
      weatherParticles,
      dt,
      camera,
      weatherDisplay.kind,
      weatherDisplay.strength,
      clock.getElapsedTime(),
      world,
      rainParticleExposure,
    );
  } else {
    weatherParticles.points.visible = false;
    weatherParticles.rainMesh.visible = false;
  }
  /** Title or pause: still stream chunk meshes so the world is mostly built before Play (reduces post-click hitching). */
  const chunkMenuOrPause =
    !startEl?.classList.contains('hidden') ||
    !!(pauseMenuEl && !pauseMenuEl.classList.contains('hidden'));
  syncVisibleChunks();
  const backlog = chunkBuildPending.size;
  const catchingUp = !chunkMenuOrPause && backlog > CHUNK_BACKLOG_CATCHUP_THRESHOLD;
  const loadMul = Math.max(0.5, Math.min(2, gameSettings.terrainLoadSpeed));
  const chunkTimeBudgetMs =
    (chunkMenuOrPause
      ? CHUNK_BUILD_TIME_BUDGET_MS_MENU
      : catchingUp
        ? CHUNK_BUILD_TIME_BUDGET_MS_PLAY_CATCHUP
        : CHUNK_BUILD_TIME_BUDGET_MS_PLAY) * loadMul;
  const chunkMaxBuilds = Math.max(
    1,
    Math.round(
      (chunkMenuOrPause ? CHUNK_BUILD_MAX_PER_FRAME_MENU : CHUNK_BUILD_MAX_PER_FRAME_PLAY) * loadMul,
    ),
  );
  processChunkBuildQueue(chunkMaxBuilds, chunkTimeBudgetMs);
  updateChunkDrawVisibility();

  /** Title or pause menu open — skip mobs and mining to save CPU/GPU. */
  const worldSimActive =
    !!startEl?.classList.contains('hidden') &&
    (!pauseMenuEl || pauseMenuEl.classList.contains('hidden'));
  if (worldSimActive) {
    for (let i = pigs.length - 1; i >= 0; i--) {
      updatePig(pigs[i], world, dt);
      if (pigs[i].pendingDeathCleanup) {
        finalizeDeadPig(scene, pigs, i, atlasTex, drops, world);
      }
    }
    for (let i = cows.length - 1; i >= 0; i--) {
      updateCow(cows[i], world, dt);
      if (cows[i].pendingDeathCleanup) {
        finalizeDeadCow(scene, cows, i, atlasTex, drops, world);
      }
    }
    for (let i = squids.length - 1; i >= 0; i--) {
      updateSquid(squids[i], world, dt);
      if (squids[i].pendingDeathCleanup) {
        finalizeDeadSquid(scene, squids, i);
      }
    }
    const playerPos = { x: player.x, y: player.y, z: player.z };
    for (let i = zombies.length - 1; i >= 0; i--) {
      updateZombie(zombies[i], world, dt, playerPos);
      if (zombies[i].pendingDeathCleanup) {
        finalizeDeadZombie(scene, zombies, i, atlasTex, drops);
        continue;
      }
      if (!playerDead && (pointerLocked || invOpen) && zombies[i].state !== 'dying') {
        const zx = player.x - zombies[i].x;
        const zz = player.z - zombies[i].z;
        if (zx * zx + zz * zz < 196 && Math.random() < 0.0015 * dt * 60) {
          playSound('mobGrowl');
        }
      }
      if (!playerDead && (pointerLocked || invOpen) && gameMode === 'survival') {
        const dmg = zombieContactDamage(zombies[i], player);
        if (dmg > 0) {
          const d = damageAfterArmor(dmg);
          playerHealth = Math.max(0, playerHealth - d);
          playSound('hurt');
          if (playerHealth <= 0) {
            showDeathScreen('Slain by Zombie');
          }
        }
      }
    }
    tickGroundDrops(world, drops, dt);
    orientDropsToCamera(drops, camera, clock.getElapsedTime());
    const pickedUp = tryPickupDrops(player, drops, invSlots, {
      hotbarOnly: gameMode === 'creative',
    });
    for (let i = 0; i < pickedUp.length; i++) scene.remove(pickedUp[i].mesh);
    if (pickedUp.length) {
      refreshInventoryUI();
      playSound('pop');
    }

    mobRespawnTimer += dt;
    if (mobRespawnTimer >= MOB_RESPAWN_INTERVAL) {
      mobRespawnTimer = 0;
      if (pigs.length < TARGET_PIG_COUNT) {
        spawnPigsAroundWorld(world, scene, pigs, TARGET_PIG_COUNT - pigs.length, player.x, player.z);
      }
      if (cows.length < TARGET_COW_COUNT) {
        spawnCowsAroundWorld(world, scene, cows, TARGET_COW_COUNT - cows.length, player.x, player.z);
      }
      if (squids.length < TARGET_SQUID_COUNT) {
        spawnSquidsInWater(world, scene, squids, TARGET_SQUID_COUNT - squids.length, player.x, player.z);
      }
      /* Night: 12500–23500 ticks (of 24000 cycle) */
      const isNight = worldTimeTicks > 12500 && worldTimeTicks < 23500;
      if (isNight && zombies.length < TARGET_ZOMBIE_COUNT_NIGHT) {
        const need = TARGET_ZOMBIE_COUNT_NIGHT - zombies.length;
        const wave = Math.min(
          need,
          Math.max(1, Math.ceil(need * (0.55 + currentNightF * 0.85))),
        );
        spawnZombiesAroundPlayer(world, scene, zombies, wave, player.x, player.z);
      }
      if (!isNight && ZOMBIE_DESPAWN_DAYLIGHT) {
        for (let i = zombies.length - 1; i >= 0; i--) {
          if (zombies[i].state !== 'dying') {
            scene.remove(zombies[i].mesh);
            zombies.splice(i, 1);
          }
        }
      }
    }

    syncFirstPersonHandView();
    updateMining(dt);
    if (pointerLocked && !invOpen && !worldGuiOpen()) {
      updateSelection();
    }
  }

  /** Hide FP hand from the main pass so it never writes depth into the world buffer. */
  const fpHandWasVisible = fpHand.visible;
  if (fpHandWasVisible) fpHand.visible = false;

  camera.layers.set(0);
  renderer.autoClear = true;
  renderer.autoClearColor = true;
  renderer.autoClearDepth = true;
  renderer.autoClearStencil = true;
  renderer.render(scene, camera);

  if (fpHandWasVisible) {
    fpHand.visible = true;
    const prevAuto = renderer.autoClear;
    const prevColor = renderer.autoClearColor;
    const prevDepth = renderer.autoClearDepth;
    const prevStencil = renderer.autoClearStencil;
    try {
      renderer.autoClear = false;
      renderer.autoClearColor = false;
      renderer.autoClearDepth = false;
      renderer.autoClearStencil = false;
      renderer.clearDepth();
      camera.layers.set(FP_HAND_LAYER);
      renderer.render(scene, camera);
    } finally {
      renderer.autoClear = prevAuto;
      renderer.autoClearColor = prevColor;
      renderer.autoClearDepth = prevDepth;
      renderer.autoClearStencil = prevStencil;
      camera.layers.set(0);
    }
  }

  syncUnderwaterScreenEffect();
  const onMainMenu = !startEl?.classList.contains('hidden');
  const menuOrPause = onMainMenu || pauseOpen;
  let rainShelter = null;
  if (!menuOrPause) {
    rainShelter = computeRainShelter(
      world,
      player.y + player.eyeHeight,
      Math.floor(player.x),
      Math.floor(player.z),
      world.seed,
    );
  }
  updateAmbient({
    underwater: player.inWater,
    nightFactor: currentNightF,
    weather:
      menuOrPause ? null : { kind: weatherDisplay.kind, strength: weatherDisplay.strength },
    rainShelter,
  });
  updateTorchLights(world, player, dt, gameSettings.maxTorchLights);
  updateTorchEmbers(world, player, dt, gameSettings.maxTorchLights);
}

loop();
