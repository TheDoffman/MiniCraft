import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { serializeGame, deserializeGame } from '../src/save';
import { createInventory, createArmorSlots } from '../src/inventory';
import { BlockId } from '../src/blocktypes';

describe('save format', () => {
  it('v8 round-trips furnace tile state', () => {
    const world = new World(64, 4242, { airOnly: true });
    const mobs = { pigs: [], cows: [], squids: [], drops: [] };
    const furnaces = [
      {
        k: '1,2,3',
        input: { blockId: BlockId.IRON_ORE, count: 3 },
        fuel: { blockId: BlockId.LOG, count: 2 },
        output: { blockId: BlockId.IRON_INGOT, count: 1 },
        burnLeft: 4.2,
        smeltProgress: 1.5,
      },
    ];
    const json = serializeGame(world, createInventory(), mobs, createArmorSlots(), furnaces);
    const o = JSON.parse(json);
    expect(o.v).toBe(8);
    expect(Array.isArray(o.furnaces)).toBe(true);
    const state = deserializeGame(json);
    expect(state).not.toBeNull();
    expect(state.furnaces).toHaveLength(1);
    expect(state.furnaces[0].k).toBe('1,2,3');
    expect(state.furnaces[0].input).toEqual({ blockId: BlockId.IRON_ORE, count: 3 });
    expect(state.furnaces[0].fuel).toEqual({ blockId: BlockId.LOG, count: 2 });
    expect(state.furnaces[0].output).toEqual({ blockId: BlockId.IRON_INGOT, count: 1 });
    expect(state.furnaces[0].burnLeft).toBeCloseTo(4.2);
    expect(state.furnaces[0].smeltProgress).toBeCloseTo(1.5);
  });

  it('v8 round-trips player snapshot fields', () => {
    const world = new World(64, 99, { airOnly: true });
    const mobs = { pigs: [], cows: [], squids: [], drops: [] };
    const snap = {
      gameMode: 'survival',
      player: { x: 12.5, y: 84.2, z: -3.25 },
      worldTimeTicks: 15000,
      playerVitals: { health: 77, stamina: 40, hunger: 55 },
    };
    const json = serializeGame(world, createInventory(), mobs, createArmorSlots(), [], snap);
    const state = deserializeGame(json);
    expect(state?.gameMode).toBe('survival');
    expect(state?.player).toEqual(snap.player);
    expect(state?.worldTimeTicks).toBe(15000);
    expect(state?.playerVitals).toEqual(snap.playerVitals);
  });

  it('v8 ignores malformed furnace rows', () => {
    const world = new World(64, 1, { airOnly: true });
    const inv = createInventory();
    const mobs = { pigs: [], cows: [], squids: [], drops: [] };
    const json = JSON.stringify({
      v: 8,
      height: 64,
      seed: 1,
      chunks: {},
      waterChunks: {},
      torchChunks: {},
      doorChunks: {},
      inventory: inv.map((s) => ({ blockId: s.blockId, count: s.count })),
      armor: createArmorSlots().map((s) => ({ blockId: s.blockId, count: s.count })),
      mobs,
      furnaces: [
        { k: 'bad', input: {}, fuel: {}, output: {}, burnLeft: 0, smeltProgress: 0 },
        {
          k: '0,5,0',
          input: { blockId: BlockId.LOG, count: 1 },
          fuel: { blockId: 0, count: 0 },
          output: { blockId: 0, count: 0 },
          burnLeft: 0,
          smeltProgress: 0,
        },
      ],
    });
    const state = deserializeGame(json);
    expect(state?.furnaces).toHaveLength(1);
    expect(state?.furnaces[0].k).toBe('0,5,0');
  });
});
