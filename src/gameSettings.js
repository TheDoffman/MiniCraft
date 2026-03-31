const STORAGE_KEY = 'minicraft-settings-v1';

/** @typedef {{ fov: number, mouseSens: number, masterVolume: number }} GameSettings */

const DEFAULTS = {
  fov: 70,
  mouseSens: 1,
  masterVolume: 1,
};

/** @param {unknown} n */
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
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
      masterVolume: clamp(Number(o.masterVolume) ?? DEFAULTS.masterVolume, 0, 1),
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
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export { DEFAULTS as DEFAULT_GAME_SETTINGS };
