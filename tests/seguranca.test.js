import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashSenha, verificarSenha, conferirContraFalso } from '../servidor/seguranca/senha.js';
import { hostPermitido, hostnameDe, origemValida } from '../servidor/seguranca/origem.js';
import {
  BLOQUEIO_MS,
  chaveDoIp,
  chaveDoUsuario,
  limparTentativas,
  limparTentativasAntigas,
  registrarErro,
  verificarBloqueio,
} from '../servidor/seguranca/tentativas.js';
import {
  DURACAO_SESSAO_MS,
  buscarSessao,
  criarSessao,
  csrfConfere,
  encerrarOutrasSessoes,
  encerrarTodasSessoes,
  tokenCsrf,
} from '../servidor/seguranca/sessao.js';
import { PEPPER, banco, novoUsuarioDeTeste } from './ajuda.js';

test('senha: scrypt com sal e pepper, confere a certa e recusa a errada', async () => {
  const h1 = await hashSenha('uma-senha-longa', PEPPER);
  const h2 = await hashSenha('uma-senha-longa', PEPPER);
  assert.match(h1, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(h1, h2, 'sal diferente a cada hash');
  assert.equal(await verificarSenha('uma-senha-longa', h1, PEPPER), true);
  assert.equal(await verificarSenha('outra-senha', h1, PEPPER), false);
  assert.equal(await verificarSenha('uma-senha-longa', h1, 'outro-pepper'), false, 'sem o pepper o hash não confere');
  assert.equal(await verificarSenha('x', null, PEPPER), false);
  assert.equal(await verificarSenha('x', 'lixo', PEPPER), false);
  await assert.rejects(async () => hashSenha('x', ''), /SENHA_PEPPER/);
});

test('senha: usuário inexistente gasta o mesmo trabalho e nunca confere', async () => {
  assert.equal(await conferirContraFalso('qualquer-coisa', PEPPER), false);
  assert.equal(await conferirContraFalso('qualquer-coisa', PEPPER), false);
});

test('login: 5 erros bloqueiam por 15 min, o bloqueio expira e a contagem recomeça', async () => {
  const chave = chaveDoUsuario('Maria');
  const t0 = new Date('2026-01-01T12:00:00Z');
  for (let i = 1; i <= 4; i++) {
    assert.equal((await registrarErro(banco, [chave], t0)).bloqueado, false);
    assert.equal((await verificarBloqueio(banco, [chave], t0)).bloqueado, false);
  }
  assert.equal((await registrarErro(banco, [chave], t0)).bloqueado, true);
  const durante = await verificarBloqueio(banco, [chave], new Date(t0.getTime() + BLOQUEIO_MS - 1000));
  assert.equal(durante.bloqueado, true);
  assert.equal(durante.segundos, 1);
  const depois = new Date(t0.getTime() + BLOQUEIO_MS);
  assert.equal((await verificarBloqueio(banco, [chave], depois)).bloqueado, false);
  // Depois de expirar, o contador recomeça do zero: precisa de cinco erros de novo.
  for (let i = 1; i <= 4; i++) assert.equal((await registrarErro(banco, [chave], depois)).bloqueado, false);
  assert.equal((await registrarErro(banco, [chave], depois)).bloqueado, true);
});

test('login: erros espalhados por mais de 15 minutos não somam', async () => {
  const chave = chaveDoUsuario('joao');
  const t0 = new Date('2026-01-01T12:00:00Z');
  for (let i = 0; i < 4; i++) await registrarErro(banco, [chave], new Date(t0.getTime() + i * 20 * 60 * 1000));
  const [linha] = await banco.consultar('SELECT erros FROM tentativas_login WHERE chave = $1', [chave]);
  assert.equal(linha.erros, 1, 'cada erro veio depois da janela do anterior');
});

test('login: acerto limpa o contador e chaves diferentes não se misturam', async () => {
  for (let i = 0; i < 4; i++) await registrarErro(banco, ['a']);
  await limparTentativas(banco, 'a');
  assert.equal((await registrarErro(banco, ['a'])).bloqueado, false);
  const [{ erros }] = await banco.consultar("SELECT erros FROM tentativas_login WHERE chave = 'a'");
  assert.equal(erros, 1);
  await registrarErro(banco, ['b']);
  const [{ erros: b }] = await banco.consultar("SELECT erros FROM tentativas_login WHERE chave = 'b'");
  assert.equal(b, 1);
});

test('login: o bloqueio vale por usuário e por IP, e o maior tempo vence', async () => {
  const t0 = new Date('2026-01-01T12:00:00Z');
  const ip = chaveDoIp('203.0.113.7', 'chave-hmac');
  const dona = chaveDoUsuario('ana');
  // O mesmo IP erra a senha de usuários diferentes: o IP bloqueia, os usuários não.
  for (const nome of ['u1', 'u2', 'u3', 'u4', 'u5']) await registrarErro(banco, [chaveDoUsuario(nome), ip], t0);
  assert.equal((await verificarBloqueio(banco, [dona, ip], t0)).bloqueado, true, 'ana é barrada pelo IP');
  assert.equal((await verificarBloqueio(banco, [dona, chaveDoIp('198.51.100.9', 'chave-hmac')], t0)).bloqueado, false);
  assert.equal((await verificarBloqueio(banco, [chaveDoUsuario('u1')], t0)).bloqueado, false, 'o usuário em si não bloqueou');
});

test('login: o IP nunca é gravado em claro, só o HMAC com a chave do servidor', async () => {
  const chave = chaveDoIp('203.0.113.7', 'chave-hmac');
  assert.match(chave, /^ip:[A-Za-z0-9_-]{43}$/);
  assert.ok(!chave.includes('203.0.113.7'));
  assert.notEqual(chave, chaveDoIp('203.0.113.7', 'outra-chave'));
  assert.equal(chaveDoUsuario('  Maria '), 'usuario:maria', 'maiúsculas e espaços não criam outro contador');
});

test('login: contagens com mais de um dia são apagadas pela manutenção', async () => {
  const velho = new Date('2026-01-01T00:00:00Z');
  await registrarErro(banco, ['velho'], velho);
  await registrarErro(banco, ['novo'], new Date('2026-01-03T00:00:00Z'));
  assert.equal(await limparTentativasAntigas(banco, new Date('2026-01-03T01:00:00Z')), 1);
  const chaves = (await banco.consultar('SELECT chave FROM tentativas_login')).map((l) => l.chave);
  assert.deepEqual(chaves, ['novo']);
});

test('sessão: válida, expira e o banco guarda só o hash do token', async () => {
  const usuarioId = await novoUsuarioDeTeste('sessao-1');
  const t0 = new Date('2026-01-01T00:00:00Z');
  const token = await criarSessao(banco, usuarioId, t0);
  const [{ n }] = await banco.consultar('SELECT COUNT(*) AS n FROM sessoes WHERE id_hash = $1', [token]);
  assert.equal(n, 0, 'o token em si não está no banco');
  assert.deepEqual(await buscarSessao(banco, token, t0), { usuarioId, nome: 'sessao-1', demo: false });
  assert.equal(await buscarSessao(banco, token, new Date(t0.getTime() + DURACAO_SESSAO_MS)), null);
  assert.equal(await buscarSessao(banco, token, t0), null, 'sessão expirada é apagada');
  assert.equal(await buscarSessao(banco, undefined), null);
  assert.equal(await buscarSessao(banco, 'token-inventado'), null);
});

test('sessão: encerrar as outras mantém só a atual, e só do mesmo usuário', async () => {
  const a = await novoUsuarioDeTeste('sessao-a');
  const b = await novoUsuarioDeTeste('sessao-b');
  const t0 = new Date();
  const atual = await criarSessao(banco, a, t0);
  const outra = await criarSessao(banco, a, t0);
  const deB = await criarSessao(banco, b, t0);
  assert.equal(await encerrarOutrasSessoes(banco, a, atual), 1);
  assert.ok(await buscarSessao(banco, atual));
  assert.equal(await buscarSessao(banco, outra), null);
  assert.ok(await buscarSessao(banco, deB), 'sessão de outro usuário não é tocada');
  await encerrarTodasSessoes(banco, a);
  assert.equal(await buscarSessao(banco, atual), null);
  assert.ok(await buscarSessao(banco, deB));
});

test('csrf: depende da sessão e do segredo', () => {
  const a = tokenCsrf('sessao-a', 'segredo');
  assert.equal(csrfConfere(a, 'sessao-a', 'segredo'), true);
  assert.equal(csrfConfere(a, 'sessao-b', 'segredo'), false);
  assert.equal(csrfConfere(a, 'sessao-a', 'outro'), false);
  assert.equal(csrfConfere(undefined, 'sessao-a', 'segredo'), false);
  assert.equal(csrfConfere('curto', 'sessao-a', 'segredo'), false);
});

test('origem: hostnameDe e hostPermitido', () => {
  assert.equal(hostnameDe('Meu-PC.ts.net:3000'), 'meu-pc.ts.net');
  assert.equal(hostnameDe('https://Meu-PC.ts.net/x'), 'meu-pc.ts.net');
  assert.equal(hostnameDe('[::1]:3000'), '::1');
  assert.equal(hostnameDe(''), null);
  assert.equal(hostPermitido('localhost:3000'), true);
  assert.equal(hostPermitido('127.0.0.1:3000'), true);
  assert.equal(hostPermitido('192.168.0.10:3000'), true);
  assert.equal(hostPermitido('[::1]:3000'), true);
  assert.equal(hostPermitido('evil.example.com'), false, 'domínio fora da lista (DNS rebinding)');
  assert.equal(hostPermitido('meu-pc.ts.net', ['meu-pc.ts.net']), true);
  assert.equal(hostPermitido('meu-pc.ts.net:443', ['https://meu-pc.ts.net']), true);
  assert.equal(hostPermitido(undefined), false);
});

test('origem: Origin precisa existir e bater com o Host', () => {
  assert.equal(origemValida('http://localhost:3000', 'localhost:3000'), true);
  assert.equal(origemValida('http://localhost:5173', 'localhost:3000'), false);
  assert.equal(origemValida('http://evil.example.com', 'evil.example.com'), false);
  assert.equal(origemValida('https://meu-pc.ts.net', 'meu-pc.ts.net', ['meu-pc.ts.net']), true);
  assert.equal(origemValida('null', 'localhost:3000'), false);
  assert.equal(origemValida(undefined, 'localhost:3000'), false);
  assert.equal(origemValida('não é url', 'localhost:3000'), false);
});
