import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { migrar } from '../servidor/banco/migrar.js';
import { hashSenha, verificarSenha } from '../servidor/seguranca/senha.js';
import { hostPermitido, hostnameDe, origemValida } from '../servidor/seguranca/origem.js';
import { BLOQUEIO_MS, limparTentativas, registrarErro, verificarBloqueio } from '../servidor/seguranca/tentativas.js';
import { criarSessao, csrfConfere, sessaoValida, tokenCsrf, DURACAO_SESSAO_MS } from '../servidor/seguranca/sessao.js';

function bancoNovo() {
  const db = abrirBanco(':memory:');
  migrar(db);
  return db;
}

test('senha: scrypt com sal, confere a certa e recusa a errada', async () => {
  const h1 = await hashSenha('uma-senha-longa');
  const h2 = await hashSenha('uma-senha-longa');
  assert.match(h1, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(h1, h2, 'sal diferente a cada hash');
  assert.equal(await verificarSenha('uma-senha-longa', h1), true);
  assert.equal(await verificarSenha('outra-senha', h1), false);
  assert.equal(await verificarSenha('x', null), false);
  assert.equal(await verificarSenha('x', 'lixo'), false);
});

test('login: 5 erros bloqueiam por 15 min e o bloqueio expira', () => {
  const db = bancoNovo();
  const t0 = new Date('2026-01-01T12:00:00Z');
  for (let i = 1; i <= 4; i++) {
    assert.equal(registrarErro(db, 'ip', t0).bloqueado, false);
    assert.equal(verificarBloqueio(db, 'ip', t0).bloqueado, false);
  }
  assert.equal(registrarErro(db, 'ip', t0).bloqueado, true);
  const durante = verificarBloqueio(db, 'ip', new Date(t0.getTime() + BLOQUEIO_MS - 1000));
  assert.equal(durante.bloqueado, true);
  assert.equal(durante.segundos, 1);
  assert.equal(verificarBloqueio(db, 'ip', new Date(t0.getTime() + BLOQUEIO_MS)).bloqueado, false);
  // depois de expirar, o contador recomeça do zero
  assert.equal(registrarErro(db, 'ip', new Date(t0.getTime() + BLOQUEIO_MS)).erros, 1);
  db.close();
});

test('login: acerto limpa o contador e chaves diferentes não se misturam', () => {
  const db = bancoNovo();
  for (let i = 0; i < 4; i++) registrarErro(db, 'a');
  limparTentativas(db, 'a');
  assert.equal(registrarErro(db, 'a').erros, 1);
  assert.equal(registrarErro(db, 'b').erros, 1);
  db.close();
});

test('sessão: válida, expira e o banco guarda só o hash do token', () => {
  const db = bancoNovo();
  const t0 = new Date('2026-01-01T00:00:00Z');
  const token = criarSessao(db, t0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE id_hash = ?').get(token).n, 0);
  assert.equal(sessaoValida(db, token, t0), true);
  assert.equal(sessaoValida(db, token, new Date(t0.getTime() + DURACAO_SESSAO_MS)), false);
  assert.equal(sessaoValida(db, token, t0), false, 'sessão expirada é apagada');
  assert.equal(sessaoValida(db, undefined), false);
  db.close();
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
