const STORAGE_KEY = 'minicraft-settings-v1';

/** @typedef {'high' | 'balanced' | 'fast'} ShadowQualityPreset */
/** @typedef {'full' | 'balanced' | 'minimal'} WeatherEffectsQuality */

/**
 * @typedef {{
 *   fov: number,
 *   mouseSens: number,
 *   masterVolume: number,
 *   invertMouseY: boolean,
 *   invertMouseX: boolean,
 *   chunkRenderRadius: number,
 *   terrainLoadSpeed: number,
 *   showCoordinates: boolean,
 *   showFps: boolean,
 *   disableHotbarScroll: boolean,
 *   shadowsEnabled: boolean,
 *   shadowQuality: ShadowQualityPreset,
 *   renderScale: number,
 *   maxTorchLights: number,
 *   showClouds: boolean,
 *   viewBobbing: boolean,
 *   cameraShake: boolean,
 *   blockBreakParticles: boolean,
 *   showMinimap: boolean,
 *   ambientMusicBed: boolean,
 *   weatherEffectsQuality: WeatherEffectsQuality,
 * }} GameSettings
 */

const DEFAULTS = {
  fov: 70,
  mouseSens: 1,
  masterVolume: 1,
  invertMouseY: false,
  invertMouseX: false,
  chunkRenderRadius: 7,
  /** 1 = default chunk time budget; higher = faster terrain pop-in, more CPU per frame. */
  terrainLoadSpeed: 1,
  showCoordinates: true,
  showFps: false,
  disableHotbarScroll: false,
  shadowsEnabled: true,
  /** Shadow map resolution + filtering when shadows are on. */
  shadowQuality: /** @type {ShadowQualityPreset} */ ('high'),
  /** Multiplies capped device pixel ratio (0.5–1). Lower = faster, softer image. */
  renderScale: 1,
  /** Point lights for nearby torches (pool size is fixed; this caps how many are active). */
  maxTorchLights: 16,
  showClouds: true,
  viewBobbing: true,
  cameraShake: true,
  blockBreakParticles: true,
  showMinimap: true,
  /** Very quiet procedural pad under wind / weather. */
  ambientMusicBed: true,
  /**
   * Rain/snow particle cost: full = best look; balanced = default; minimal = fastest (additive rain, no streak rays).
   */
  weatherEffectsQuality: /** @type {WeatherEffectsQuality} */ ('balanced'),
};

const SHADOW_QUALITY_SET = new Set(['high', 'balanced', 'fast']);
const WEATHER_EFFECTS_QUALITY_SET = new Set(['full', 'balanced', 'minimal']);

/** @param {unknown} v */
function toWeatherEffectsQuality(v) {
  return typeof v === 'string' && WEATHER_EFFECTS_QUALITY_SET.has(v)
    ? /** @type {WeatherEffectsQuality} */ (v)
    : DEFAULTS.weatherEffectsQuality;
}
const TORCH_LIGHT_LEVELS = [4, 8, 12, 16];

/** @param {unknown} v */
function toShadowQuality(v) {
  return typeof v === 'string' && SHADOW_QUALITY_SET.has(v)
    ? /** @type {ShadowQualityPreset} */ (v)
    : DEFAULTS.shadowQuality;
}

