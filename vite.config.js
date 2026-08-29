import { defineConfig } from 'vite';

export default defineConfig({
  base: '/dominio-siglos-de-acero/',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-engine';
          return undefined;
        },
      },
    },
  },
});
