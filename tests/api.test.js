import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HOST, ORIGEM, SENHA, appDeTeste, entrar } from './ajuda.js';

const publico = { host: HOST };
const comOrigem = { host: HOST, origin: ORIGEM };

test('/api/saude é pública, responde ok e traz cabeçalhos de segurança', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const res = await app.inject({ method: 'GET', url: '/api/saude', headers: publico });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['cache-control'], 'no-store');
  const csp = res.headers['content-security-policy'];
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.equal(res.headers['strict-transport-security'], undefined, 'HSTS só em HTTPS');
});

test('rotas da API sem sessão devolvem 401', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const [method, url] of [['GET', '/api/config'], ['PUT', '/api/config'], ['POST', '/api/logout']]) {
    const res = await app.inject({ method, url, headers: comOrigem, payload: method === 'GET' ? undefined : {} });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('/api/sessao: sem login não entrega csrf e nunca vaza segredo ou hash', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const anonimo = await app.inject({ method: 'GET', url: '/api/sessao', headers: publico });
  assert.deepEqual(anonimo.json(), { autenticado: false, senhaDefinida: true, demo: false });

  const { cookie } = await entrar(app);
  const logado = await app.inject({ method: 'GET', url: '/api/sessao', headers: { ...publico, cookie } });
  const corpo = logado.json();
  assert.equal(corpo.autenticado, true);
  assert.equal(corpo.fuso, 'America/Sao_Paulo');
  assert.ok(corpo.csrf);
  assert.doesNotMatch(logado.body, /scrypt|segredo-de-teste|senha_hash/);
});

test('login: erro dá 401, acerto dá cookie HttpOnly + SameSite=Strict (sem Secure em HTTP)', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const errado = await app.inject({ method: 'POST', url: '/api/login', headers: comOrigem, payload: { senha: 'errada' } });
  assert.equal(errado.statusCode, 401);
  assert.equal(errado.cookies.length, 0);

  const { res } = await entrar(app);
  assert.equal(res.statusCode, 200);
  const c = res.cookies.find((x) => x.name === 'sessao');
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'Strict');
  assert.equal(c.secure, undefined);
});

test('cookie é Secure quando X-Forwarded-Proto: https vem de 127.0.0.1, e só nesse caso', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const pedido = (remoteAddress) =>
    app.inject({
      method: 'POST',
      url: '/api/login',
      remoteAddress,
      headers: { ...comOrigem, 'x-forwarded-proto': 'https' },
      payload: { senha: SENHA },
    });
  const doProxyLocal = await pedido('127.0.0.1');
  assert.equal(doProxyLocal.cookies[0].secure, true);
  assert.equal(doProxyLocal.headers['strict-transport-security'] !== undefined, true);
  const deFora = await pedido('192.168.0.50');
  assert.equal(deFora.cookies[0].secure, undefined, 'cabeçalho forjado da rede é ignorado');
});

test('escrita exige Origin válida (login incluso)', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const semOrigem = await app.inject({ method: 'POST', url: '/api/login', headers: publico, payload: { senha: SENHA } });
  assert.equal(semOrigem.statusCode, 403);
  const outra = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { host: HOST, origin: 'http://evil.example.com' },
    payload: { senha: SENHA },
  });
  assert.equal(outra.statusCode, 403);
});

test('escrita autenticada exige token CSRF; com ele, grava e registra no audit_log', async (t) => {
  const { app, db, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie, csrf } = await entrar(app);
  const cabecalhos = { ...comOrigem, cookie };

  const sem = await app.inject({ method: 'PUT', url: '/api/config', headers: cabecalhos, payload: { fuso: 'America/Manaus' } });
  assert.equal(sem.statusCode, 403);
  const errado = await app.inject({
    method: 'PUT', url: '/api/config', headers: { ...cabecalhos, 'x-csrf-token': 'x' }, payload: { fuso: 'America/Manaus' },
  });
  assert.equal(errado.statusCode, 403);

  const ok = await app.inject({
    method: 'PUT', url: '/api/config', headers: { ...cabecalhos, 'x-csrf-token': csrf }, payload: { fuso: 'America/Manaus' },
  });
  assert.equal(ok.statusCode, 200);
  const lido = await app.inject({ method: 'GET', url: '/api/config', headers: cabecalhos });
  assert.equal(lido.json().fuso, 'America/Manaus');

  const log = db.prepare("SELECT * FROM audit_log WHERE entidade = 'config'").all();
  assert.equal(log.length, 1);
  assert.deepEqual(JSON.parse(log[0].antes), { fuso: 'America/Sao_Paulo' });
  assert.deepEqual(JSON.parse(log[0].depois), { fuso: 'America/Manaus' });

  const invalido = await app.inject({
    method: 'PUT', url: '/api/config', headers: { ...cabecalhos, 'x-csrf-token': csrf }, payload: { fuso: 'Marte/Olympus' },
  });
  assert.equal(invalido.statusCode, 400);
  assert.ok(invalido.json().campos.fuso);
});

test('token CSRF de uma sessão não vale em outra', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const a = await entrar(app);
  const b = await entrar(app);
  const res = await app.inject({
    method: 'PUT',
    url: '/api/config',
    headers: { ...comOrigem, cookie: a.cookie, 'x-csrf-token': b.csrf },
    payload: { fuso: 'America/Manaus' },
  });
  assert.equal(res.statusCode, 403);
});

