import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { procurarSegredos } from '../scripts/verificar-dist.js';
import { lerAmbiente } from '../servidor/config.js';
import { CSP } from '../servidor/seguranca/cabecalhos.js';

// Publicação no Netlify (ADR 013, Onda 5): netlify.toml, manifest, service worker e a busca por segredos no build.

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ler = (...partes) => readFileSync(join(RAIZ, ...partes), 'utf8');
const toml = ler('netlify.toml');

/** Cada `[[headers]]` vira `{ para, valores }`; só o que este arquivo usa (chaves simples, texto entre aspas). */
function blocosDeCabecalho() {
  return toml.split('[[headers]]').slice(1).map((bloco) => ({
    para: bloco.match(/for = "([^"]+)"/)?.[1],
    valores: Object.fromEntries([...bloco.matchAll(/^\s+([A-Za-z-]+) = "([^"]*)"$/gm)].map((m) => [m[1], m[2]])),
  }));
}

const redirecionamentos = () =>
  toml.split('[[redirects]]').slice(1).map((bloco) => ({
    de: bloco.match(/from = "([^"]+)"/)?.[1],
    para: bloco.match(/to = "([^"]+)"/)?.[1],
    status: Number(bloco.match(/status = (\d+)/)?.[1]),
  }));

test('netlify.toml: publica o build do front e as funções, no mesmo lugar que o servidor local lê', () => {
  assert.match(toml, /publish = "frontend\/dist"/);
  assert.match(toml, /functions = "netlify\/functions"/);
  assert.match(toml, /command = "npm run build"/);
  assert.equal(lerAmbiente({}).pastaWeb, join(RAIZ, 'frontend', 'dist'));
});

test('netlify.toml: a CSP é idêntica à do servidor e não permite unsafe-inline', () => {
  const geral = blocosDeCabecalho().find((b) => b.para === '/*');
  assert.ok(geral, 'bloco de cabeçalhos de /* não encontrado');
  assert.equal(geral.valores['Content-Security-Policy'], CSP);
  assert.doesNotMatch(geral.valores['Content-Security-Policy'], /unsafe-inline|unsafe-eval/);
});

test('netlify.toml: os arquivos estáticos recebem os mesmos cabeçalhos de proteção que a API', () => {
  const geral = blocosDeCabecalho().find((b) => b.para === '/*').valores;
  assert.equal(geral['X-Content-Type-Options'], 'nosniff');
  assert.equal(geral['X-Frame-Options'], 'DENY');
  assert.equal(geral['Referrer-Policy'], 'no-referrer');
  assert.match(geral['Permissions-Policy'], /camera=\(\)/);
  assert.equal(geral['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.equal(geral['Cross-Origin-Resource-Policy'], 'same-origin');
  assert.match(geral['Strict-Transport-Security'], /max-age=\d+/);
});

test('netlify.toml: assets com hash são imutáveis; index, service worker e manifest sempre revalidam', () => {
  const por = Object.fromEntries(blocosDeCabecalho().map((b) => [b.para, b.valores]));
  assert.match(por['/assets/*']['Cache-Control'], /immutable/);
  for (const caminho of ['/index.html', '/sw.js', '/manifest.webmanifest']) {
    assert.equal(por[caminho]['Cache-Control'], 'no-cache', caminho);
  }
});

test('netlify.toml: a SPA cobre todas as rotas públicas do front e nunca alcança /api', () => {
  const regras = redirecionamentos();
  const de = regras.map((r) => r.de);
  const rotas = [...ler('frontend', 'src', 'rotas.tsx').matchAll(/<Route\s+path="(\/[^"*]*)(\/\*)?"/g)].map((m) => m[1]);
  assert.ok(rotas.includes('/entrar') && rotas.includes('/app'), 'rotas do front não lidas');
  for (const rota of rotas.filter((r) => r !== '/')) assert.ok(de.includes(rota), `rota ${rota} sem redirecionamento`);
  assert.ok(de.includes('/app/*'));
  for (const r of regras) {
    assert.equal(r.para, '/index.html');
    assert.equal(r.status, 200);
    assert.ok(!r.de.startsWith('/api'), `redirecionamento ${r.de} alcança a API`);
    assert.notEqual(r.de, '/*', 'um /* genérico engoliria a API se a ordem mudasse');
  }
});

test('funções: a API fica em /api/* e a manutenção é agendada', () => {
  assert.match(ler('netlify', 'functions', 'api.mjs'), /path: '\/api\/\*'/);
  assert.match(ler('netlify', 'functions', 'manutencao.mjs'), /schedule: '@daily'/);
});

test('PWA: manifest abre o tracker, os ícones existem e o service worker só guarda o shell (nunca a API)', () => {
  const manifest = JSON.parse(ler('frontend', 'public', 'manifest.webmanifest'));
  assert.equal(manifest.start_url, '/app');
  assert.equal(manifest.display, 'standalone');
  for (const icone of manifest.icons) assert.ok(existsSync(join(RAIZ, 'frontend', 'public', icone.src.slice(1))), icone.src);

  const sw = ler('frontend', 'public', 'sw.js');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)\) return/, 'a API precisa ficar fora do cache');
  assert.match(sw, /request\.method !== 'GET'/);
  const html = ler('frontend', 'index.html');
  assert.doesNotMatch(html, /rel="manifest"/, 'o manifest só entra em contexto seguro, por lib/pwa.ts');
  assert.match(html, /mobile-web-app-capable/);
  assert.match(ler('frontend', 'src', 'lib', 'pwa.ts'), /isSecureContext/);
});

test('segurança do build: acha nome de variável, VITE_, chave JWT, endereço de Postgres e o valor de um segredo', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'tracker-dist-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  mkdirSync(join(pasta, 'assets'));
  writeFileSync(join(pasta, 'index.html'), '<div id="raiz"></div>');
  const sujos = {
    'a.js': 'const x = "SUPABASE_SERVICE_KEY";',
    'b.js': 'const y = import.meta.env.VITE_CHAVE_X;',
    'c.js': 'const z = "postgresql://u:p@host:6543/postgres";',
    'd.js': 'const k = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0";',
    'e.js': 'const s = "valor-secreto-bem-comprido";',
  };
  for (const [nome, conteudo] of Object.entries(sujos)) writeFileSync(join(pasta, 'assets', nome), conteudo);
  const achados = procurarSegredos(pasta, ['valor-secreto-bem-comprido']);
  const arquivos = new Set(achados.map((a) => a.arquivo));
  for (const nome of Object.keys(sujos)) assert.ok(arquivos.has(`assets/${nome}`), `${nome} deveria ser apontado`);
});

test('segurança do build: build limpo passa, o helper do Vite não é confundido com VITE_ e valor curto é ignorado', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'tracker-dist-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  mkdirSync(join(pasta, 'assets'));
  writeFileSync(join(pasta, 'assets', 'ok.js'), 'const m = __vite__mapDeps([0,1]); // Supabase guarda o banco');
  assert.deepEqual(procurarSegredos(pasta, ['0', 'curto']), []);
  assert.throws(() => procurarSegredos(join(pasta, 'nao-existe')), /npm run build/);
});
