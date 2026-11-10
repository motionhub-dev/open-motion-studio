import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    // An ESM-only package with no build step of its own: bundled into the main process.
    build: { externalizeDeps: { exclude: ['@motionhub/cli'] } },
  },
  preload: {},
  renderer: {
    plugins: [react()],
  },
});
