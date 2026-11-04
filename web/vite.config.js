import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const raiz = dirname(fileURLToPath(import.meta.url));
const portaApi = process.env.PORT || '3000';

export default defineConfig({
  root: raiz,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: {
    port: 5173,
    fs: { allow: [dirname(raiz)] },
    proxy: { '/api': { target: `http://127.0.0.1:${portaApi}`, changeOrigin: false } },
  },
});
