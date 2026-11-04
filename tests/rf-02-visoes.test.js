import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarMovimentacoes, movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { resumoDoPeriodo, resumoPrevisto, totaisDaListagem } from '../servidor/dominio/resumo.js';
import { esquemaFiltros } from '../contratos/movimentacoes.js';
import { HOST, appDeTeste, entrar, bancoComPadroes, novaConta, novaMov } from './ajuda.js';

const JUNHO = { de: '2026-06-01', ate: '2026-06-30' };

function cenario(db) {
  const c = novaConta(db);
  novaMov(db, { tipo: 'receita', valor_centavos: 100000, conta_id: c.id, data_liquidacao: '2026-06-05' });
  novaMov(db, { tipo: 'despesa', valor_centavos: 30000, conta_id: c.id, data_liquidacao: '2026-06-06' });
  novaMov(db, { tipo: 'despesa', valor_centavos: 7000, conta_id: c.id, status: 'pendente', data_vencimento: '2026-06-20' });
  novaMov(db, { tipo: 'receita', valor_centavos: 2500, conta_id: c.id, status: 'pendente', data_vencimento: '2026-06-25' });
  return c;
}

test('RF-02: realizado e previsto vêm separados e cada movimentação está em uma só visão', () => {
  const db = bancoComPadroes();
  cenario(db);
  const r = resumoDoPeriodo(movimentacoesDoPeriodo(db, JUNHO.de, JUNHO.ate), JUNHO);
  assert.deepEqual(r.realizado, { receitas: 100000, despesas: 30000, resultado: 70000 });
  assert.deepEqual(r.previsto, { receitas: 2500, despesas: 7000 });
});

test('RF-02: o resumo não tem nenhum total que misture realizado com previsto', () => {
  const db = bancoComPadroes();
  cenario(db);
  const r = resumoDoPeriodo(movimentacoesDoPeriodo(db, JUNHO.de, JUNHO.ate), JUNHO);
  assert.deepEqual(Object.keys(r).sort(), ['previsto', 'realizado']);
  assert.deepEqual(Object.keys(r.previsto).sort(), ['despesas', 'receitas']);
});

test('RF-02: previsto usa o vencimento (ou a competência, se não houver) e some ao liquidar', () => {
  const sem = [{ tipo: 'despesa', valor_centavos: 100, status: 'pendente', data_competencia: '2026-06-09', data_vencimento: null }];
  assert.equal(resumoPrevisto(sem, JUNHO.de, JUNHO.ate).despesas, 100);
  const fora = [{ tipo: 'despesa', valor_centavos: 100, status: 'pendente', data_competencia: '2026-06-09', data_vencimento: '2026-07-02' }];
  assert.equal(resumoPrevisto(fora, JUNHO.de, JUNHO.ate).despesas, 0);
});

test('RF-02: totais da listagem também separam as duas visões', () => {
  const db = bancoComPadroes();
  cenario(db);
  const { totais } = listarMovimentacoes(db, esquemaFiltros.parse({}));
  assert.deepEqual(Object.keys(totais).sort(), ['previsto', 'realizado']);
  assert.equal(totais.realizado.resultado, 70000);
  assert.equal(totais.previsto.despesas, 7000);
  assert.deepEqual(totaisDaListagem([]).realizado, { receitas: 0, despesas: 0, resultado: 0 });
});

test('RF-02: GET /api/resumo devolve saldos, realizado e previsto em blocos separados', async (t) => {
  const { app, db, fechar } = await appDeTeste();
  t.after(fechar);
  const c = novaConta(db, 'Corrente', 1000);
  novaMov(db, { tipo: 'receita', valor_centavos: 500, conta_id: c.id, data_liquidacao: '2026-06-05' });
  novaMov(db, { tipo: 'despesa', valor_centavos: 200, conta_id: c.id, status: 'pendente', data_vencimento: '2026-06-20' });
  const { cookie } = await entrar(app);
  const res = await app.inject({ method: 'GET', url: '/api/resumo?mes=2026-06', headers: { host: HOST, cookie } });
  assert.equal(res.statusCode, 200);
  const corpo = res.json();
  // `compromissos` aparece porque há uma despesa pendente (e só então); é um bloco à parte, nunca somado ao realizado.
  assert.deepEqual(Object.keys(corpo).sort(), ['compromissos', 'mes', 'periodo', 'previsto', 'realizado', 'saldos']);
  assert.equal(corpo.compromissos.a_pagar.total_centavos, 200);
  assert.equal(corpo.compromissos.a_receber.total_centavos, 0);
  assert.equal(corpo.saldos.total_centavos, 1500);
  assert.equal(corpo.realizado.receitas, 500);
  assert.equal(corpo.previsto.despesas, 200);
  const ruim = await app.inject({ method: 'GET', url: '/api/resumo?mes=2026-13', headers: { host: HOST, cookie } });
  assert.equal(ruim.statusCode, 400);
});
