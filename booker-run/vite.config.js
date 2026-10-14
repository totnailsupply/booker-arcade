import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    // No hot reload: several agents edit files while Playwright checks run, and
    // a mid-run full reload breaks those checks. Fresh page loads still get the
    // latest code. Refresh the browser by hand after an edit.
    hmr: false,
  },
  build: {
    target: 'esnext',
  },
});