test('5 senhas erradas bloqueiam o login (429), mesmo com a senha certa', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const tentar = (senha) =>
    app.inject({ method: 'POST', url: '/api/login', headers: comOrigem, payload: { senha } });
  for (let i = 1; i <= 4; i++) assert.equal((await tentar('errada')).statusCode, 401);
  assert.equal((await tentar('errada')).statusCode, 429);
  const certa = await tentar(SENHA);
  assert.equal(certa.statusCode, 429);
  assert.ok(Number(certa.headers['retry-after']) > 800);
  assert.equal(certa.cookies.length, 0);
});

test('logout encerra a sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie, csrf } = await entrar(app);
  const sair = await app.inject({ method: 'POST', url: '/api/logout', headers: { ...comOrigem, cookie, 'x-csrf-token': csrf } });
  assert.equal(sair.statusCode, 200);
  const depois = await app.inject({ method: 'GET', url: '/api/config', headers: { host: HOST, cookie } });
  assert.equal(depois.statusCode, 401);
});

test('login sem senha definida devolve 409 com instrução', async (t) => {
  const { app, fechar } = await appDeTeste({ senha: null });
  t.after(fechar);
  const res = await app.inject({ method: 'POST', url: '/api/login', headers: comOrigem, payload: { senha: 'qualquer' } });
  assert.equal(res.statusCode, 409);
  assert.match(res.json().erro, /npm run setup/);
});

test('Host fora da lista é recusado; entra se estiver em ORIGENS_PERMITIDAS', async (t) => {
  const { app, fechar } = await appDeTeste({ origensPermitidas: ['meu-pc.ts.net'] });
  t.after(fechar);
  const ruim = await app.inject({ method: 'GET', url: '/api/saude', headers: { host: 'evil.example.com' } });
  assert.equal(ruim.statusCode, 421);
  const bom = await app.inject({ method: 'GET', url: '/api/saude', headers: { host: 'meu-pc.ts.net' } });
  assert.equal(bom.statusCode, 200);
  const login = await app.inject({
    method: 'POST', url: '/api/login', headers: { host: 'meu-pc.ts.net', origin: 'https://meu-pc.ts.net' }, payload: { senha: SENHA },
  });
  assert.equal(login.statusCode, 200);
});

test('API desconhecida devolve 404 em JSON; front ausente avisa para rodar o build', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const anonimo = await app.inject({ method: 'GET', url: '/api/nada', headers: publico });
  assert.equal(anonimo.statusCode, 401, 'sem sessão não revela quais rotas existem');
  const { cookie } = await entrar(app);
  const api = await app.inject({ method: 'GET', url: '/api/nada', headers: { host: HOST, cookie } });
  assert.equal(api.statusCode, 404);
  assert.equal(api.json().erro, 'Não encontrado.');
  const pagina = await app.inject({ method: 'GET', url: '/', headers: publico });
  assert.equal(pagina.statusCode, 503);
  assert.match(pagina.body, /npm run build/);
});

test('erro inesperado devolve 500 genérico, sem detalhe interno', async (t) => {
  const { app, db, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie } = await entrar(app);
  db.exec('DROP TABLE config');
  const res = await app.inject({ method: 'GET', url: '/api/config', headers: { host: HOST, cookie } });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { erro: 'Erro interno.' });
});

test('front: serve index, assets imutáveis, manifest e fallback de rota do app', async (t) => {
  const web = mkdtempSync(join(tmpdir(), 'web-'));
  mkdirSync(join(web, 'assets'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(join(web, 'assets', 'app-abc.js'), 'console.log(1)');
  writeFileSync(join(web, 'manifest.webmanifest'), '{}');
  const { app, fechar } = await appDeTeste({ pastaWeb: web });
  t.after(async () => {
    await fechar();
    rmSync(web, { recursive: true, force: true });
  });

  const raiz = await app.inject({ method: 'GET', url: '/', headers: publico });
  assert.equal(raiz.statusCode, 200);
  assert.match(raiz.headers['content-type'], /text\/html/);
  assert.equal(raiz.headers['cache-control'], 'no-cache');
  assert.match(raiz.headers['content-security-policy'], /script-src 'self'/);

  const asset = await app.inject({ method: 'GET', url: '/assets/app-abc.js', headers: publico });
  assert.equal(asset.statusCode, 200);
  assert.match(asset.headers['cache-control'], /immutable/);

  const manifest = await app.inject({ method: 'GET', url: '/manifest.webmanifest', headers: publico });
  assert.equal(manifest.statusCode, 200);

  const rota = await app.inject({ method: 'GET', url: '/config', headers: publico });
  assert.equal(rota.statusCode, 200);
  assert.match(rota.body, /<title>t<\/title>/);

  const api = await app.inject({ method: 'GET', url: '/api/inexistente', headers: publico });
  assert.equal(api.statusCode, 401);
});

test('EXPOR_NA_REDE=1 sem senha definida recusa subir', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rede-'));
  try {
    const r = spawnSync(process.execPath, ['servidor/index.js'], {
      encoding: 'utf8',
      timeout: 20000,
      env: { ...process.env, DB_PATH: join(pasta, 'x.db'), EXPOR_NA_REDE: '1', SEGREDO_SESSAO: 'segredo', PORT: '0' },
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /preciso ter senha/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
