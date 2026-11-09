import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const raiz = dirname(fileURLToPath(import.meta.url));
const portaApi = process.env.PORT ?? '3000';

export default defineConfig({
  root: raiz,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(raiz, 'src') } },
  // O manifest deixa scripts/orcamento-js.js medir o JS de cada rota (landing e app) pelo grafo de chunks.
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, manifest: true },
  server: {
    port: 5173,
    // contratos/ fica fora da pasta do front e é compartilhado com o servidor.
    fs: { allow: [dirname(raiz)] },
    proxy: { '/api': { target: `http://127.0.0.1:${portaApi}`, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/teste/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
