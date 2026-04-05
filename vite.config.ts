import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
