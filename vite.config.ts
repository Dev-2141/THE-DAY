import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { hubPlugin } from './tooling/vite-plugin-hub.ts';

// Tauri expects a fixed dev port and must not have vite clear its output.
export default defineConfig({
  plugins: [react(), hubPlugin()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    sourcemap: false,
    // PixiJS alone is ~500 kB; this is a local app, so one chunk is fine.
    chunkSizeWarningLimit: 1024,
  },
});
