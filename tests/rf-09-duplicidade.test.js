import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarMovimentacao, excluirMovimentacao, listarMovimentacoes } from '../servidor/banco/repositorios/movimentacoes.js';
import { encontrarDuplicadas, normalizarDescricao } from '../servidor/dominio/duplicidade.js';
import { esquemaFiltros } from '../contratos/movimentacoes.js';
import { CTX, bancoComPadroes, novaConta, novaMov, saldoDe } from './ajuda.js';

const base = { tipo: 'despesa', descricao: 'Padaria', valor_centavos: 1850, data_competencia: '2026-06-10' };

async function criar(db, extra) {
  return await criarMovimentacao(
    db,
    { status: 'liquidada', observacao: '', divisoes: [], tarifa_centavos: 0, ...base, ...extra },
    CTX,
  );
}

test('RF-09: mesmo valor, data, conta e descrição gera aviso, mas não bloqueia', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  const primeira = await criar(db, { conta_id: a.id });
  assert.deepEqual(primeira.avisos, []);
  const segunda = await criar(db, { conta_id: a.id });
  assert.equal(segunda.avisos.length, 1);
  assert.equal(segunda.avisos[0].codigo, 'possivel_duplicidade');
  assert.deepEqual(segunda.avisos[0].ids, [primeira.movimentacao.id]);
  // não bloqueou: as duas existem e as duas contam no saldo
  assert.equal((await listarMovimentacoes(db, esquemaFiltros.parse({}))).total, 2);
  assert.equal(await saldoDe(db, a.id), 10000 - 2 * 1850);
});

test('RF-09: a descrição é comparada sem acento, caixa nem espaços repetidos', async () => {
  assert.equal(normalizarDescricao('  PÃO   de Açúcar '), 'pao de acucar');
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  await criar(db, { conta_id: a.id, descricao: 'Pão de Açúcar' });
  assert.equal((await criar(db, { conta_id: a.id, descricao: ' pao  de acucar' })).avisos.length, 1);
});

test('RF-09: qualquer diferença em valor, data, conta ou descrição não gera aviso', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A');
  const b = await novaConta(db, 'B');
  await criar(db, { conta_id: a.id });
  assert.deepEqual((await criar(db, { conta_id: a.id, valor_centavos: 1851 })).avisos, []);
  assert.deepEqual((await criar(db, { conta_id: a.id, data_competencia: '2026-06-11' })).avisos, []);
  assert.deepEqual((await criar(db, { conta_id: b.id })).avisos, []);
  assert.deepEqual((await criar(db, { conta_id: a.id, descricao: 'Mercado' })).avisos, []);
  assert.deepEqual((await criar(db, { conta_id: a.id, tipo: 'receita' })).avisos, []);
});

test('RF-09: lançamento excluído não conta como duplicado', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  const primeira = await criar(db, { conta_id: a.id });
  await excluirMovimentacao(db, primeira.movimentacao.id, CTX);
  assert.deepEqual((await criar(db, { conta_id: a.id })).avisos, []);
});

test('RF-09: a tarifa gerada pela transferência nunca é tratada como duplicidade', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  const b = await novaConta(db, 'B');
  const t = { tipo: 'transferencia', descricao: 'Reserva', valor_centavos: 500, conta_id: a.id, conta_destino_id: b.id, tarifa_centavos: 100 };
  assert.deepEqual((await criar(db, t)).avisos, []);
  const segunda = await criar(db, { ...t, data_competencia: '2026-06-10' });
  assert.equal(segunda.avisos.length, 1);
  assert.equal(segunda.avisos[0].ids.length, 1, 'só a outra transferência, não as tarifas');
});

test('RF-09: uma movimentação nunca é contada duas vezes (listagem e totais contam cada linha uma vez)', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  await novaMov(db, { conta_id: a.id, valor_centavos: 700 });
  const r = await listarMovimentacoes(db, esquemaFiltros.parse({ conta_id: String(a.id) }));
  assert.equal(r.total, 1);
  assert.equal(r.totais.realizado.despesas, 700);
  const b = await novaConta(db, 'B');
  await novaMov(db, { tipo: 'transferencia', conta_id: a.id, conta_destino_id: b.id, valor_centavos: 300, descricao: 'x' });
  const doDestino = await listarMovimentacoes(db, esquemaFiltros.parse({ conta_id: String(b.id) }));
  assert.equal(doDestino.total, 1);
  assert.equal(doDestino.itens.length, 1);
});

test('RF-09: editar sem mudar nada não acusa duplicidade com ele mesmo', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  const m = (await criar(db, { conta_id: a.id })).movimentacao;
  assert.deepEqual(encontrarDuplicadas(m, [m]), []);
});
