import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FUSO_PADRAO } from '../contratos/config.js';
import { criarEscopo } from '../servidor/banco/pg/escopo.js';
import { faturasDoCartao, listarCartoes } from '../servidor/banco/repositorios/cartoes.js';
import { listarCompromissos } from '../servidor/banco/repositorios/compromissos.js';
import { listarContas } from '../servidor/banco/repositorios/contas.js';
import { listarMovimentacoes } from '../servidor/banco/repositorios/movimentacoes.js';
import { buscarPorNome } from '../servidor/banco/repositorios/usuarios.js';
import { hojeNoFuso } from '../servidor/dominio/datas.js';
import { NOME_DEMO, SENHA_DEMO, semearDemo } from '../servidor/demo/semear.js';
import { HOST, ORIGEM, PEPPER, appDeTeste, banco } from './ajuda.js';

const TUDO = { por_pagina: 100, pagina: 1, ordenar: 'data', direcao: 'desc', campo_data: 'competencia' };

async function demo() {
  const id = await semearDemo(banco, { pepper: PEPPER });
  const esc = criarEscopo(banco, id);
  const contar = async (sql, params = []) => (await esc.um(sql, params)).n;
  return { esc, id, contar, semear: () => semearDemo(banco, { pepper: PEPPER }) };
}

test('demo: cria o usuário "demo" (marcado como demonstração), contas e lançamentos fictícios uma única vez', async () => {
  const { esc, id, semear } = await demo();
  const usuario = await buscarPorNome(banco, NOME_DEMO);
  assert.equal(usuario.id, id);
  assert.equal(usuario.demo, true);

  const total = (await listarMovimentacoes(esc, TUDO, '2026-06-15')).total;
  assert.equal((await listarContas(esc)).length, 3);
  assert.ok(total >= 25);

  assert.equal(await semear(), id, 'rodar de novo devolve o mesmo usuário');
  assert.equal((await listarMovimentacoes(esc, TUDO, '2026-06-15')).total, total);
  assert.equal((await banco.consultar('SELECT COUNT(*) AS n FROM usuarios WHERE nome_usuario = $1', [NOME_DEMO]))[0].n, 1);
});

test('demo: o cartão fictício tem compras, uma fatura paga, estorno e limite coerente, sem duplicar ao repetir', async () => {
  const { esc, contar, semear } = await demo();
  const hoje = hojeNoFuso(FUSO_PADRAO, new Date());

  const [cartao, ...outros] = await listarCartoes(esc, hoje);
  assert.equal(outros.length, 0);
  const faturas = await faturasDoCartao(esc, cartao.id, hoje);
  assert.ok(faturas.some((f) => f.status === 'paga'), 'a fatura mais antiga foi paga');
  assert.ok(faturas.some((f) => f.credito_centavos > 0), 'o estorno abateu uma fatura');
  assert.equal(cartao.limite.limite_centavos - cartao.limite.usado_centavos, cartao.limite.disponivel_centavos);
  const compras = await contar('SELECT COUNT(*) AS n FROM compras_cartao WHERE usuario_id = :u');

  await semear(); // idempotente
  assert.equal(await contar('SELECT COUNT(*) AS n FROM compras_cartao WHERE usuario_id = :u'), compras);
  assert.equal((await listarCartoes(esc, hoje)).length, 1);
});

test('demo: tem recorrências com ocorrências pendentes e uma conta atrasada, sem duplicar ao repetir', async () => {
  const { esc, contar, semear } = await demo();
  const hoje = hojeNoFuso(FUSO_PADRAO, new Date());

  assert.equal(await contar('SELECT COUNT(*) AS n FROM recorrencias WHERE usuario_id = :u'), 6, '3 recorrências comuns + 3 assinaturas');
  const comRecorrencia = 'SELECT COUNT(*) AS n FROM movimentacoes WHERE recorrencia_id IS NOT NULL AND usuario_id = :u';
  assert.ok((await contar(comRecorrencia)) >= 9);
  const atrasados = (await listarCompromissos(esc, { tipo: 'despesa', pagina: 1, por_pagina: 50 }, hoje)).totais.atrasado_centavos;
  assert.equal(atrasados, 12900 + 30000, 'a conta atrasada (12900) + a 2ª parcela da dívida (30000)');

  const ocorrencias = await contar(comRecorrencia);
  await semear();
  assert.equal(await contar('SELECT COUNT(*) AS n FROM recorrencias WHERE usuario_id = :u'), 6);
  assert.equal(await contar(comRecorrencia), ocorrencias);
});

