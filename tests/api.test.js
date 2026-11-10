import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HOST, ORIGEM, SENHA, USUARIO, appDeTeste, banco, entrar, novoUsuarioDeTeste } from './ajuda.js';

const publico = { host: HOST };
const comOrigem = { host: HOST, origin: ORIGEM };

const tentar = (app, usuario, senha, remoteAddress = '203.0.113.5') =>
  app.inject({ method: 'POST', url: '/api/login', headers: comOrigem, payload: { usuario, senha }, remoteAddress });

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
  for (const [method, url] of [
    ['GET', '/api/config'], ['PUT', '/api/config'], ['POST', '/api/logout'], ['POST', '/api/senha'],
    ['POST', '/api/sessoes/encerrar-outras'], ['DELETE', '/api/conta'],
  ]) {
    const res = await app.inject({ method, url, headers: comOrigem, payload: method === 'GET' ? undefined : {} });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('/api/sessao: sem login não entrega csrf e nunca vaza segredo ou hash', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const anonimo = await app.inject({ method: 'GET', url: '/api/sessao', headers: publico });
  assert.deepEqual(anonimo.json(), { autenticado: false, demo: false, cadastroAberto: false });

  const { cookie } = await entrar(app);
  const logado = await app.inject({ method: 'GET', url: '/api/sessao', headers: { ...publico, cookie } });
  const corpo = logado.json();
  assert.equal(corpo.autenticado, true);
  assert.equal(corpo.usuario, USUARIO);
  assert.equal(corpo.demo, false);
  assert.equal(corpo.fuso, 'America/Sao_Paulo');
  assert.ok(corpo.csrf);
  assert.doesNotMatch(logado.body, /scrypt|segredo-de-teste|pepper-de-teste|senha_hash/);
});

test('login: erro dá 401 com a mesma mensagem para usuário inexistente e senha errada', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const senhaErrada = await tentar(app, USUARIO, 'errada');
  const inexistente = await tentar(app, 'ninguem', 'errada');
  assert.equal(senhaErrada.statusCode, 401);
  assert.equal(inexistente.statusCode, 401);
  assert.deepEqual(senhaErrada.json(), inexistente.json(), 'a resposta não revela quais usuários existem');
  assert.equal(senhaErrada.cookies.length, 0);
  const outroNome = await tentar(app, USUARIO.toUpperCase(), SENHA, '203.0.113.9');
  assert.equal(outroNome.statusCode, 200, 'o nome de usuário não diferencia maiúsculas');
});

test('login: acerto dá cookie HttpOnly + SameSite=Strict (sem Secure em HTTP)', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { res } = await entrar(app);
  assert.equal(res.statusCode, 200);
  const c = res.cookies.find((x) => x.name === 'sessao');
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'Strict');
  assert.equal(c.secure, undefined);
});

test('cookie é __Host-sessao e Secure quando X-Forwarded-Proto: https vem de 127.0.0.1, e só nesse caso', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const pedido = (remoteAddress) =>
    app.inject({
      method: 'POST',
      url: '/api/login',
      remoteAddress,
      headers: { ...comOrigem, 'x-forwarded-proto': 'https' },
      payload: { usuario: USUARIO, senha: SENHA },
    });
  const doProxyLocal = await pedido('127.0.0.1');
  assert.equal(doProxyLocal.cookies[0].name, '__Host-sessao');
  assert.equal(doProxyLocal.cookies[0].secure, true);
  assert.equal(doProxyLocal.headers['strict-transport-security'] !== undefined, true);
  const deFora = await pedido('192.168.0.50');
  assert.equal(deFora.cookies[0].name, 'sessao');
  assert.equal(deFora.cookies[0].secure, undefined, 'cabeçalho forjado da rede é ignorado');
});

