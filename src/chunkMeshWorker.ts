/**
 * Scaffold worker bundle for future off-main-thread chunk meshing.
 * The game currently meshes on the main thread; ping this worker to keep the module in the build graph.
 * {@link disposeEngine} in main.ts calls `terminate()` so this worker is not leaked on teardown.
 */
self.onmessage = (e) => {
  if (e.data?.type === 'ping') {
    self.postMessage({ type: 'pong', t: e.data.t ?? 0 });
  }
};
