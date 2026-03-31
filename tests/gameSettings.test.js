import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_GAME_SETTINGS } from '../src/gameSettings.js';

/** @type {Record<string, string>} */
let lsStore = {};

describe('gameSettings', () => {
  beforeAll(() => {
    globalThis.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
      setItem: (k, v) => {
        lsStore[k] = String(v);
      },
      removeItem: (k) => {
        delete lsStore[k];
      },
      clear: () => {
        lsStore = {};
      },
      get length() {
        return Object.keys(lsStore).length;
      },
      key: (i) => Object.keys(lsStore)[i] ?? null,
    };
  });
  beforeEach(() => {
    lsStore = {};
  });
  afterEach(() => {
    lsStore = {};
  });

  it('defaults include extended fields', () => {
    expect(DEFAULT_GAME_SETTINGS.chunkRenderRadius).toBe(7);
    expect(DEFAULT_GAME_SETTINGS.terrainLoadSpeed).toBe(1);
    expect(DEFAULT_GAME_SETTINGS.invertMouseY).toBe(false);
    expect(DEFAULT_GAME_SETTINGS.invertMouseX).toBe(false);
    expect(DEFAULT_GAME_SETTINGS.showCoordinates).toBe(true);
    expect(DEFAULT_GAME_SETTINGS.showFps).toBe(false);
    expect(DEFAULT_GAME_SETTINGS.disableHotbarScroll).toBe(false);
    expect(DEFAULT_GAME_SETTINGS.shadowsEnabled).toBe(true);
    expect(DEFAULT_GAME_SETTINGS.shadowQuality).toBe('high');
    expect(DEFAULT_GAME_SETTINGS.renderScale).toBe(1);
    expect(DEFAULT_GAME_SETTINGS.maxTorchLights).toBe(16);
    expect(DEFAULT_GAME_SETTINGS.showClouds).toBe(true);
    expect(DEFAULT_GAME_SETTINGS.viewBobbing).toBe(true);
    expect(DEFAULT_GAME_SETTINGS.cameraShake).toBe(true);
    expect(DEFAULT_GAME_SETTINGS.blockBreakParticles).toBe(true);
    expect(loadSettings().chunkRenderRadius).toBe(7);
    expect(loadSettings().terrainLoadSpeed).toBe(1);
  });

  it('saveSettings patches booleans and render radius', () => {
    const a = saveSettings({ invertMouseY: true, chunkRenderRadius: 5 });
    expect(a.invertMouseY).toBe(true);
    expect(a.chunkRenderRadius).toBe(5);
    const b = saveSettings({ showFps: true, showCoordinates: false });
    expect(b.showFps).toBe(true);
    expect(b.showCoordinates).toBe(false);
    expect(b.invertMouseY).toBe(true);
  });

  it('saveSettings patches terrain load speed and graphics toggles', () => {
    const c = saveSettings({
      terrainLoadSpeed: 1.5,
      invertMouseX: true,
      shadowsEnabled: false,
      showClouds: false,
      viewBobbing: false,
      cameraShake: false,
      blockBreakParticles: false,
    });
    expect(c.terrainLoadSpeed).toBe(1.5);
    expect(c.invertMouseX).toBe(true);
    expect(c.shadowsEnabled).toBe(false);
    expect(c.showClouds).toBe(false);
    expect(c.viewBobbing).toBe(false);
    expect(c.cameraShake).toBe(false);
    expect(c.blockBreakParticles).toBe(false);
    const d = loadSettings();
    expect(d.terrainLoadSpeed).toBe(1.5);
    expect(d.invertMouseX).toBe(true);
  });

  it('loadSettings clamps terrain load speed', () => {
    localStorage.setItem(
      'minicraft-settings-v1',
      JSON.stringify({ terrainLoadSpeed: 99, invertMouseX: 'yes' }),
    );
    const s = loadSettings();
    expect(s.terrainLoadSpeed).toBe(2);
    expect(s.invertMouseX).toBe(false);
  });

  it('loadSettings validates shadow quality and snaps torch budget', () => {
    localStorage.setItem(
      'minicraft-settings-v1',
      JSON.stringify({
        shadowQuality: 'ultra',
        maxTorchLights: 9,
        renderScale: 2,
      }),
    );
    const s = loadSettings();
    expect(s.shadowQuality).toBe('high');
    expect(s.maxTorchLights).toBe(8);
    expect(s.renderScale).toBe(1);
  });

  it('saveSettings persists performance fields', () => {
    const x = saveSettings({
      shadowQuality: 'fast',
      renderScale: 0.75,
      maxTorchLights: 4,
    });
    expect(x.shadowQuality).toBe('fast');
    expect(x.renderScale).toBe(0.75);
    expect(x.maxTorchLights).toBe(4);
    expect(loadSettings().shadowQuality).toBe('fast');
  });
});
