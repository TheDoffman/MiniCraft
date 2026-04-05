# MiniCraft

Browser voxel sandbox (Three.js): procedural terrain and textures, survival/creative modes, crafting, furnace, doors, weather, mobs, saves in `localStorage`, and Vitest unit tests for core systems.

## Quick start

```bash
npm install
npm run dev
```

- **Build:** `npm run build` then `npm run preview`
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`)
- **Tests:** `npm test`
- **Texture atlas PNGs (optional):** `npm run build:textures`

## Controls

- **WASD** move, **Space** jump, **Shift** swim down in fluids
- **1–9** hotbar, **E** inventory / 2×2 craft, **F5** camera
- **Left-click** mine · **Right-click** place · **Shovel** on grass/dirt tills **farmland** · **Wheat seeds** on farmland plant crops
- **Shift+S** save · **Shift+L** load (from pause or in-game)

## Settings

Minimap, ambient music bed, render distance, terrain load speed, shadows, and more are stored under the key `minicraft-settings-v1` in `localStorage`.

## Architecture notes

- **`src/main.ts`** — renderer, loop, UI wiring, chunk streaming (meshes built on the main thread).
- **`src/fluidMaterials.ts`** — water/lava depth and flow shader patches (`onBeforeCompile`).
- **`src/chunkMeshWorker.ts`** — placeholder worker module for future off-thread meshing (bundled by Vite; not on the hot path yet).
- **`src/world.ts` / `worldgen.ts`** — chunked heightmap terrain, caves, biomes (including desert “badlands” sandstone pockets).
- **`src/blocktypes.ts`** — block IDs, drops, tools; `blockDef(id)` returns air for invalid indices (safer than raw `BLOCKS[id]`).

## Multiplayer

Not implemented. A practical approach later: WebSocket or WebRTC for player positions and block diffs, with authoritative server or host for anti-cheat.

## License

Private project (`"private": true` in `package.json`).
