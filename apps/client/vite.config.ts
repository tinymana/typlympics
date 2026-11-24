import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build runs from any folder or host.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
  server: { port: 5173 },
});
