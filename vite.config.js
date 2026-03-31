import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
