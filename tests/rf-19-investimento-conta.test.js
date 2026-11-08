import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  criarInvestimento,
  excluirInvestimento,
  excluirOperacao,
  obterInvestimento,
  registrarOperacao,
} from '../servidor/banco/repositorios/investimentos.js';
import { excluirConta } from '../servidor/banco/repositorios/contas.js';
import { movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { resumoDoPeriodo } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, novaConta, saldoDe } from './ajuda.js';

const dados = { nome: 'Tesouro Selic', tipo: 'tesouro', instituicao: '', observacao: '' };
const op = (extra) => ({ tipo: 'aporte', valor_centavos: 100000, data: '2026-06-10', conta_id: null, observacao: '', ...extra });

function cenario() {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 500000);
  const inv = criarInvestimento(db, dados, CTX);
  return { db, conta, inv };
}

test('RF-19: aporte com conta debita a conta e resgate credita, sem virar despesa nem receita', () => {
  const { db, conta, inv } = cenario();
  registrarOperacao(db, inv.id, op({ conta_id: conta.id }), CTX);
  assert.equal(saldoDe(db, conta.id), 400000);
  registrarOperacao(db, inv.id, op({ tipo: 'resgate', valor_centavos: 30000, data: '2026-06-12', conta_id: conta.id }), CTX);
  assert.equal(saldoDe(db, conta.id), 430000);

  const resumo = resumoDoPeriodo(movimentacoesDoPeriodo(db, '2026-06-01', '2026-06-30'), { de: '2026-06-01', ate: '2026-06-30' });
  assert.deepEqual(resumo.realizado, { receitas: 0, despesas: 0, resultado: 0 });
  assert.deepEqual(resumo.previsto, { receitas: 0, despesas: 0 });
});

test('RF-19: operação sem conta só muda o investimento e o saldo das contas fica como está', () => {
  const { db, conta, inv } = cenario();
  const r = registrarOperacao(db, inv.id, op(), CTX);
  assert.equal(saldoDe(db, conta.id), 500000);
  assert.equal(r.valor_atual_centavos, 100000);
});

test('RF-19: resgate maior que o valor atual é recusado e o investimento nunca fica negativo', () => {
  const { db, inv } = cenario();
  registrarOperacao(db, inv.id, op(), CTX);
  assert.throws(
    () => registrarOperacao(db, inv.id, op({ tipo: 'resgate', valor_centavos: 100001, data: '2026-06-11' }), CTX),
    (e) => e.statusCode === 409,
  );
  const r = registrarOperacao(db, inv.id, op({ tipo: 'resgate', valor_centavos: 100000, data: '2026-06-11' }), CTX);
  assert.equal(r.valor_atual_centavos, 0);
  assert.equal(r.encerrado, true);
});

test('RF-19: data futura e conta inexistente são recusadas', () => {
  const { db, inv } = cenario();
  assert.throws(() => registrarOperacao(db, inv.id, op({ data: '2026-06-16' }), CTX), (e) => e.statusCode === 400);
  assert.throws(() => registrarOperacao(db, inv.id, op({ conta_id: 999 }), CTX), (e) => e.statusCode === 400);
});

test('RF-19: remover o aporte devolve o dinheiro à conta; remover o aporte que sustenta um resgate é recusado', () => {
  const { db, conta, inv } = cenario();
  const comAporte = registrarOperacao(db, inv.id, op({ conta_id: conta.id }), CTX);
  const aporte = comAporte.operacoes[0];
  registrarOperacao(db, inv.id, op({ tipo: 'resgate', valor_centavos: 40000, data: '2026-06-11', conta_id: conta.id }), CTX);
  assert.throws(() => excluirOperacao(db, inv.id, aporte.id, CTX), (e) => e.statusCode === 409);

  const resgate = obterInvestimento(db, inv.id).operacoes.find((o) => o.tipo === 'resgate');
  excluirOperacao(db, inv.id, resgate.id, CTX);
  excluirOperacao(db, inv.id, aporte.id, CTX);
  assert.equal(saldoDe(db, conta.id), 500000);
  assert.equal(obterInvestimento(db, inv.id).operacoes.length, 0);
});

test('RF-19 (RF-08): investimento com operações não é excluído, conta com aporte só arquiva, e nada fica órfão', () => {
  const { db, conta, inv } = cenario();
  registrarOperacao(db, inv.id, op({ conta_id: conta.id }), CTX);
  assert.throws(() => excluirInvestimento(db, inv.id, CTX), (e) => e.statusCode === 409);
  assert.throws(() => excluirConta(db, conta.id, CTX), (e) => e.statusCode === 409);
  assert.equal(saldoDe(db, conta.id), 400000);

  const vazio = criarInvestimento(db, { ...dados, nome: 'Sem operações' }, CTX);
  excluirInvestimento(db, vazio.id, CTX);
  assert.equal(obterInvestimento(db, vazio.id), null);
});