/** @param {unknown} n */
function toTorchLightBudget(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return DEFAULTS.maxTorchLights;
  let best = TORCH_LIGHT_LEVELS[0];
  let bestD = Math.abs(x - best);
  for (const t of TORCH_LIGHT_LEVELS) {
    const d = Math.abs(x - t);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** @param {unknown} n */
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** @param {unknown} v */
function toBool(v, /** @type {boolean} */ fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * @returns {GameSettings}
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw);
    return {
      fov: clamp(Number(o.fov) || DEFAULTS.fov, 55, 100),
      mouseSens: clamp(Number(o.mouseSens) || DEFAULTS.mouseSens, 0.25, 2.5),
      masterVolume: clamp(Number.isFinite(Number(o.masterVolume)) ? Number(o.masterVolume) : DEFAULTS.masterVolume, 0, 1),
      invertMouseY: toBool(o.invertMouseY, DEFAULTS.invertMouseY),
      invertMouseX: toBool(o.invertMouseX, DEFAULTS.invertMouseX),
      chunkRenderRadius: clamp(
        Number(o.chunkRenderRadius) || DEFAULTS.chunkRenderRadius,
        4,
        12,
      ),
      terrainLoadSpeed: clamp(
        Number(o.terrainLoadSpeed) || DEFAULTS.terrainLoadSpeed,
        0.5,
        2,
      ),
      showCoordinates: toBool(o.showCoordinates, DEFAULTS.showCoordinates),
      showFps: toBool(o.showFps, DEFAULTS.showFps),
      disableHotbarScroll: toBool(o.disableHotbarScroll, DEFAULTS.disableHotbarScroll),
      shadowsEnabled: toBool(o.shadowsEnabled, DEFAULTS.shadowsEnabled),
      shadowQuality: toShadowQuality(o.shadowQuality),
      renderScale: clamp(Number(o.renderScale) || DEFAULTS.renderScale, 0.5, 1),
      maxTorchLights: toTorchLightBudget(o.maxTorchLights),
      showClouds: toBool(o.showClouds, DEFAULTS.showClouds),
      viewBobbing: toBool(o.viewBobbing, DEFAULTS.viewBobbing),
      cameraShake: toBool(o.cameraShake, DEFAULTS.cameraShake),
      blockBreakParticles: toBool(o.blockBreakParticles, DEFAULTS.blockBreakParticles),
      showMinimap: toBool(o.showMinimap, DEFAULTS.showMinimap),
      ambientMusicBed: toBool(o.ambientMusicBed, DEFAULTS.ambientMusicBed),
      weatherEffectsQuality: toWeatherEffectsQuality(o.weatherEffectsQuality),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {Partial<GameSettings>} patch
 * @returns {GameSettings}
 */
export function saveSettings(patch) {
  const cur = loadSettings();
  const next = {
    fov: patch.fov !== undefined ? clamp(patch.fov, 55, 100) : cur.fov,
    mouseSens:
      patch.mouseSens !== undefined ? clamp(patch.mouseSens, 0.25, 2.5) : cur.mouseSens,
    masterVolume:
      patch.masterVolume !== undefined ? clamp(patch.masterVolume, 0, 1) : cur.masterVolume,
    invertMouseY: patch.invertMouseY !== undefined ? !!patch.invertMouseY : cur.invertMouseY,
    invertMouseX: patch.invertMouseX !== undefined ? !!patch.invertMouseX : cur.invertMouseX,
    chunkRenderRadius:
      patch.chunkRenderRadius !== undefined
        ? clamp(patch.chunkRenderRadius, 4, 12)
        : cur.chunkRenderRadius,
    terrainLoadSpeed:
      patch.terrainLoadSpeed !== undefined
        ? clamp(patch.terrainLoadSpeed, 0.5, 2)
        : cur.terrainLoadSpeed,
    showCoordinates:
      patch.showCoordinates !== undefined ? !!patch.showCoordinates : cur.showCoordinates,
    showFps: patch.showFps !== undefined ? !!patch.showFps : cur.showFps,
    disableHotbarScroll:
      patch.disableHotbarScroll !== undefined
        ? !!patch.disableHotbarScroll
        : cur.disableHotbarScroll,
    shadowsEnabled: patch.shadowsEnabled !== undefined ? !!patch.shadowsEnabled : cur.shadowsEnabled,
    shadowQuality:
      patch.shadowQuality !== undefined ? toShadowQuality(patch.shadowQuality) : cur.shadowQuality,
    renderScale:
      patch.renderScale !== undefined
        ? clamp(patch.renderScale, 0.5, 1)
        : cur.renderScale,
    maxTorchLights:
      patch.maxTorchLights !== undefined
        ? toTorchLightBudget(patch.maxTorchLights)
        : cur.maxTorchLights,
    showClouds: patch.showClouds !== undefined ? !!patch.showClouds : cur.showClouds,
    viewBobbing: patch.viewBobbing !== undefined ? !!patch.viewBobbing : cur.viewBobbing,
    cameraShake: patch.cameraShake !== undefined ? !!patch.cameraShake : cur.cameraShake,
    blockBreakParticles:
      patch.blockBreakParticles !== undefined
        ? !!patch.blockBreakParticles
        : cur.blockBreakParticles,
    showMinimap: patch.showMinimap !== undefined ? !!patch.showMinimap : cur.showMinimap,
    ambientMusicBed:
      patch.ambientMusicBed !== undefined ? !!patch.ambientMusicBed : cur.ambientMusicBed,
    weatherEffectsQuality:
      patch.weatherEffectsQuality !== undefined
        ? toWeatherEffectsQuality(patch.weatherEffectsQuality)
        : cur.weatherEffectsQuality,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export { DEFAULTS as DEFAULT_GAME_SETTINGS };
