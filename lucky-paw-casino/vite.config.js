import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3004, strictPort: true,
    // Hot reload off: several agents edit files while browser checks run, and
    // HMR full-reloads destroyed their pages mid-check. Refresh after an edit.
    hmr: false,
  },
  build: {
    target: 'esnext',
  },
});
