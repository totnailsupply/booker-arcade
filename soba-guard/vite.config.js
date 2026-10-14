import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3003, strictPort: true,
    hmr: false,
  },
  build: {
    target: 'esnext',
  },
});
