import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  atualizarMovimentacao,
  liquidarMovimentacao,
  reabrirMovimentacao,
} from '../servidor/banco/repositorios/movimentacoes.js';
import { calcularSaldos, efeitoNaConta } from '../servidor/dominio/saldo.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, novaConta, novaMov, saldoDe } from './ajuda.js';

test('RF-01: saldo da conta = saldo inicial + movimentações liquidadas', () => {
  const db = bancoComPadroes();
  const c = novaConta(db, 'Corrente', 100000);
  novaMov(db, { tipo: 'receita', valor_centavos: 50000, conta_id: c.id });
  novaMov(db, { tipo: 'despesa', valor_centavos: 12345, conta_id: c.id });
  assert.equal(saldoDe(db, c.id), 100000 + 50000 - 12345);
});

test('RF-01: movimentação prevista (pendente) não altera o saldo', () => {
  const db = bancoComPadroes();
  const c = novaConta(db, 'Corrente', 100000);
  novaMov(db, { tipo: 'despesa', valor_centavos: 30000, conta_id: c.id, status: 'pendente', data_vencimento: '2026-06-30' });
  novaMov(db, { tipo: 'receita', valor_centavos: 70000, conta_id: c.id, status: 'pendente' });
  assert.equal(saldoDe(db, c.id), 100000);
});

test('RF-01: liquidar altera o saldo e reabrir desfaz', () => {
  const db = bancoComPadroes();
  const c = novaConta(db, 'Corrente', 0);
  const m = novaMov(db, { tipo: 'receita', valor_centavos: 20000, conta_id: c.id, status: 'pendente' });
  assert.equal(saldoDe(db, c.id), 0);
  const liquidada = liquidarMovimentacao(db, m.id, '2026-06-12', CTX);
  assert.equal(liquidada.status, 'liquidada');
  assert.equal(liquidada.data_liquidacao, '2026-06-12');
  assert.equal(saldoDe(db, c.id), 20000);
  const reaberta = reabrirMovimentacao(db, m.id, CTX);
  assert.equal(reaberta.data_liquidacao, null);
  assert.equal(saldoDe(db, c.id), 0);
});

test('RF-01: liquidar sem data usa "hoje" do fuso configurado', () => {
  const db = bancoComPadroes();
  const c = novaConta(db);
  const m = novaMov(db, { conta_id: c.id, status: 'pendente' });
  assert.equal(liquidarMovimentacao(db, m.id, undefined, CTX).data_liquidacao, CTX.hoje);
});

test('RF-01: só liquidada conta como receita ou despesa realizada', () => {
  const movs = [
    { tipo: 'receita', valor_centavos: 1000, status: 'liquidada', data_liquidacao: '2026-06-05' },
    { tipo: 'despesa', valor_centavos: 400, status: 'liquidada', data_liquidacao: '2026-06-06' },
    { tipo: 'despesa', valor_centavos: 9999, status: 'pendente', data_liquidacao: null, data_vencimento: '2026-06-07' },
  ];
  assert.deepEqual(resumoRealizado(movs, '2026-06-01', '2026-06-30'), { receitas: 1000, despesas: 400, resultado: 600 });
});

test('RF-01: o realizado usa a data de liquidação, não a de competência', () => {
  const movs = [
    { tipo: 'despesa', valor_centavos: 500, status: 'liquidada', data_competencia: '2026-05-28', data_liquidacao: '2026-06-02' },
  ];
  assert.equal(resumoRealizado(movs, '2026-05-01', '2026-05-31').despesas, 0);
  assert.equal(resumoRealizado(movs, '2026-06-01', '2026-06-30').despesas, 500);
});

test('RF-01: efeito de movimentação excluída ou pendente é zero (função pura)', () => {
  const base = { tipo: 'receita', conta_id: 1, valor_centavos: 100 };
  assert.equal(efeitoNaConta({ ...base, status: 'liquidada' }, 1), 100);
  assert.equal(efeitoNaConta({ ...base, status: 'pendente' }, 1), 0);
  assert.equal(efeitoNaConta({ ...base, status: 'liquidada', excluida_em: '2026-01-01' }, 1), 0);
  assert.equal(efeitoNaConta({ ...base, status: 'liquidada' }, 2), 0);
});

test('RF-01: saldo inicial negativo e saldos por conta independentes', () => {
  const contas = [
    { id: 1, saldo_inicial_centavos: -5000 },
    { id: 2, saldo_inicial_centavos: 0 },
  ];
  const saldos = calcularSaldos(contas, [
    { tipo: 'receita', conta_id: 1, valor_centavos: 3000, status: 'liquidada' },
    { tipo: 'despesa', conta_id: 2, valor_centavos: 100, status: 'liquidada' },
  ]);
  assert.deepEqual(saldos, { 1: -2000, 2: -100 });
});

test('RF-01: editar uma pendente para liquidada passa a contar no saldo', () => {
  const db = bancoComPadroes();
  const c = novaConta(db);
  const m = novaMov(db, { tipo: 'receita', valor_centavos: 5000, conta_id: c.id, status: 'pendente' });
  atualizarMovimentacao(db, m.id, { ...m, status: 'liquidada', data_liquidacao: '2026-06-14', divisoes: [] }, CTX);
  assert.equal(saldoDe(db, c.id), 5000);
});