test('escrita exige Origin válida (login incluso)', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const payload = { usuario: USUARIO, senha: SENHA };
  const semOrigem = await app.inject({ method: 'POST', url: '/api/login', headers: publico, payload });
  assert.equal(semOrigem.statusCode, 403);
  const outra = await app.inject({ method: 'POST', url: '/api/login', headers: { host: HOST, origin: 'http://evil.example.com' }, payload });
  assert.equal(outra.statusCode, 403);
});

test('escrita autenticada exige token CSRF; com ele, grava e registra no audit_log do usuário', async (t) => {
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

  const log = await db.todos("SELECT * FROM audit_log WHERE entidade = 'config' AND usuario_id = :u", []);
  assert.equal(log.length, 1);
  assert.deepEqual(log[0].antes, { fuso: 'America/Sao_Paulo' });
  assert.deepEqual(log[0].depois, { fuso: 'America/Manaus' });

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

test('5 senhas erradas bloqueiam o usuário (429), mesmo com a senha certa e vindo de outro IP', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (let i = 1; i <= 4; i++) assert.equal((await tentar(app, USUARIO, 'errada', `203.0.113.${i}`)).statusCode, 401);
  assert.equal((await tentar(app, USUARIO, 'errada', '203.0.113.5')).statusCode, 429);
  const certa = await tentar(app, USUARIO, SENHA, '198.51.100.77');
  assert.equal(certa.statusCode, 429, 'o bloqueio é do usuário, não só do IP');
  assert.ok(Number(certa.headers['retry-after']) > 800);
  assert.equal(certa.cookies.length, 0);
  const outroUsuario = await novoUsuarioDeTeste('outra-pessoa');
  assert.ok(outroUsuario);
  assert.equal((await tentar(app, 'outra-pessoa', SENHA, '198.51.100.77')).statusCode, 200, 'outro usuário não é afetado');
});

test('5 erros do mesmo IP bloqueiam o IP, mesmo contra usuários diferentes; outro IP segue livre', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const nome of ['a1', 'a2', 'a3', 'a4']) assert.equal((await tentar(app, nome, 'x', '203.0.113.50')).statusCode, 401);
  assert.equal((await tentar(app, 'a5', 'x', '203.0.113.50')).statusCode, 429);
  assert.equal((await tentar(app, USUARIO, SENHA, '203.0.113.50')).statusCode, 429, 'o IP bloqueado não entra nem com a senha certa');
  assert.equal((await tentar(app, USUARIO, SENHA, '203.0.113.51')).statusCode, 200);
});

test('acertar a própria senha não zera a contagem do IP', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const nome of ['b1', 'b2', 'b3', 'b4']) await tentar(app, nome, 'x', '203.0.113.60');
  assert.equal((await tentar(app, USUARIO, SENHA, '203.0.113.60')).statusCode, 200);
  assert.equal((await tentar(app, 'b5', 'x', '203.0.113.60')).statusCode, 429, 'o quinto erro do IP bloqueia, apesar do acerto no meio');
});

