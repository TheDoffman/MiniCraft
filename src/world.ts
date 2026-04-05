import { BLOCKS, BlockId, blockDef, isDoorBottomId, isDoorTopId } from './blocktypes';
import { TorchAttach } from './torchAttach';
import { biomeParam, hashSeed, surfaceHeight, getBiome, BIOME, caveNoise } from './worldgen';
import { CHUNK_XZ } from './chunks';
import { SEA_LEVEL } from './gameState';
import { recomputeWaterBox } from './waterFlow';

export { biomeParam, hashSeed, surfaceHeight, getBiome, BIOME, caveNoise } from './worldgen';

function isFluidAt(world, x, y, z) {
  const id = world.get(x, y, z);
  return id !== 0 && !!BLOCKS[id]?.fluid;
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function idxLocal(lx, y, lz, h) {
  return lx + CHUNK_XZ * (y + h * lz);
}

export class World {
  height: number;
  seed: number;
  chunks: Map<string, Uint8Array>;
  _waterMeta: Map<string, Uint8Array>;
  _torchMeta: Map<string, Uint8Array>;
  _doorMeta: Map<string, Uint8Array>;
  _airOnly: boolean;

  /**
   * @param height Y extent (vertical column height)
   * @param seed
   * @param opts If airOnly, chunks stay empty until set() (tests).
   */
  constructor(height: number, seed = 12345, opts: { airOnly?: boolean } = {}) {
    this.height = height;
    this.seed = seed;
    this.chunks = new Map();
    this._waterMeta = new Map();
    this._torchMeta = new Map();
    this._doorMeta = new Map();
    this._airOnly = !!opts.airOnly;
  }

  /**
   * @param {number} width legacy flat width
   * @param {number} height
   * @param {number} depth legacy flat depth
   * @param {number} seed
   * @param {Uint8Array} data width*height*depth
   */
  static fromLegacyFlat(width, height, depth, seed, data) {
    const w = new World(height, seed);
    const expected = width * height * depth;
    if (data.length !== expected) {
      throw new Error('World data size mismatch');
    }
    for (let cz = 0; cz < Math.ceil(depth / CHUNK_XZ); cz++) {
      for (let cx = 0; cx < Math.ceil(width / CHUNK_XZ); cx++) {
        const buf = new Uint8Array(CHUNK_XZ * height * CHUNK_XZ);
        for (let lz = 0; lz < CHUNK_XZ; lz++) {
          const wz = cz * CHUNK_XZ + lz;
          if (wz >= depth) continue;
          for (let lx = 0; lx < CHUNK_XZ; lx++) {
            const wx = cx * CHUNK_XZ + lx;
            if (wx >= width) continue;
            for (let y = 0; y < height; y++) {
              const src = wx + width * (y + height * wz);
              buf[idxLocal(lx, y, lz, height)] = data[src];
            }
          }
        }
        w.chunks.set(chunkKey(cx, cz), buf);
      }
    }
    return w;
  }

  /**
   * @param {number} height
   * @param {number} seed
   * @param {Record<string, string>} chunksBase64 cx,cz -> base64 chunk blob
   * @param {Record<string, string> | null} [waterChunksBase64] same keys, flow level bytes (v5 saves)
   * @param {Record<string, string> | null} [torchChunksBase64] same keys, torch attach bytes (v6 saves)
   * @param {Record<string, string> | null} [doorChunksBase64] same keys, door facing bytes (v7 saves)
   */
  static fromChunkSave(
    height,
    seed,
    chunksBase64,
    waterChunksBase64 = null,
    torchChunksBase64 = null,
    doorChunksBase64 = null,
  ) {
    const w = new World(height, seed);
    const perChunk = CHUNK_XZ * height * CHUNK_XZ;
    for (const [k, b64] of Object.entries(chunksBase64)) {
      const buf = base64ToUint8(b64);
      if (buf.length !== perChunk) {
        throw new Error(`Chunk ${k} size mismatch`);
      }
      w.chunks.set(k, buf);
    }
    if (waterChunksBase64) {
      for (const [k, b64] of Object.entries(waterChunksBase64)) {
        const buf = base64ToUint8(b64);
        if (buf.length !== perChunk) {
          throw new Error(`Water chunk ${k} size mismatch`);
        }
        w._waterMeta.set(k, buf);
      }
    }
    if (torchChunksBase64) {
      for (const [k, b64] of Object.entries(torchChunksBase64)) {
        const buf = base64ToUint8(b64);
        if (buf.length !== perChunk) {
          throw new Error(`Torch chunk ${k} size mismatch`);
        }
        w._torchMeta.set(k, buf);
      }
    }
    if (doorChunksBase64) {
      for (const [k, b64] of Object.entries(doorChunksBase64)) {
        const buf = base64ToUint8(b64);
        if (buf.length !== perChunk) {
          throw new Error(`Door chunk ${k} size mismatch`);
        }
        w._doorMeta.set(k, buf);
      }
    }
    return w;
  }

  /**
   * Fix chunk bytes from saves made while BlockId SNOW/ICE (and door-top ids) disagreed with BLOCKS order.
   */
  migrateMisassignedSnowIceFromOlderBuilds() {
    const h = this.height;
    for (const [key, buf] of this.chunks) {
      const [scx, scz] = key.split(',').map(Number);
      for (let lz = 0; lz < CHUNK_XZ; lz++) {
        for (let lx = 0; lx < CHUNK_XZ; lx++) {
          const wx = scx * CHUNK_XZ + lx;
          const wz = scz * CHUNK_XZ + lz;
          for (let y = 1; y < h; y++) {
            const idx = idxLocal(lx, y, lz, h);
            const id = buf[idx];
            if (id === 49) {
              const below = this.get(wx, y - 1, wz);
              if (below !== BlockId.DOOR && below !== BlockId.DOOR_OPEN) {
                buf[idx] = BlockId.SNOW;
              }
            } else if (id === 50) {
              const below = this.get(wx, y - 1, wz);
              if (below !== BlockId.DOOR_OPEN) {
                buf[idx] = BlockId.ICE;
              }
            } else if (id === 53) {
              const below = this.get(wx, y - 1, wz);
              if (below === BlockId.DOOR) buf[idx] = BlockId.DOOR_TOP;
              else if (below === BlockId.DOOR_OPEN) buf[idx] = BlockId.DOOR_OPEN_TOP;
            } else if (id === 54) {
              const below = this.get(wx, y - 1, wz);
              if (below === BlockId.DOOR_OPEN) buf[idx] = BlockId.DOOR_OPEN_TOP;
            }
          }
        }
      }
    }
  }

  /** @deprecated use fromLegacyFlat */
  static fromSerialized(width, height, depth, seed, data) {
    return World.fromLegacyFlat(width, height, depth, seed, data);
  }

  inBounds(x, y, z) {
    return (
      Number.isFinite(x) &&
      Number.isFinite(z) &&
      y >= 0 &&
      y < this.height
    );
  }

  /**
   * @param {number} cx
   * @param {number} cz
   * @returns {Uint8Array}
   */
  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let buf = this.chunks.get(key);
    if (buf) return buf;
    buf = new Uint8Array(CHUNK_XZ * this.height * CHUNK_XZ);
    if (this._airOnly) {
      this.chunks.set(key, buf);
      return buf;
    }
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        this._fillColumn(buf, lx, lz, wx, wz);
      }
    }
    this.chunks.set(key, buf);
    this._postProcessChunk(cx, cz, buf);
    return buf;
  }

  get(x, y, z) {
    if (y < 0 || y >= this.height) return 0;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const buf = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    return buf[idxLocal(lx, y, lz, this.height)];
  }

  /**
   * Block id without loading/generating terrain. Missing chunk → null.
   * @returns {number | null}
   */
  getBlockIfLoaded(x, y, z) {
    if (y < 0 || y >= this.height) return 0;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const buf = this.chunks.get(chunkKey(cx, cz));
    if (!buf) return null;
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    return buf[idxLocal(lx, y, lz, this.height)];
  }

  /**
   * Flow level 0–7 for water (0 = infinite source). Non-water or missing meta reads as 0.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  getWaterLevel(x, y, z) {
    return this.getWaterLevelIfLoaded(x, y, z);
  }

  /**
   * Flow meta for loaded chunks only (no chunk generation).
   * @returns {number}
   */
  getWaterLevelIfLoaded(x, y, z) {
    if (y < 0 || y >= this.height) return 0;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const wm = this._waterMeta.get(chunkKey(cx, cz));
    if (!wm) return 0;
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    return wm[idxLocal(lx, y, lz, this.height)] & 7;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} level 0–7
   */
  setWaterLevel(x, y, z, level) {
    if (y < 0 || y >= this.height) return;
    if (this.getBlockIfLoaded(x, y, z) !== BlockId.WATER) return;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const wm = this._ensureWaterMeta(cx, cz);
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    wm[idxLocal(lx, y, lz, this.height)] = Math.max(0, Math.min(7, level | 0));
  }

  /**
   * @param {number} cx
   * @param {number} cz
   * @returns {Uint8Array}
   */
  _ensureWaterMeta(cx, cz) {
    const key = chunkKey(cx, cz);
    let m = this._waterMeta.get(key);
    if (!m) {
      m = new Uint8Array(CHUNK_XZ * this.height * CHUNK_XZ);
      this._waterMeta.set(key, m);
    }
    return m;
  }

  set(x, y, z, id) {
    if (y < 0 || y >= this.height) return;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const buf = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    const idx = idxLocal(lx, y, lz, this.height);
    const oldId = buf[idx];
    buf[idx] = id;
    const key = chunkKey(cx, cz);
    if (id !== BlockId.WATER) {
      const wm = this._waterMeta.get(key);
      if (wm) wm[idx] = 0;
    } else {
      const wm = this._ensureWaterMeta(cx, cz);
      if (oldId !== BlockId.WATER) wm[idx] = 0;
    }
    if (id !== BlockId.TORCH) {
      const tm = this._torchMeta.get(key);
      if (tm) tm[idx] = TorchAttach.AUTO;
    }
    if (!isDoorBottomId(id)) {
      const dm = this._doorMeta.get(key);
      if (dm) dm[idx] = 0;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number} TorchAttach, 0 = unset (infer)
   */
  getTorchAttach(x, y, z) {
    if (y < 0 || y >= this.height) return TorchAttach.AUTO;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const tm = this._torchMeta.get(chunkKey(cx, cz));
    if (!tm) return TorchAttach.AUTO;
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    return tm[idxLocal(lx, y, lz, this.height)] ?? TorchAttach.AUTO;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} attach TorchAttach 1–6
   */
  setTorchAttach(x, y, z, attach) {
    if (y < 0 || y >= this.height) return;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const buf = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    const idx = idxLocal(lx, y, lz, this.height);
    if (buf[idx] !== BlockId.TORCH) return;
    const tm = this._ensureTorchMeta(cx, cz);
    const a = attach | 0;
    tm[idx] = a >= 1 && a <= 6 ? a : TorchAttach.AUTO;
  }

  /**
   * @param {number} cx
   * @param {number} cz
   * @returns {Uint8Array}
   */
  _ensureTorchMeta(cx, cz) {
    const key = chunkKey(cx, cz);
    let m = this._torchMeta.get(key);
    if (!m) {
      m = new Uint8Array(CHUNK_XZ * this.height * CHUNK_XZ);
      this._torchMeta.set(key, m);
    }
    return m;
  }

  /**
   * @param {number} cx
   * @param {number} cz
   * @returns {Uint8Array}
   */
  _ensureDoorMeta(cx, cz) {
    const key = chunkKey(cx, cz);
    let m = this._doorMeta.get(key);
    if (!m) {
      m = new Uint8Array(CHUNK_XZ * this.height * CHUNK_XZ);
      this._doorMeta.set(key, m);
    }
    return m;
  }

  /**
   * Facing 0–3 (+X,-X,+Z,-Z wall) and hingeRight in bit 2. Bottom door cell only.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  getDoorMeta(x, y, z) {
    if (y < 0 || y >= this.height) return 0;
    let by = y;
    let id = this.get(x, y, z);
    if (isDoorTopId(id)) {
      by = y - 1;
      if (by < 0) return 0;
      id = this.get(x, by, z);
    }
    if (!isDoorBottomId(id)) return 0;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    const dm = this._doorMeta.get(chunkKey(cx, cz));
    if (!dm) return 0;
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    return dm[idxLocal(lx, by, lz, this.height)] & 7;
  }

  /**
   * @param {number} x
   * @param {number} y bottom door Y
   * @param {number} z
   * @param {number} meta 0–7
   */
  setDoorMeta(x, y, z, meta) {
    if (y < 0 || y >= this.height) return;
    if (!isDoorBottomId(this.get(x, y, z))) return;
    const cx = Math.floor(x / CHUNK_XZ);
    const cz = Math.floor(z / CHUNK_XZ);
    this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_XZ;
    const lz = z - cz * CHUNK_XZ;
    const dm = this._ensureDoorMeta(cx, cz);
    dm[idxLocal(lx, y, lz, this.height)] = meta & 7;
  }

  _fillColumn(buf, lx, lz, wx, wz) {
    const h = this.height;
    const { seed } = this;
    const dirtDepth = 2 + Math.floor(hashSeed(wx >> 2, wz >> 2, seed + 66) * 3);
    const b = biomeParam(wx, wz, seed);
    const sh = surfaceHeight(wx, wz, seed, b);
    const biome = getBiome(b);

    for (let y = 0; y < h; y++) {
      let id = BlockId.AIR;
      if (y > sh) {
        id = BlockId.AIR;
      } else if (y === sh) {
        /* Surface block — biome-specific. */
        if (biome === BIOME.DESERT) {
          /* Badlands pockets: sandstone tops instead of sand. */
          id =
            hashSeed(wx, wz, seed + 171) > 0.82 ? BlockId.SANDSTONE : BlockId.SAND;
        } else if (biome === BIOME.TUNDRA) {
          /* Above beach line: snow; near water: keep sand. */
          id = sh <= SEA_LEVEL + 1 ? BlockId.SAND : BlockId.SNOW;
        } else if (biome === BIOME.HIGHLANDS && sh > SEA_LEVEL + 8) {
          /* High rocky peaks: bare stone. */
          id = hashSeed(wx, wz, seed + 44) < 0.35 ? BlockId.STONE : BlockId.GRASS;
        } else {
          /* Plains / Forest + beach transition. */
          const beach = sh <= SEA_LEVEL + 1 && hashSeed(wx, wz, seed + 99) > 0.6;
          id = beach ? BlockId.SAND : BlockId.GRASS;
        }
      } else if (y >= sh - dirtDepth) {
        /* Subsurface layer. */
        if (biome === BIOME.DESERT) {
          id = BlockId.SANDSTONE;
        } else if (biome === BIOME.TUNDRA) {
          id = BlockId.DIRT;
        } else {
          id = BlockId.DIRT;
        }
      } else {
        id = BlockId.STONE;
      }
      buf[idxLocal(lx, y, lz, h)] = id;
    }
    buf[idxLocal(lx, 0, lz, h)] = BlockId.BEDROCK;
  }

  /**
   * @param {number} cx
   * @param {number} cz
   * @param {Uint8Array} buf chunk block buffer (must match this chunk)
   */
  _postProcessChunk(cx, cz, buf) {
    const { seed, height: h } = this;

    /*
     * Cave network — 3D worm-tube noise.
     *
     * caveNoise returns (n1-0.5)²+(n2-0.5)² which is near 0 along the centre
     * of each tube.  We carve stone where the value falls below a threshold
     * that fades to zero near the surface (prevents sky-holes) and near
     * bedrock (preserves the floor).
     *
     * BASE_THRESHOLD ≈ 2–3 % of noise space → connected tunnels ~4 blocks wide.
     */
    const BASE_THRESHOLD = 0.016;
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        const sh = surfaceHeight(wx, wz, seed);
        const maxY = Math.min(sh - 5, h - 4);
        for (let y = 2; y <= maxY; y++) {
          // Only carve solid stone — leave dirt/sand/ore layers intact
          const idx = idxLocal(lx, y, lz, h);
          if (buf[idx] !== BlockId.STONE) continue;
          // Smooth fade-in so caves taper off near surface and near bedrock
          const surfaceFade = Math.min(1, (sh - y - 4) / 10);
          const bottomFade  = Math.min(1, (y - 2) / 8);
          const threshold   = BASE_THRESHOLD * surfaceFade * bottomFade;
          if (caveNoise(wx, y, wz, seed) < threshold) {
            buf[idx] = BlockId.AIR;
          }
        }
      }
    }
    this._placeOresInBuffer(cx, cz, buf);
    this._placeLavaInCavesInBuffer(cx, cz, buf);
    this._carveWaterInChunk(cx, cz);
    this._replaceSolidUnderWaterInChunk(cx, cz);
    this._treesInChunk(cx, cz);
    this._placeBiomeFeatures(cx, cz);
    this._tallGrassInChunk(cx, cz);
    this._shortGrassInChunk(cx, cz);

    /* Propagate sources into adjacent air — skip dry chunks (recompute is heavy). */
    let hasWater = false;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === BlockId.WATER) {
        hasWater = true;
        break;
      }
    }
    if (hasWater) {
      const pad = 16;
      const x0 = cx * CHUNK_XZ - pad;
      const x1 = (cx + 1) * CHUNK_XZ - 1 + pad;
      const z0 = cz * CHUNK_XZ - pad;
      const z1 = (cz + 1) * CHUNK_XZ - 1 + pad;
      recomputeWaterBox(this, x0, x1, 0, h - 1, z0, z1);
    }
  }

  /**
   * Scatter ore veins in stone below the surface (same-chunk only — avoids ensureChunk recursion).
   * Coal: Y 4–surface, common.  Iron: Y 2–32, moderate.  Diamond: Y 2–16, rare.
   * @param {Uint8Array} buf
   */
  _placeOresInBuffer(cx, cz, buf) {
    const { seed, height: h } = this;
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        const sh = surfaceHeight(wx, wz, seed);
        for (let y = 2; y < Math.min(sh - 2, h); y++) {
          const idx = idxLocal(lx, y, lz, h);
          if (buf[idx] !== BlockId.STONE) continue;
          const r = hashSeed(wx, y, wz, seed + 700);
          if (y < sh - 4 && r < 0.035) {
            buf[idx] = BlockId.COAL_ORE;
            if (lx + 1 < CHUNK_XZ && hashSeed(wx, y, wz, seed + 701) < 0.5) {
              const i2 = idxLocal(lx + 1, y, lz, h);
              if (buf[i2] === BlockId.STONE) buf[i2] = BlockId.COAL_ORE;
            }
            if (y + 1 < h && hashSeed(wx, y, wz, seed + 702) < 0.3) {
              const i2 = idxLocal(lx, y + 1, lz, h);
              if (buf[i2] === BlockId.STONE) buf[i2] = BlockId.COAL_ORE;
            }
            continue;
          }
          const ironTop = Math.min(sh - 20, h - 6);
          if (y >= 5 && y <= ironTop && r >= 0.035 && r < 0.053) {
            buf[idx] = BlockId.IRON_ORE;
            if (lz + 1 < CHUNK_XZ && hashSeed(wx, y, wz, seed + 711) < 0.4) {
              const i2 = idxLocal(lx, y, lz + 1, h);
              if (buf[i2] === BlockId.STONE) buf[i2] = BlockId.IRON_ORE;
            }
            continue;
          }
          if (y <= 16 && r >= 0.053 && r < 0.057) {
            buf[idx] = BlockId.DIAMOND_ORE;
          }
        }
      }
    }
  }

  /**
   * Rare lava **pools** on deep cave floors only: horizontal discs of lava over stone/ore,
   * using the same cave mask as carving. Runs before ocean/river water fill.
   * @param {Uint8Array} buf
   */
  _placeLavaInCavesInBuffer(cx, cz, buf) {
    const { seed, height: h } = this;
    const BASE_THRESHOLD = 0.016;
    /** Must be at least this many blocks below local surface (deep mines / lower caves). */
    const LAVA_MIN_DEPTH_BELOW_SURFACE = 32;
    /** Never above this world Y (keeps lava out of mid-level tunnels). */
    const LAVA_ABSOLUTE_MAX_Y = 22;
    /** Rare pool centres per suitable floor cell (pools span multiple blocks). */
    const POOL_SEED_HASH = 0.0024;
    const POOL_R_MAX = 4;

    const isOreOrStone = (id) =>
      id === BlockId.STONE ||
      id === BlockId.COAL_ORE ||
      id === BlockId.IRON_ORE ||
      id === BlockId.DIAMOND_ORE;

    /**
     * @param {number} maxLavaY inclusive ceiling for this column
     */
    const lavaFloorOk = (lx, lz, y, wx, wz, sh, maxLavaY) => {
      if (y > maxLavaY || y < 4) return false;
      const idx = idxLocal(lx, y, lz, h);
      if (buf[idx] !== BlockId.AIR) return false;
      if (y + 1 >= h || buf[idxLocal(lx, y + 1, lz, h)] !== BlockId.AIR) return false;
      const below = buf[idxLocal(lx, y - 1, lz, h)];
      if (!isOreOrStone(below)) return false;
      const surfaceFade = Math.min(1, (sh - y - 4) / 10);
      const bottomFade = Math.min(1, (y - 2) / 8);
      const threshold = BASE_THRESHOLD * surfaceFade * bottomFade;
      return caveNoise(wx, y, wz, seed) < threshold;
    };

    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        const sh = surfaceHeight(wx, wz, seed);
        const maxLavaY = Math.min(LAVA_ABSOLUTE_MAX_Y, sh - LAVA_MIN_DEPTH_BELOW_SURFACE);
        if (maxLavaY < 5) continue;

        const maxY = Math.min(sh - 5, h - 4, maxLavaY);
        for (let y = 4; y <= maxY; y++) {
          if (!lavaFloorOk(lx, lz, y, wx, wz, sh, maxLavaY)) continue;
          if (hashSeed(wx, y, wz, seed + 8800) > POOL_SEED_HASH) continue;

          const R = 2 + Math.floor(hashSeed(wx, wz, seed + 8801) * 2);

          for (let dz = -POOL_R_MAX; dz <= POOL_R_MAX; dz++) {
            for (let dx = -POOL_R_MAX; dx <= POOL_R_MAX; dx++) {
              if (dx * dx + dz * dz > R * R) continue;
              const nlx = lx + dx;
              const nlz = lz + dz;
              if (nlx < 0 || nlx >= CHUNK_XZ || nlz < 0 || nlz >= CHUNK_XZ) continue;
              const nwx = cx * CHUNK_XZ + nlx;
              const nwz = cz * CHUNK_XZ + nlz;
              const nsh = surfaceHeight(nwx, nwz, seed);
              const nMaxLavaY = Math.min(LAVA_ABSOLUTE_MAX_Y, nsh - LAVA_MIN_DEPTH_BELOW_SURFACE);
              if (y > nMaxLavaY || !lavaFloorOk(nlx, nlz, y, nwx, nwz, nsh, nMaxLavaY)) continue;
              buf[idxLocal(nlx, y, nlz, h)] = BlockId.LAVA;
            }
          }
        }
      }
    }

    /* One block deeper under some pool cells (lava above, not open sky — different from lavaFloorOk). */
    const deepCellOk = (lx, lz, yi, wx, wz, sh, maxLavaY) => {
      if (yi > maxLavaY || yi < 2) return false;
      const iBelow = idxLocal(lx, yi, lz, h);
      const iUnder = idxLocal(lx, yi - 1, lz, h);
      if (buf[iBelow] !== BlockId.AIR || !isOreOrStone(buf[iUnder])) return false;
      const surfaceFade = Math.min(1, (sh - yi - 4) / 10);
      const bottomFade = Math.min(1, (yi - 2) / 8);
      const threshold = BASE_THRESHOLD * surfaceFade * bottomFade;
      return caveNoise(wx, yi, wz, seed) < threshold;
    };

    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        const sh = surfaceHeight(wx, wz, seed);
        const maxLavaY = Math.min(LAVA_ABSOLUTE_MAX_Y, sh - LAVA_MIN_DEPTH_BELOW_SURFACE);
        for (let y = 5; y <= maxLavaY; y++) {
          const idx = idxLocal(lx, y, lz, h);
          if (buf[idx] !== BlockId.LAVA) continue;
          if (hashSeed(wx, y, wz, seed + 8803) > 0.38) continue;
          const yi = y - 1;
          if (!deepCellOk(lx, lz, yi, wx, wz, sh, maxLavaY)) continue;
          buf[idxLocal(lx, yi, lz, h)] = BlockId.LAVA;
        }
      }
    }
  }

  _carveWaterInChunk(cx, cz) {
    const { seed, height: h } = this;
    const seaLevel = SEA_LEVEL;
    const phase = seed * 0.019;
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        const wander =
          Math.sin(wx * 0.12 + phase) * 13 +
          Math.sin(wz * 0.095 + seed * 0.041) * 7.5 +
          Math.sin((wx + wz * 0.62) * 0.067 + phase * 1.65) * 5.5;
        const mid =
          Math.sin(wz * 0.031 + phase * 0.85) * 110 +
          Math.cos(wx * 0.007 + seed * 0.02) * 45;
        /* Narrower channels → more continuous dry land between rivers. */
        const widthNoise = 0.72 + hashSeed(wx >> 2, wz >> 2, seed + 77) * 0.95;
        const inRiver = Math.abs(wx - mid - wander) < widthNoise;
        const wander2 =
          Math.sin(wx * 0.088 - wz * 0.105 + seed * 0.073) * 9 +
          Math.sin(wz * 0.14 + phase) * 4;
        const mid2 = Math.sin(wz * 0.018 + seed * 0.09) * 75;
        const riv2 =
          Math.abs(Math.sin(wz * 0.011 + seed * 0.13)) > 0.58 &&
          Math.abs(wx - mid2 - wander2) < 0.72 + hashSeed(wz >> 2, wx >> 2, seed + 88) * 0.42;
        if (inRiver || riv2) {
          const sh = surfaceHeight(wx, wz, seed);
          const carveH = inRiver ? 5 : 4;
          for (let dy = 1; dy <= carveH; dy++) {
            const yy = sh - dy;
            if (yy < 1) continue;
            this.set(wx, yy, wz, BlockId.AIR);
          }
          if (hashSeed(wx, wz, seed + 177) > 0.28) {
            this.set(wx, sh, wz, BlockId.SAND);
          }
        }
      }
    }

    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        const top = this.topSolidY(wx, wz);
        if (top < 0) continue;
        for (let y = top + 1; y <= seaLevel && y < h; y++) {
          if (this.get(wx, y, wz) === BlockId.AIR) {
            this.set(wx, y, wz, BlockId.WATER);
          }
        }
      }
    }
  }

  _replaceSolidUnderWaterInChunk(cx, cz) {
    const { seed, height: h } = this;
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        let hasWater = false;
        for (let y = 0; y < h; y++) {
          if (this.get(wx, y, wz) === BlockId.WATER) {
            hasWater = true;
            break;
          }
        }
        if (!hasWater) continue;

        const top = this.topSolidY(wx, wz);
        if (top < 1) continue;

        const b = biomeParam(wx, wz, seed);
        const preferSand =
          b < 0.34 || hashSeed(wx >> 2, wz >> 2, seed + 902) < 0.26;
        const soil = preferSand ? BlockId.SAND : BlockId.DIRT;

        for (let y = 1; y <= top; y++) {
          const id = this.get(wx, y, wz);
          if (id === BlockId.BEDROCK || id === BlockId.WATER) continue;
          if (id === BlockId.DIRT || id === BlockId.SAND) continue;
          if (id === BlockId.AIR) continue;

          const def = BLOCKS[id];
          if (!def?.solid || def.fluid) continue;

          switch (id) {
            case BlockId.STONE:
            case BlockId.GRASS:
            case BlockId.COBBLE:
            case BlockId.PLANKS:
            case BlockId.LOG:
            case BlockId.LEAVES:
            case BlockId.GLASS:
              this.set(wx, y, wz, soil);
              break;
            default:
              break;
          }
        }
      }
    }
  }

  _treesInChunk(cx, cz) {
    const { seed } = this;
    const target = 2 + Math.floor(hashSeed(cx, cz, seed + 901) * 6);
    let placed = 0;
    let tries = 0;
    while (placed < target && tries < 120) {
      tries++;
      const lx = Math.floor(hashSeed(cx, cz, tries + 3) * CHUNK_XZ);
      const lz = Math.floor(hashSeed(cx, tries, cz + 7) * CHUNK_XZ);
      const wx = cx * CHUNK_XZ + lx;
      const wz = cz * CHUNK_XZ + lz;
      const sy = this.topSolidY(wx, wz);
      if (sy < 0) continue;
      if (this.get(wx, sy, wz) !== BlockId.GRASS) continue;
      if (isFluidAt(this, wx, sy + 1, wz)) continue;
      const tb  = biomeParam(wx, wz, seed);
      const biome = getBiome(tb);
      const skip = hashSeed(wx, wz, seed + 44);
      /* Desert and Tundra have no grass surface — trees would never pass the
         GRASS check anyway, but guard explicitly for clarity. */
      if (biome === BIOME.DESERT)     continue;           // arid — no trees
      if (biome === BIOME.TUNDRA)     continue;           // frozen — no trees
      if (biome === BIOME.PLAINS     && skip < 0.50) continue; // sparse
      if (biome === BIOME.FOREST     && skip < 0.08) continue; // dense
      if (biome === BIOME.HIGHLANDS  && skip < 0.30) continue; // moderate
      this.placeTree(wx, sy + 1, wz);
      placed++;
    }
  }

  _tallGrassInChunk(cx, cz) {
    const { seed, height: h } = this;
    for (let k = 0; k < 48; k++) {
      const lx = Math.floor(hashSeed(cx, cz, seed + 2100 + k * 5) * CHUNK_XZ);
      const lz = Math.floor(hashSeed(cx + k * 2, cz, seed + 2101) * CHUNK_XZ);
      const wx = cx * CHUNK_XZ + lx;
      const wz = cz * CHUNK_XZ + lz;
      if (hashSeed(wx, wz, seed + 2102 + k) > 0.38) continue;
      const sy = this.topSolidY(wx, wz);
      if (sy < 0) continue;
      if (this.get(wx, sy, wz) !== BlockId.GRASS) continue;
      if (sy + 2 >= h) continue;
      if (this.get(wx, sy + 1, wz) !== BlockId.AIR || this.get(wx, sy + 2, wz) !== BlockId.AIR) continue;
      if (isFluidAt(this, wx, sy + 1, wz)) continue;
      const tb = biomeParam(wx, wz, seed);
      const biome = getBiome(tb);
      if (biome === BIOME.DESERT || biome === BIOME.TUNDRA) continue;
      const dens =
        biome === BIOME.FOREST ? 0.62 : biome === BIOME.PLAINS ? 0.48 : biome === BIOME.HIGHLANDS ? 0.32 : 0.22;
      if (hashSeed(wx, wz, seed + 2103 + k) > dens) continue;
      this.set(wx, sy + 1, wz, BlockId.TALL_GRASS_BOTTOM);
      this.set(wx, sy + 2, wz, BlockId.TALL_GRASS_TOP);
    }
  }

  _shortGrassInChunk(cx, cz) {
    const { seed, height: h } = this;
    for (let k = 0; k < 96; k++) {
      const lx = Math.floor(hashSeed(cx, cz, seed + 2200 + k * 3) * CHUNK_XZ);
      const lz = Math.floor(hashSeed(cx + k, cz, seed + 2201) * CHUNK_XZ);
      const wx = cx * CHUNK_XZ + lx;
      const wz = cz * CHUNK_XZ + lz;
      if (hashSeed(wx, wz, seed + 2202 + k) > 0.22) continue;
      const sy = this.topSolidY(wx, wz);
      if (sy < 0) continue;
      if (this.get(wx, sy, wz) !== BlockId.GRASS) continue;
      if (sy + 1 >= h) continue;
      if (this.get(wx, sy + 1, wz) !== BlockId.AIR) continue;
      if (isFluidAt(this, wx, sy + 1, wz)) continue;
      const tb = biomeParam(wx, wz, seed);
      const biome = getBiome(tb);
      if (biome === BIOME.DESERT || biome === BIOME.TUNDRA) continue;
      const dens =
        biome === BIOME.FOREST ? 0.78 : biome === BIOME.PLAINS ? 0.72 : biome === BIOME.HIGHLANDS ? 0.55 : 0.4;
      if (hashSeed(wx, wz, seed + 2203 + k) > dens) continue;
      this.set(wx, sy + 1, wz, BlockId.SHORT_GRASS);
    }
  }

  _placeBiomeFeatures(cx, cz) {
    const { seed, height: h } = this;
    for (let lz = 0; lz < CHUNK_XZ; lz++) {
      for (let lx = 0; lx < CHUNK_XZ; lx++) {
        const wx = cx * CHUNK_XZ + lx;
        const wz = cz * CHUNK_XZ + lz;
        const b     = biomeParam(wx, wz, seed);
        const biome = getBiome(b);

        /* ── Desert: place cacti on sand surfaces ─────────────────────── */
        if (biome === BIOME.DESERT) {
          const sy = this.topSolidY(wx, wz);
          if (sy < 1) continue;
          if (this.get(wx, sy, wz) !== BlockId.SAND) continue;
          if (isFluidAt(this, wx, sy + 1, wz)) continue;
          /* ~0.8 % chance per column */
          if (hashSeed(wx, wz, seed + 550) > 0.008) continue;
          /* Require at least 3 blocks of clear space in every cardinal
             direction so cacti never crowd each other.
             Use getBlockIfLoaded to avoid cascade-generating neighbours. */
          let tooClose = false;
          outer: for (let dz = -3; dz <= 3; dz++) {
            for (let dx = -3; dx <= 3; dx++) {
              if (dx === 0 && dz === 0) continue;
              for (let dy = 1; dy <= 3; dy++) {
                if (this.getBlockIfLoaded(wx + dx, sy + dy, wz + dz) === BlockId.CACTUS) {
                  tooClose = true;
                  break outer;
                }
              }
            }
          }
          if (tooClose) continue;
          /* Height: 1–3 blocks */
          const cactusH = 1 + Math.floor(hashSeed(wx, wz, seed + 551) * 3);
          for (let dy = 1; dy <= cactusH; dy++) {
            if (sy + dy >= h) break;
            this.set(wx, sy + dy, wz, BlockId.CACTUS);
          }
          continue;
        }

        /* ── Tundra: freeze the top water layer to ice ────────────────── */
        if (biome === BIOME.TUNDRA) {
          /* Find the topmost water block in this column. */
          for (let y = h - 1; y >= 1; y--) {
            const id = this.get(wx, y, wz);
            if (id === BlockId.WATER) {
              /* Only freeze if open to sky (nothing solid above). */
              let openSky = true;
              for (let ay = y + 1; ay < h; ay++) {
                const aid = this.get(wx, ay, wz);
                if (aid !== BlockId.AIR && aid !== BlockId.WATER) {
                  openSky = false;
                  break;
                }
              }
              if (openSky) this.set(wx, y, wz, BlockId.ICE);
              break;
            }
            /* Stop descending if we hit a solid block before water. */
            const def = BLOCKS[id];
            if (id !== BlockId.AIR && def?.solid) break;
          }
        }
      }
    }
  }

  placeTree(x, baseY, z) {
    const treeH = 4 + Math.floor(hashSeed(x, z, 55) * 2);
    for (let i = 0; i < treeH; i++) this.set(x, baseY + i, z, BlockId.LOG);
    const ly = baseY + treeH - 1;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy < 3; dy++) {
          const dist = Math.abs(dx) + Math.abs(dz) + dy * 0.5;
          if (dist > 3.2) continue;
          const px = x + dx;
          const py = ly + dy;
          const pz = z + dz;
          if (py < 0 || py >= this.height) continue;
          /* Place leaves into neighbours too: unloaded cells were skipped before,
             leaving gaps at chunk borders until the other chunk generated. */
          const cur = this.getBlockIfLoaded(px, py, pz);
          if (cur !== null && cur !== BlockId.AIR) continue;
          this.set(px, py, pz, BlockId.LEAVES);
        }
      }
    }
    this.set(x, ly + 3, z, BlockId.LEAVES);
  }

  /**
   * Raw chunk buffer for the given chunk indices — ensures the chunk is generated.
   * @param {number} cx
   * @param {number} cz
   * @returns {Uint8Array}
   */
  getChunkBuffer(cx, cz) {
    return this.ensureChunk(cx, cz);
  }

  /**
   * Raw chunk buffer without generating (null if not loaded).
   * @param {number} cx
   * @param {number} cz
   * @returns {Uint8Array | null}
   */
  getChunkBufferIfLoaded(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) ?? null;
  }

  topSolidY(x, z) {
    for (let y = this.height - 1; y >= 0; y--) {
      const id = this.get(x, y, z);
      if (id === 0) continue;
      const def = blockDef(id);
      if (!def.solid) continue;
      if (def.collision === false) continue;
      return y;
    }
    return -1;
  }

  /**
   * Highest solid colliding block in this column whose top face is at or below `feetY` (+slop).
   * Unlike {@link topSolidY}, ignores blocks above the feet (e.g. tree canopies), so mobs walking
   * under trees are not snapped to the canopy.
   */
  topSupportingSolidY(x, z, feetY) {
    const slop = 0.35;
    const limitTop = feetY + slop;
    const yHi = Math.min(this.height - 1, Math.floor(limitTop - 1e-9));
    if (yHi < 0) return -1;
    for (let y = yHi; y >= 0; y--) {
      const id = this.get(x, y, z);
      if (id === 0) continue;
      const def = blockDef(id);
      if (!def.solid) continue;
      if (def.collision === false) continue;
      if (y + 1 <= limitTop) return y;
    }
    return -1;
  }
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
