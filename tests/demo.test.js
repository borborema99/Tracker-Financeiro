import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { migrar } from '../servidor/banco/migrar.js';
import { FUSO_PADRAO } from '../contratos/config.js';
import { faturasDoCartao, listarCartoes } from '../servidor/banco/repositorios/cartoes.js';
import { listarCompromissos } from '../servidor/banco/repositorios/compromissos.js';
import { listarContas } from '../servidor/banco/repositorios/contas.js';
import { hojeNoFuso } from '../servidor/dominio/datas.js';
import { listarMovimentacoes } from '../servidor/banco/repositorios/movimentacoes.js';
import { semearDemo } from '../servidor/demo/semear.js';

const TUDO = { por_pagina: 100, pagina: 1, ordenar: 'data', direcao: 'desc', campo_data: 'competencia' };

test('demo: cria contas e lançamentos fictícios uma única vez', async () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  await semearDemo(db);
  const total = listarMovimentacoes(db, TUDO).total;
  assert.equal(listarContas(db).length, 3);
  assert.ok(total >= 25);

  await semearDemo(db);
  assert.equal(listarMovimentacoes(db, TUDO).total, total);
  db.close();
});

test('demo: o cartão fictício tem compras, uma fatura paga, estorno e limite coerente, sem duplicar ao repetir', async () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  await semearDemo(db);
  const hoje = hojeNoFuso(FUSO_PADRAO, new Date());

  const [cartao, ...outros] = listarCartoes(db, hoje);
  assert.equal(outros.length, 0);
  const faturas = faturasDoCartao(db, cartao.id, hoje);
  assert.ok(faturas.some((f) => f.status === 'paga'), 'a fatura mais antiga foi paga');
  assert.ok(faturas.some((f) => f.credito_centavos > 0), 'o estorno abateu uma fatura');
  assert.equal(cartao.limite.limite_centavos - cartao.limite.usado_centavos, cartao.limite.disponivel_centavos);
  const compras = db.prepare('SELECT COUNT(*) AS n FROM compras_cartao').get().n;

  await semearDemo(db); // idempotente
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM compras_cartao').get().n, compras);
  assert.equal(listarCartoes(db, hoje).length, 1);
  db.close();
});

test('demo: tem recorrências com ocorrências pendentes e uma conta atrasada, sem duplicar ao repetir', async () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  await semearDemo(db);
  const hoje = hojeNoFuso(FUSO_PADRAO, new Date());
  const contar = (sql) => db.prepare(sql).get().n;

  assert.equal(contar('SELECT COUNT(*) AS n FROM recorrencias'), 3);
  assert.ok(contar('SELECT COUNT(*) AS n FROM movimentacoes WHERE recorrencia_id IS NOT NULL') >= 9);
  const atrasados = listarCompromissos(db, { tipo: 'despesa', pagina: 1, por_pagina: 50 }, hoje).totais.atrasado_centavos;
  assert.equal(atrasados, 12900);

  const ocorrencias = contar('SELECT COUNT(*) AS n FROM movimentacoes WHERE recorrencia_id IS NOT NULL');
  await semearDemo(db);
  assert.equal(contar('SELECT COUNT(*) AS n FROM recorrencias'), 3);
  assert.equal(contar('SELECT COUNT(*) AS n FROM movimentacoes WHERE recorrencia_id IS NOT NULL'), ocorrencias);
  db.close();
});

test('demo: um banco de demonstração de antes dos cartões recebe só os cartões, sem mexer no resto', async () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  await semearDemo(db);
  db.prepare("DELETE FROM config WHERE chave = 'demo_dados_v2'").run();
  for (const tabela of ['pagamentos_fatura', 'estornos_cartao', 'parcelas_cartao', 'compras_cartao', 'faturas', 'cartoes']) {
    db.prepare(`DELETE FROM ${tabela}`).run();
  }
  const movimentacoes = listarMovimentacoes(db, TUDO).total;

  await semearDemo(db);

  assert.equal(listarMovimentacoes(db, TUDO).total, movimentacoes);
  assert.equal(listarCartoes(db, hojeNoFuso(FUSO_PADRAO, new Date())).length, 1);
  db.close();
});
