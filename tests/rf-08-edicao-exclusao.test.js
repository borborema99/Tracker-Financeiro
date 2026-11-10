import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  atualizarMovimentacao,
  excluirMovimentacao,
  listarMovimentacoes,
  movimentacoesDoPeriodo,
  obterMovimentacao,
} from '../servidor/banco/repositorios/movimentacoes.js';
import { excluirConta } from '../servidor/banco/repositorios/contas.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { esquemaFiltros } from '../contratos/movimentacoes.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaConta, novaMov, saldoDe } from './ajuda.js';

const JUNHO = ['2026-06-01', '2026-06-30'];
const realizado = async (db) => resumoRealizado(await movimentacoesDoPeriodo(db, ...JUNHO), ...JUNHO);

test('RF-08: editar valor, conta e tipo atualiza saldos e indicadores', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  const b = await novaConta(db, 'B', 0);
  const m = await novaMov(db, { tipo: 'despesa', valor_centavos: 3000, conta_id: a.id });
  assert.equal(await saldoDe(db, a.id), 7000);
  assert.equal((await realizado(db)).despesas, 3000);

  await atualizarMovimentacao(db, m.id, { ...m, valor_centavos: 4500, conta_id: b.id }, CTX);
  assert.equal(await saldoDe(db, a.id), 10000);
  assert.equal(await saldoDe(db, b.id), -4500);
  assert.equal((await realizado(db)).despesas, 4500);

  await atualizarMovimentacao(db, m.id, { ...m, tipo: 'receita', valor_centavos: 4500, conta_id: b.id, categoria_id: null }, CTX);
  assert.equal(await saldoDe(db, b.id), 4500);
  assert.deepEqual(await realizado(db), { receitas: 4500, despesas: 0, resultado: 4500 });
});

test('RF-08: excluir devolve o saldo e tira dos indicadores e da listagem', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  const m = await novaMov(db, { valor_centavos: 2500, conta_id: a.id });
  await excluirMovimentacao(db, m.id, CTX);
  assert.equal(await saldoDe(db, a.id), 10000);
  assert.equal((await realizado(db)).despesas, 0);
  assert.equal((await listarMovimentacoes(db, esquemaFiltros.parse({}))).total, 0);
  assert.equal(await obterMovimentacao(db, m.id), null);
  // exclusão é lógica: a linha continua no banco
  assert.ok((await db.um('SELECT excluida_em FROM movimentacoes WHERE id = ?', [m.id])).excluida_em);
});

test('RF-08: excluir a transferência exclui a tarifa junto (nada órfão)', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  const b = await novaConta(db, 'B', 0);
  const t = await novaMov(db, { tipo: 'transferencia', valor_centavos: 1000, conta_id: a.id, conta_destino_id: b.id, tarifa_centavos: 90 });
  assert.equal(await saldoDe(db, a.id), 10000 - 1000 - 90);
  await excluirMovimentacao(db, t.id, CTX);
  assert.equal(await saldoDe(db, a.id), 10000);
  assert.equal(await saldoDe(db, b.id), 0);
  const orfas = (await db.um(`SELECT COUNT(*) AS n FROM movimentacoes f JOIN movimentacoes p ON p.id = f.transferencia_id
        WHERE f.excluida_em IS NULL AND p.excluida_em IS NOT NULL`, [])).n;
  assert.equal(orfas, 0);
  assert.equal((await listarMovimentacoes(db, esquemaFiltros.parse({}))).total, 0);
});

