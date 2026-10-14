import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs: dist/ works from any path (itch.io, a subfolder, file servers)
  base: './',
  server: {
    port: 3002, strictPort: true,
  },
  build: {
    target: 'esnext',
  },
});
