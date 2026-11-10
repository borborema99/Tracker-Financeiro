import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { atualizarMeta, criarMeta, excluirAporte, excluirMeta, listarMetas, obterMeta, registrarAporte, resumoDeMetas } from '../servidor/banco/repositorios/metas.js';
import { acumuladoDaMeta } from '../servidor/dominio/meta.js';
import { CTX, bancoComPadroes, novaConta, saldoDe } from './ajuda.js';

const nova = async (db, extra = {}) =>
  await criarMeta(db, { nome: 'Reserva', valor_alvo_centavos: 100000, prazo: null, observacao: '', ...extra }, CTX);
const aporte = async (db, meta, valor, extra = {}) =>
  await registrarAporte(db, meta.id, { tipo: 'aporte', valor_centavos: valor, data: '2026-06-10', observacao: '', ...extra }, CTX);

test('RF-13: o acumulado da meta é aportes menos resgates', async () => {
  assert.equal(acumuladoDaMeta([]), 0);
  assert.equal(
    acumuladoDaMeta([
      { tipo: 'aporte', valor_centavos: 30000 },
      { tipo: 'aporte', valor_centavos: 5000 },
      { tipo: 'resgate', valor_centavos: 12000 },
    ]),
    23000,
  );

  const db = await bancoComPadroes();
  const meta = await nova(db);
  await aporte(db, meta, 30000);
  await aporte(db, meta, 5000);
  const depois = await registrarAporte(db, meta.id, { tipo: 'resgate', valor_centavos: 12000, data: '2026-06-11', observacao: '' }, CTX);
  assert.equal(depois.acumulado_centavos, 23000);
  assert.equal(depois.falta_centavos, 77000);
  assert.equal(depois.percentual, 23);
  assert.equal(depois.aportes.length, 3);
});

test('RF-13: aporte e resgate não mexem em saldo de conta nem viram receita ou despesa', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'Conta A', 500000);
  const meta = await nova(db);
  await aporte(db, meta, 40000);
  await registrarAporte(db, meta.id, { tipo: 'resgate', valor_centavos: 10000, data: '2026-06-11', observacao: '' }, CTX);
  assert.equal(await saldoDe(db, conta.id), 500000);
  assert.equal((await movimentacoesDoPeriodo(db, '2026-01-01', '2026-12-31')).length, 0);
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM movimentacoes', [])).n, 0);
});

test('RF-13: a meta nunca fica negativa: resgate maior que o acumulado é recusado (409)', async () => {
  const db = await bancoComPadroes();
  const meta = await nova(db);
  await aporte(db, meta, 10000);
  await assert.rejects(
    async () => await registrarAporte(db, meta.id, { tipo: 'resgate', valor_centavos: 10001, data: '2026-06-11', observacao: '' }, CTX),
    (e) => e.statusCode === 409,
  );
  assert.equal((await obterMeta(db, meta.id, CTX.hoje)).acumulado_centavos, 10000, 'nada foi gravado');
  const zerada = await registrarAporte(db, meta.id, { tipo: 'resgate', valor_centavos: 10000, data: '2026-06-11', observacao: '' }, CTX);
  assert.equal(zerada.acumulado_centavos, 0, 'resgatar tudo é permitido');
});

test('RF-13: remover um aporte que sustenta um resgate é recusado; remover o resgate primeiro funciona', async () => {
  const db = await bancoComPadroes();
  const meta = await nova(db);
  const comAporte = await aporte(db, meta, 10000);
  const idAporte = comAporte.aportes[0].id;
  const comResgate = await registrarAporte(db, meta.id, { tipo: 'resgate', valor_centavos: 6000, data: '2026-06-11', observacao: '' }, CTX);
  const idResgate = comResgate.aportes.find((a) => a.tipo === 'resgate').id;

  await assert.rejects(async () => await excluirAporte(db, meta.id, idAporte, CTX), (e) => e.statusCode === 409);
  assert.equal((await excluirAporte(db, meta.id, idResgate, CTX)).acumulado_centavos, 10000);
  assert.equal((await excluirAporte(db, meta.id, idAporte, CTX)).acumulado_centavos, 0);
  await assert.rejects(async () => await excluirAporte(db, meta.id, idAporte, CTX), (e) => e.statusCode === 404, 'já removido');
});

test('RF-13: aporte com data no futuro é recusado e meta inexistente dá 404', async () => {
  const db = await bancoComPadroes();
  const meta = await nova(db);
  await assert.rejects(
    async () => await aporte(db, meta, 100, { data: '2026-06-16' }),
    (e) => e.statusCode === 400 && Boolean(e.campos.data),
  );
  assert.ok(await aporte(db, meta, 100, { data: '2026-06-15' }), 'hoje vale');
  await assert.rejects(async () => await aporte(db, { id: 999 }, 100), (e) => e.statusCode === 404);
});

test('RF-13: excluir a meta a tira das listas e do resumo; tudo fica no histórico de alterações', async () => {
  const db = await bancoComPadroes();
  const meta = await nova(db);
  await aporte(db, meta, 100);
  await atualizarMeta(db, meta.id, { nome: 'Reserva de emergência', valor_alvo_centavos: 200000, prazo: '2027-01-31', observacao: '' }, CTX);
  assert.equal((await listarMetas(db, CTX.hoje))[0].nome, 'Reserva de emergência');
  assert.ok(await resumoDeMetas(db, CTX.hoje));
  await excluirMeta(db, meta.id, CTX);
  assert.equal((await listarMetas(db, CTX.hoje)).length, 0);
  assert.equal(await resumoDeMetas(db, CTX.hoje), null, 'RF-10: sem meta aberta não há bloco de metas');
  assert.equal(await obterMeta(db, meta.id, CTX.hoje), null);
  const acoes = (await db.todos("SELECT acao FROM audit_log WHERE entidade = 'meta' ORDER BY id", [])).map((l) => l.acao);
  assert.deepEqual(acoes, ['criar', 'editar', 'excluir']);
  assert.equal((await db.um("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'meta_aporte'", [])).n, 1);
});
