import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarCompromissos } from '../servidor/banco/repositorios/compromissos.js';
import { criarDivida, excluirDivida, listarDividas, obterDivida, resumoDeDividas } from '../servidor/banco/repositorios/dividas.js';
import { alertasDoApp, projecaoDeSaldo } from '../servidor/banco/repositorios/fluxo.js';
import { listarMovimentacoes, liquidarMovimentacao } from '../servidor/banco/repositorios/movimentacoes.js';
import { definirLimite, orcamentoDoMes } from '../servidor/banco/repositorios/orcamentos.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaConta, saldoDe } from './ajuda.js';

const dados = (conta, extra = {}) => ({
  nome: 'Empréstimo',
  credor: '',
  valor_total_centavos: 90000,
  parcelas_total: 3,
  primeiro_vencimento: '2026-05-10',
  conta_id: conta.id,
  categoria_id: null,
  observacao: '',
  ...extra,
});
const todos = { tipo: 'despesa', pagina: 1, por_pagina: 100 };

test('RF-16 e RF-07: parcela vencida é atrasada (calculada) nos compromissos, na dívida e nos alertas', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 500000);
  const d = criarDivida(db, dados(conta), CTX); // 10/05, 10/06 e 10/07 com hoje = 15/06

  const compromissos = listarCompromissos(db, todos, CTX.hoje);
  assert.deepEqual(compromissos.itens.map((i) => i.situacao), ['atrasada', 'atrasada', 'a_vencer']);
  assert.equal(compromissos.totais.atrasado_centavos, 60000);
  const atual = obterDivida(db, d.id, CTX.hoje);
  assert.equal(atual.situacao, 'atrasada');
  assert.equal(atual.parcelas_atrasadas, 2);
  assert.equal(atual.atrasado_centavos, 60000);

  assert.ok(alertasDoApp(db, CTX.hoje).alertas.some((a) => a.codigo === 'atraso_pagar'));

  liquidarMovimentacao(db, atual.parcelas[0].lancamento_id, '2026-06-15', CTX);
  liquidarMovimentacao(db, atual.parcelas[1].lancamento_id, '2026-06-15', CTX);
  assert.equal(obterDivida(db, d.id, CTX.hoje).situacao, 'em_dia', 'pagar as vencidas tira o atraso');
});

test('RF-16: as parcelas em aberto entram na projeção de saldo no vencimento de cada uma', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 500000);
  criarDivida(db, dados(conta, { primeiro_vencimento: '2026-07-10' }), CTX);

  const p = projecaoDeSaldo(db, CTX.hoje, 90);
  assert.equal(p.saldo_final_centavos, 500000 - 90000);
  const em = (data) => p.serie.find((s) => s.data === data).saldo_centavos;
  assert.equal(em('2026-07-09'), 500000);
  assert.equal(em('2026-07-10'), 470000);
  assert.equal(em('2026-09-10'), 410000);
});

test('RF-16: a parcela paga sai do saldo e conta como gasto da categoria no orçamento; a pendente é só previsto', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 500000);
  const impostos = categoriaPorNome(db, 'Impostos e taxas');
  definirLimite(db, impostos.id, { mes_inicio: '2026-06', limite_centavos: 100000 }, CTX);
  const d = criarDivida(db, dados(conta, { categoria_id: impostos.id }), CTX);

  const [, junho] = d.parcelas;
  liquidarMovimentacao(db, junho.lancamento_id, '2026-06-12', CTX);
  assert.equal(saldoDe(db, conta.id), 470000);
  const item = orcamentoDoMes(db, '2026-06').itens[0];
  assert.equal(item.realizado_centavos, 30000);
  assert.equal(item.previsto_centavos, 0, 'as parcelas pendentes vencem em maio e julho, fora de junho');
});

test('RF-16 e RF-08: excluir a dívida tira as parcelas pendentes, preserva as pagas e não deixa órfãs', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 500000);
  const d = criarDivida(db, dados(conta), CTX);
  liquidarMovimentacao(db, d.parcelas[0].lancamento_id, '2026-06-01', CTX);

  excluirDivida(db, d.id, CTX);

  assert.equal(listarDividas(db, CTX.hoje).length, 0);
  assert.equal(obterDivida(db, d.id, CTX.hoje), null);
  assert.equal(resumoDeDividas(db, CTX.hoje), null, 'RF-10: sem dívida em aberto não há bloco');
  assert.equal(listarCompromissos(db, todos, CTX.hoje).itens.length, 0, 'nenhuma parcela pendente sobra');
  const restam = listarMovimentacoes(
    db,
    { pagina: 1, por_pagina: 50, ordenar: 'data', direcao: 'desc', campo_data: 'competencia' },
    CTX.hoje,
  ).itens;
  assert.deepEqual(restam.map((m) => m.status), ['liquidada']);
  assert.equal(saldoDe(db, conta.id), 470000, 'o que já foi pago continua debitado');
  const acoes = db.prepare("SELECT acao FROM audit_log WHERE entidade = 'divida' ORDER BY id").all().map((l) => l.acao);
  assert.deepEqual(acoes, ['criar', 'excluir']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'movimentacao' AND acao = 'excluir'").get().n, 2);
});

test('RF-16: o resumo do início soma só as dívidas com parcela em aberto', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db);
  assert.equal(resumoDeDividas(db, CTX.hoje), null);
  criarDivida(db, dados(conta, { nome: 'A' }), CTX);
  const b = criarDivida(db, dados(conta, { nome: 'B', parcelas_total: 1, valor_total_centavos: 500, primeiro_vencimento: '2026-07-01' }), CTX);
  liquidarMovimentacao(db, b.parcelas[0].lancamento_id, '2026-06-15', CTX);
  const r = resumoDeDividas(db, CTX.hoje);
  assert.equal(r.abertas, 1);
  assert.equal(r.atrasadas, 1);
  assert.equal(r.restante_centavos, 90000);
  assert.equal(r.atrasado_centavos, 60000);
});