test('demo: a demonstração traz orçamento e metas, e rodar de novo não duplica nada', async () => {
  const { contar, semear } = await demo();
  const n = (tabela) => contar(`SELECT COUNT(*) AS n FROM ${tabela} WHERE usuario_id = :u`);
  assert.equal(await n('orcamentos'), 4);
  assert.equal(await n('metas'), 2);
  assert.equal(await n('metas_aportes'), 2);
  await semear();
  assert.equal(await n('orcamentos'), 4);
  assert.equal(await n('metas'), 2);
});

test('demo: a demonstração traz uma dívida (com uma parcela paga e uma atrasada) e assinaturas, sem duplicar', async () => {
  const { contar, semear } = await demo();
  const dividas = 'SELECT COUNT(*) AS n FROM dividas WHERE usuario_id = :u';
  const assinaturas = 'SELECT COUNT(*) AS n FROM recorrencias WHERE assinatura = true AND usuario_id = :u';
  assert.equal(await contar(dividas), 1);
  assert.equal(await contar('SELECT COUNT(*) AS n FROM movimentacoes WHERE divida_id IS NOT NULL AND usuario_id = :u'), 12);
  assert.equal(
    await contar("SELECT COUNT(*) AS n FROM movimentacoes WHERE divida_id IS NOT NULL AND status = 'liquidada' AND usuario_id = :u"),
    1,
  );
  assert.equal(await contar(assinaturas), 3);
  await semear();
  assert.equal(await contar(dividas), 1);
  assert.equal(await contar(assinaturas), 3);
});

test('demo: um banco de demonstração de antes dos cartões recebe só os cartões, sem mexer no resto', async () => {
  const { esc, contar, semear } = await demo();
  await esc.rodar("DELETE FROM config WHERE chave = 'demo_dados_v2' AND usuario_id = :u");
  for (const tabela of ['pagamentos_fatura', 'estornos_cartao', 'parcelas_cartao', 'compras_cartao', 'faturas', 'cartoes']) {
    await esc.rodar(`DELETE FROM ${tabela} WHERE usuario_id = :u`);
  }
  const movimentacoes = (await listarMovimentacoes(esc, TUDO, '2026-06-15')).total;

  await semear();

  assert.equal((await listarMovimentacoes(esc, TUDO, '2026-06-15')).total, movimentacoes);
  assert.equal((await listarCartoes(esc, hojeNoFuso(FUSO_PADRAO, new Date()))).length, 1);
  assert.equal(await contar('SELECT COUNT(*) AS n FROM cartoes WHERE usuario_id = :u'), 1);
});

test('demo: a demonstração traz investimentos (um com valor informado, um sem), mexe no saldo só do que tem conta, sem duplicar', async () => {
  const { contar, semear } = await demo();
  const n = (tabela, onde = '') => contar(`SELECT COUNT(*) AS n FROM ${tabela} WHERE usuario_id = :u ${onde}`);
  assert.equal(await n('investimentos'), 2);
  assert.equal(await n('investimentos_operacoes'), 2);
  assert.equal(await n('investimentos_avaliacoes'), 1);
  assert.equal(await n('investimentos_operacoes', 'AND conta_id IS NOT NULL'), 1);
  await semear();
  assert.equal(await n('investimentos'), 2);
});

test('demo: só o usuário demo vê a faixa de demonstração; os dados dele não aparecem para outro usuário', async (t) => {
  const { app, fechar, usuarioId } = await appDeTeste();
  t.after(fechar);
  const { id } = await demo();
  const entrar = async (usuario, senha) => {
    const login = await app.inject({
      method: 'POST', url: '/api/login', headers: { host: HOST, origin: ORIGEM }, payload: { usuario, senha },
    });
    assert.equal(login.statusCode, 200);
    return `sessao=${login.cookies.find((c) => c.name === 'sessao').value}`;
  };

  // O usuário demo foi semeado com a senha do teste (PEPPER de teste), então a senha pública da demonstração vale.
  const cookieDemo = await entrar(NOME_DEMO, SENHA_DEMO);
  const sessaoDemo = await app.inject({ method: 'GET', url: '/api/sessao', headers: { host: HOST, cookie: cookieDemo } });
  assert.equal(sessaoDemo.json().demo, true);
  const contasDemo = await app.inject({ method: 'GET', url: '/api/contas', headers: { host: HOST, cookie: cookieDemo } });
  assert.equal(contasDemo.json().itens.length, 3);

  const cookieNormal = await entrar('tester', 'senha-de-teste-123');
  const sessaoNormal = await app.inject({ method: 'GET', url: '/api/sessao', headers: { host: HOST, cookie: cookieNormal } });
  assert.equal(sessaoNormal.json().demo, false, 'a faixa é só do usuário demo');
  const contasNormal = await app.inject({ method: 'GET', url: '/api/contas', headers: { host: HOST, cookie: cookieNormal } });
  assert.deepEqual(contasNormal.json().itens, [], 'nenhuma conta da demonstração vaza');
  assert.notEqual(id, usuarioId);
});
