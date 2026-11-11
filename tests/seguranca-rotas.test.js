import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HOST, ORIGEM, SENHA, appDeTeste, entrar } from './ajuda.js';

const ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PUBLICAS = ['GET /api/sessao', 'POST /api/login', 'POST /api/cadastro', 'GET /api/saude'];

const caminho = (url) => url.replace(/:\w+/g, '1');

test('segurança: só as quatro rotas esperadas são públicas; todas as outras de /api exigem sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  assert.ok(app.rotas.length > 50, 'o registro de rotas funciona');

  const publicas = app.rotas.filter((r) => r.publica).map((r) => `${r.metodo} ${r.url}`).sort();
  assert.deepEqual(publicas, [...PUBLICAS].sort());

  for (const r of app.rotas.filter((x) => !x.publica)) {
    const res = await app.inject({
      method: r.metodo,
      url: caminho(r.url),
      headers: { host: HOST, origin: ORIGEM, 'content-type': 'application/json' },
      payload: ESCRITA.has(r.metodo) ? '{}' : undefined,
    });
    assert.equal(res.statusCode, 401, `${r.metodo} ${r.url} deveria exigir sessão`);
  }
});

test('segurança: toda escrita autenticada sem o token CSRF é recusada (403), em todas as rotas', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie } = await entrar(app);

  const escritas = app.rotas.filter((r) => ESCRITA.has(r.metodo) && !r.publica);
  assert.ok(escritas.length > 15);
  for (const r of escritas) {
    const res = await app.inject({
      method: r.metodo,
      url: caminho(r.url),
      headers: { host: HOST, origin: ORIGEM, cookie, 'content-type': 'application/json' },
      payload: '{}',
    });
    assert.equal(res.statusCode, 403, `${r.metodo} ${r.url} deveria exigir CSRF`);
  }
});

test('segurança: toda escrita (inclusive o login) sem Origin ou com Origin de outro site é recusada', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie, csrf } = await entrar(app);

  for (const r of app.rotas.filter((x) => ESCRITA.has(x.metodo))) {
    for (const origin of [undefined, 'http://site-malicioso.example', 'null']) {
      const res = await app.inject({
        method: r.metodo,
        url: caminho(r.url),
        headers: { host: HOST, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json', ...(origin ? { origin } : {}) },
        payload: '{}',
      });
      assert.equal(res.statusCode, 403, `${r.metodo} ${r.url} com Origin ${origin}`);
    }
  }
});

test('segurança: host desconhecido é recusado (DNS rebinding), na API e no front', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of ['/api/saude', '/', '/lancamentos']) {
    const res = await app.inject({ method: 'GET', url, headers: { host: 'site-malicioso.example' } });
    assert.equal(res.statusCode, 421, url);
  }
});

test('segurança: respostas da API não são guardadas em cache e trazem os cabeçalhos de proteção', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie } = await entrar(app);
  for (const url of ['/api/saude', '/api/resumo', '/api/exportar/tudo.json']) {
    const res = await app.inject({ method: 'GET', url, headers: { host: HOST, cookie } });
    assert.equal(res.headers['cache-control'], 'no-store', url);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  }
});

test('segurança: em HTTP local o cookie é "sessao" (HttpOnly, SameSite=Strict, sem Secure)', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { res } = await entrar(app);
  const cookie = res.cookies.find((c) => c.name === 'sessao');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Strict');
  assert.ok(!cookie.secure, 'em HTTP simples o cookie não pode ser Secure, senão o navegador o descarta');
  assert.equal(res.cookies.some((c) => c.name === '__Host-sessao'), false);
});

test('segurança: em HTTPS o cookie é "__Host-sessao" (HttpOnly, Secure, SameSite=Strict, Path=/, sem Domain)', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const https = await app.inject({
    method: 'POST', url: '/api/login', payload: { usuario: 'tester', senha: SENHA },
    headers: { host: HOST, origin: ORIGEM, 'x-forwarded-proto': 'https' },
    remoteAddress: '127.0.0.1',
  });
  assert.equal(https.statusCode, 200);
  assert.equal(https.cookies.some((c) => c.name === 'sessao'), false, 'o nome simples não é usado em HTTPS');
  const cookie = https.cookies.find((c) => c.name === '__Host-sessao');
  assert.equal(cookie.secure, true);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Strict');
  assert.equal(cookie.path, '/');
  assert.equal(cookie.domain, undefined, 'o prefixo __Host- proíbe Domain');
});

test('segurança: o cookie do protocolo errado não abre a sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie } = await entrar(app); // cookie "sessao", emitido em http
  const emHttps = await app.inject({
    method: 'GET', url: '/api/contas',
    headers: { host: HOST, cookie, 'x-forwarded-proto': 'https' },
    remoteAddress: '127.0.0.1',
  });
  assert.equal(emHttps.statusCode, 401, 'em HTTPS só vale o __Host-sessao');
  const comPrefixoEmHttp = await app.inject({
    method: 'GET', url: '/api/contas',
    headers: { host: HOST, cookie: cookie.replace('sessao=', '__Host-sessao=') },
  });
  assert.equal(comPrefixoEmHttp.statusCode, 401, 'em HTTP só vale o nome simples');
});

// --- O front não pode depender de nada que a CSP bloqueia -------------------------------------------------

function arquivos(pasta, extensoes) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminhoCompleto = join(pasta, nome);
    if (statSync(caminhoCompleto).isDirectory()) return arquivos(caminhoCompleto, extensoes);
    return extensoes.some((e) => nome.endsWith(e)) ? [caminhoCompleto] : [];
  });
}

test('CSP: o código do front não usa style inline, innerHTML, eval nem script inline', () => {
  const raiz = fileURLToPath(new URL('../frontend/', import.meta.url));
  const proibidos = [
    [/\bstyle=\{/, 'atributo style (use classe no CSS)'],
    [/\bstyle="/, 'atributo style (use classe no CSS)'],
    [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
    [/\.innerHTML\s*=/, 'innerHTML'],
    [/\beval\(/, 'eval'],
    [/new Function\(/, 'new Function'],
    [/createElement\(['"]style/, '<style> criado por script'],
  ];
  for (const arquivo of arquivos(join(raiz, 'src'), ['.ts', '.tsx']).filter((a) => !/\.test\.tsx?$/.test(a))) {
    const texto = readFileSync(arquivo, 'utf8');
    for (const [padrao, nome] of proibidos) {
      assert.doesNotMatch(texto, padrao, `${arquivo}: ${nome}`);
    }
  }
  const html = readFileSync(join(raiz, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, 'script inline no index.html');
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /\son\w+=/i, 'manipulador de evento inline');
});