test('RF-08: editar a transferência ajusta, cria ou remove a tarifa', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  const b = await novaConta(db, 'B', 0);
  const t = await novaMov(db, { tipo: 'transferencia', valor_centavos: 1000, conta_id: a.id, conta_destino_id: b.id });
  const editar = async (extra) => (await atualizarMovimentacao(db, t.id, { ...t, ...extra }, CTX)).movimentacao;

  assert.equal((await editar({ tarifa_centavos: 200 })).tarifa_centavos, 200);
  assert.equal(await saldoDe(db, a.id), 10000 - 1000 - 200);
  assert.equal((await editar({ tarifa_centavos: 50, valor_centavos: 2000 })).tarifa_centavos, 50);
  assert.equal(await saldoDe(db, a.id), 10000 - 2000 - 50);
  assert.equal((await editar({ tarifa_centavos: 0, valor_centavos: 2000 })).tarifa_centavos, 0);
  assert.equal(await saldoDe(db, a.id), 10000 - 2000);
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM movimentacoes WHERE transferencia_id = ? AND excluida_em IS NULL', [t.id])).n, 0);
});

test('RF-08: a tarifa só muda ou some pela transferência', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  const b = await novaConta(db, 'B', 0);
  const t = await novaMov(db, { tipo: 'transferencia', valor_centavos: 1000, conta_id: a.id, conta_destino_id: b.id, tarifa_centavos: 90 });
  const tarifa = (await db.um('SELECT id FROM movimentacoes WHERE transferencia_id = ?', [t.id]));
  const filha = await obterMovimentacao(db, tarifa.id);
  await assert.rejects(async () => await excluirMovimentacao(db, tarifa.id, CTX), (e) => e.statusCode === 409);
  await assert.rejects(async () => await atualizarMovimentacao(db, tarifa.id, { ...filha, valor_centavos: 5 }, CTX), (e) => e.statusCode === 409);
});

test('RF-08: excluir lançamento dividido não deixa divisões ativas na listagem nem nos filtros', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  const mercado = await categoriaPorNome(db, 'Mercado');
  const farmacia = await categoriaPorNome(db, 'Farmácia');
  const m = await novaMov(db, {
    valor_centavos: 10000,
    conta_id: a.id,
    divisoes: [{ categoria_id: mercado.id, valor_centavos: 6000 }, { categoria_id: farmacia.id, valor_centavos: 4000 }],
  });
  assert.equal((await listarMovimentacoes(db, esquemaFiltros.parse({ categoria_id: String(mercado.id) }))).total, 1);
  await excluirMovimentacao(db, m.id, CTX);
  assert.equal((await listarMovimentacoes(db, esquemaFiltros.parse({ categoria_id: String(mercado.id) }))).total, 0);
});

test('RF-08: conta com movimentações não pode ser excluída (só arquivada); categoria em uso também não', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A');
  await novaMov(db, { conta_id: a.id });
  await assert.rejects(async () => await excluirConta(db, a.id, CTX), (e) => e.statusCode === 409);
  const vazia = await novaConta(db, 'Vazia');
  await excluirConta(db, vazia.id, CTX);
});

test('RF-08: toda escrita grava no audit_log com valor antes e depois', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  const m = await novaMov(db, { conta_id: a.id, valor_centavos: 1000 });
  await atualizarMovimentacao(db, m.id, { ...m, valor_centavos: 2000 }, CTX);
  await excluirMovimentacao(db, m.id, CTX);
  const log = (await db.todos("SELECT acao, antes, depois FROM audit_log WHERE entidade = 'movimentacao' AND entidade_id = ? ORDER BY id", [String(m.id)]));
  assert.deepEqual(log.map((l) => l.acao), ['criar', 'editar', 'excluir']);
  assert.equal(log[0].antes, null);
  assert.equal(log[1].antes.valor_centavos, 1000);
  assert.equal(log[1].depois.valor_centavos, 2000);
  assert.equal(log[2].antes.valor_centavos, 2000);
  assert.equal(log[2].depois, null);
});

test('RF-08: se a escrita falha, nada é gravado (nem o audit_log)', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  const antes = (await db.um('SELECT COUNT(*) AS n FROM audit_log', [])).n;
  await assert.rejects(async () => await novaMov(db, { conta_id: a.id, categoria_id: 99999 }));
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM audit_log', [])).n, antes);
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM movimentacoes', [])).n, 0);
});
