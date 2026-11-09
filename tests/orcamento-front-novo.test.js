import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { avaliarFrontNovo, LIMITES_FRONT, medirFrontNovo } from '../scripts/orcamento-js.js';

// Bytes aleatórios não comprimem: o tamanho gzip fica igual ao original.
const ruido = (bytes) => randomBytes(bytes);

function distFalso(t, { landing = 2000, app = 3000, entrada = 4000, recharts = 5000, landingImportaRecharts = false } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'tracker-front-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  mkdirSync(join(pasta, 'assets'));
  mkdirSync(join(pasta, '.vite'));
  const arquivos = { 'index.js': entrada, 'Landing.js': landing, 'Casca.js': app, 'recharts.js': recharts };
  for (const [nome, bytes] of Object.entries(arquivos)) writeFileSync(join(pasta, 'assets', nome), ruido(bytes));
  const manifesto = {
    'index.html': { file: 'assets/index.js', isEntry: true, dynamicImports: ['src/landing/Landing.tsx', 'src/app/Casca.tsx'] },
    'src/landing/Landing.tsx': { file: 'assets/Landing.js', ...(landingImportaRecharts ? { imports: ['recharts'] } : {}) },
    'src/app/Casca.tsx': { file: 'assets/Casca.js' },
    recharts: { file: 'assets/recharts.js' },
  };
  writeFileSync(join(pasta, '.vite', 'manifest.json'), JSON.stringify(manifesto));
  return pasta;
}

test('orçamento do front novo: cada rota conta a entrada mais o próprio chunk, sem o que é sob demanda', (t) => {
  const m = medirFrontNovo(distFalso(t));
  assert.deepEqual(m.rotas.landing.chunks.sort(), ['assets/Landing.js', 'assets/index.js']);
  assert.deepEqual(m.rotas.app.chunks.sort(), ['assets/Casca.js', 'assets/index.js']);
  assert.ok(m.rotas.landing.gz > 5000 && m.rotas.landing.gz < m.rotas.app.gz + 3000);
  assert.equal(m.maior.nome, 'assets/recharts.js');
  assert.deepEqual(avaliarFrontNovo(m), []);
});

test('orçamento do front novo: landing acima de 120 kB gzip estoura', (t) => {
  const m = medirFrontNovo(distFalso(t, { landing: 125 * 1024 }));
  assert.match(avaliarFrontNovo(m).join(' '), /landing inicial .* passa de 120 kB/);
});

test('orçamento do front novo: app acima de 180 kB gzip estoura', (t) => {
  const m = medirFrontNovo(distFalso(t, { app: 185 * 1024 }));
  assert.match(avaliarFrontNovo(m).join(' '), /app inicial .* passa de 180 kB/);
});

test('orçamento do front novo: landing que importa o Recharts é recusada', (t) => {
  const m = medirFrontNovo(distFalso(t, { landingImportaRecharts: true }));
  assert.match(avaliarFrontNovo(m).join(' '), /landing baixa código que não é dela/);
});

test('orçamento do front novo: os limites pedidos são 120 kB (landing) e 180 kB (app)', () => {
  assert.equal(LIMITES_FRONT.landing_kb, 120);
  assert.equal(LIMITES_FRONT.app_kb, 180);
});