test('nenhum IP em claro vai para o banco', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  await tentar(app, 'c1', 'x', '203.0.113.99');
  const chaves = (await banco.consultar('SELECT chave FROM tentativas_login')).map((l) => l.chave);
  assert.ok(chaves.some((c) => c.startsWith('ip:')));
  assert.ok(chaves.every((c) => !c.includes('203.0.113.99')));
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

test('cadastro fechado (padrão): a rota responde 404 como se não existisse', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const res = await app.inject({
    method: 'POST', url: '/api/cadastro', headers: comOrigem, payload: { usuario: 'intruso', senha: 'uma-senha-boa-123' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.cookies.length, 0);
  const [{ n }] = await banco.consultar("SELECT COUNT(*) AS n FROM usuarios WHERE nome_usuario = 'intruso'");
  assert.equal(n, 0);
});

test('cadastro aberto: cria o usuário com categorias padrão, abre a sessão e recusa nome repetido e senha curta', async (t) => {
  const { app, fechar } = await appDeTeste({ cadastroAberto: true });
  t.after(fechar);
  const cadastro = (usuario, senha) =>
    app.inject({ method: 'POST', url: '/api/cadastro', headers: comOrigem, payload: { usuario, senha } });

  const ok = await cadastro('nova-pessoa', 'uma-senha-boa-123');
  assert.equal(ok.statusCode, 201);
  const cookie = `sessao=${ok.cookies.find((c) => c.name === 'sessao').value}`;
  const categorias = await app.inject({ method: 'GET', url: '/api/categorias', headers: { host: HOST, cookie } });
  assert.ok(categorias.json().itens.length > 20, 'as categorias padrão foram criadas');
  const sessao = await app.inject({ method: 'GET', url: '/api/sessao', headers: { host: HOST, cookie } });
  assert.equal(sessao.json().cadastroAberto, true);
  assert.equal(sessao.json().usuario, 'nova-pessoa');

  assert.equal((await cadastro('NOVA-PESSOA', 'outra-senha-boa-1')).statusCode, 409, 'nome repetido (sem diferenciar maiúsculas)');
  const curta = await cadastro('quem-e', 'curta');
  assert.equal(curta.statusCode, 400);
  assert.ok(curta.json().campos.senha);
  assert.equal((await cadastro('x y', 'uma-senha-boa-123')).statusCode, 400, 'nome inválido');
});

test('trocar a senha: exige a atual, encerra as outras sessões e a antiga deixa de valer', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const atual = await entrar(app);
  const outra = await entrar(app);
  const trocar = (senhaAtual, senhaNova) =>
    app.inject({
      method: 'POST', url: '/api/senha', headers: { ...comOrigem, cookie: atual.cookie, 'x-csrf-token': atual.csrf },
      payload: { senha_atual: senhaAtual, senha_nova: senhaNova },
    });

  assert.equal((await trocar('errada', 'nova-senha-123')).statusCode, 401);
  assert.equal((await trocar(SENHA, 'curta')).statusCode, 400);
  assert.equal((await trocar(SENHA, 'nova-senha-123')).statusCode, 200);

  const aindaAtual = await app.inject({ method: 'GET', url: '/api/config', headers: { host: HOST, cookie: atual.cookie } });
  assert.equal(aindaAtual.statusCode, 200, 'a sessão que trocou a senha continua');
  const encerrada = await app.inject({ method: 'GET', url: '/api/config', headers: { host: HOST, cookie: outra.cookie } });
  assert.equal(encerrada.statusCode, 401, 'a outra sessão foi encerrada');
  assert.equal((await tentar(app, USUARIO, SENHA, '198.51.100.1')).statusCode, 401);
  assert.equal((await tentar(app, USUARIO, 'nova-senha-123', '198.51.100.2')).statusCode, 200);
});

test('errar a senha atual na troca conta como erro de login (sessão roubada não testa senhas à vontade)', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie, csrf } = await entrar(app);
  const trocar = () =>
    app.inject({
      method: 'POST', url: '/api/senha', headers: { ...comOrigem, cookie, 'x-csrf-token': csrf },
      payload: { senha_atual: 'errada', senha_nova: 'nova-senha-123' },
    });
  for (let i = 1; i <= 4; i++) assert.equal((await trocar()).statusCode, 401);
  assert.equal((await trocar()).statusCode, 429);
});

test('"sair dos outros aparelhos" encerra as outras sessões e mantém a atual', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const atual = await entrar(app);
  const outra = await entrar(app);
  const res = await app.inject({
    method: 'POST', url: '/api/sessoes/encerrar-outras', headers: { ...comOrigem, cookie: atual.cookie, 'x-csrf-token': atual.csrf }, payload: {},
  });
  assert.equal(res.json().encerradas, 1);
  assert.equal((await app.inject({ method: 'GET', url: '/api/config', headers: { host: HOST, cookie: atual.cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/config', headers: { host: HOST, cookie: outra.cookie } })).statusCode, 401);
});

test('excluir a conta: exige nome e senha, apaga tudo do usuário e nada de outro', async (t) => {
  const { app, db, usuarioId, fechar } = await appDeTeste();
  t.after(fechar);
  const outraId = await novoUsuarioDeTeste('vizinha');
  const { cookie, csrf } = await entrar(app);
  const cab = { ...comOrigem, cookie, 'x-csrf-token': csrf };
  await app.inject({ method: 'POST', url: '/api/contas', headers: cab, payload: { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 100 } });
  await banco.consultar(
    `INSERT INTO contas (usuario_id, nome, tipo, saldo_inicial_centavos, criada_em, atualizada_em)
     VALUES ($1, 'Da vizinha', 'corrente', 5, now(), now())`,
    [outraId],
  );

  const excluir = (confirmacao, senha) =>
    app.inject({ method: 'DELETE', url: '/api/conta', headers: cab, payload: { confirmacao, senha } });
  assert.equal((await excluir('outro-nome', SENHA)).statusCode, 400);
  assert.equal((await excluir(USUARIO, 'errada')).statusCode, 401);
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM contas WHERE usuario_id = :u', [])).n, 1, 'nada foi apagado ainda');

  assert.equal((await excluir(USUARIO, SENHA)).statusCode, 204);
  for (const tabela of ['contas', 'categorias', 'config', 'audit_log', 'sessoes']) {
    const [{ n }] = await banco.consultar(`SELECT COUNT(*) AS n FROM ${tabela} WHERE usuario_id = $1`, [usuarioId]);
    assert.equal(n, 0, `${tabela} do usuário apagado`);
  }
  const [{ n: usuarios }] = await banco.consultar('SELECT COUNT(*) AS n FROM usuarios WHERE id = $1', [usuarioId]);
  assert.equal(usuarios, 0);
  const [{ n: daVizinha }] = await banco.consultar('SELECT COUNT(*) AS n FROM contas WHERE usuario_id = $1', [outraId]);
  assert.equal(daVizinha, 1, 'os dados de outro usuário continuam');
  const [{ n: categoriasDela }] = await banco.consultar('SELECT COUNT(*) AS n FROM categorias WHERE usuario_id = $1', [outraId]);
  assert.ok(categoriasDela > 20);

  assert.equal((await app.inject({ method: 'GET', url: '/api/config', headers: { host: HOST, cookie } })).statusCode, 401);
  assert.equal((await tentar(app, USUARIO, SENHA, '198.51.100.3')).statusCode, 401);
});

test('Host fora da lista é recusado; entra se estiver em ORIGENS_PERMITIDAS', async (t) => {
  const { app, fechar } = await appDeTeste({ origensPermitidas: ['meu-pc.ts.net'] });
  t.after(fechar);
  const ruim = await app.inject({ method: 'GET', url: '/api/saude', headers: { host: 'evil.example.com' } });
  assert.equal(ruim.statusCode, 421);
  const bom = await app.inject({ method: 'GET', url: '/api/saude', headers: { host: 'meu-pc.ts.net' } });
  assert.equal(bom.statusCode, 200);
  const login = await app.inject({
    method: 'POST', url: '/api/login', headers: { host: 'meu-pc.ts.net', origin: 'https://meu-pc.ts.net' }, payload: { usuario: USUARIO, senha: SENHA },
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
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie } = await entrar(app);
  await banco.consultar('ALTER TABLE config RENAME TO config_quebrada'); // desfeito pelo rollback do teste
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

test('o servidor local recusa subir sem os segredos (SEGREDO_SESSAO, SENHA_PEPPER, HMAC_CHAVE_IP)', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'sem-segredos-'));
  try {
    const r = spawnSync(process.execPath, ['servidor/index.js'], {
      encoding: 'utf8',
      timeout: 20000,
      env: { ...process.env, SEGREDO_SESSAO: '', SENHA_PEPPER: '', HMAC_CHAVE_IP: '', DATABASE_URL: '', PORT: '0' },
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Variáveis ausentes: SEGREDO_SESSAO, SENHA_PEPPER, HMAC_CHAVE_IP/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
