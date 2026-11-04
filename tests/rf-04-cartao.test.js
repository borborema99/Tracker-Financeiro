import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  excluirPagamento,
  faturasDoCartao,
  movimentosDeCartaoDoPeriodo,
  obterFatura,
  pagarFatura,
} from '../servidor/banco/repositorios/cartoes.js';
import { movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, novaCompra, novaConta, novoCartao, saldoDe } from './ajuda.js';

/** Despesas e receitas realizadas no período, somando lançamentos e compras no cartão (como o /api/resumo faz). */
function realizado(db, de, ate) {
  const movs = [...movimentacoesDoPeriodo(db, de, ate), ...movimentosDeCartaoDoPeriodo(db, de, ate)];
  return resumoRealizado(movs, de, ate);
}

const primeiraFatura = (db, cartao) => faturasDoCartao(db, cartao.id, CTX.hoje)[0];
const paga = (db, fatura, conta, valor) =>
  pagarFatura(db, fatura.id, { valor_centavos: valor, conta_id: conta.id }, CTX);

test('RF-04: a compra no cartão é despesa uma única vez, na data da compra', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  novaCompra(db, cartao, { valor_total_centavos: 120000, parcelas_total: 12, data_compra: '2026-06-05' });

  assert.equal(realizado(db, '2026-06-01', '2026-06-30').despesas, 120000);
  assert.equal(realizado(db, '2026-07-01', '2027-12-31').despesas, 0, 'as parcelas não viram despesa de novo');
  assert.equal(realizado(db, '2026-06-01', '2027-12-31').despesas, 120000);
});

test('RF-04: a compra no cartão não altera o saldo de nenhuma conta', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const cartao = novoCartao(db);
  novaCompra(db, cartao, { valor_total_centavos: 30000 });
  assert.equal(saldoDe(db, conta.id), 100000);
});

test('RF-04: a compra entra na fatura pelo dia de fechamento', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db); // fecha dia 10
  const noFechamento = novaCompra(db, cartao, { data_compra: '2026-06-10', descricao: 'No dia do fechamento' });
  const depois = novaCompra(db, cartao, { data_compra: '2026-06-11', descricao: 'Um dia depois' });
  assert.equal(noFechamento.parcelas[0].referencia, '2026-06');
  assert.equal(depois.parcelas[0].referencia, '2026-07');
  assert.deepEqual(
    faturasDoCartao(db, cartao.id, CTX.hoje).map((f) => [f.referencia, f.total_centavos]).sort(),
    [['2026-06', 10000], ['2026-07', 10000]],
  );
});

test('RF-04: pagar a fatura debita a conta e abate a fatura, sem criar despesa nova', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const cartao = novoCartao(db);
  novaCompra(db, cartao, { valor_total_centavos: 10000 });
  const despesaAntes = realizado(db, '2026-06-01', '2026-06-30').despesas;

  const fatura = paga(db, primeiraFatura(db, cartao), conta, 10000);

  assert.equal(saldoDe(db, conta.id), 90000, 'a conta foi debitada');
  assert.equal(fatura.saldo_centavos, 0);
  assert.equal(fatura.status, 'paga');
  assert.equal(realizado(db, '2026-06-01', '2026-06-30').despesas, despesaAntes, 'a despesa continua uma só');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimentacoes').get().n, 0, 'nenhum lançamento novo');
});

test('RF-04: o pagamento parcial abate só o valor pago e a fatura fica paga em parte', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const cartao = novoCartao(db);
  novaCompra(db, cartao);

  const parcial = paga(db, primeiraFatura(db, cartao), conta, 4000);
  assert.equal(parcial.status, 'parcial');
  assert.equal(parcial.saldo_centavos, 6000);
  assert.equal(saldoDe(db, conta.id), 96000);

  const total = paga(db, parcial, conta, 6000);
  assert.equal(total.status, 'paga');
  assert.equal(saldoDe(db, conta.id), 90000);
});

test('RF-04: pagamento acima do que falta, em conta inexistente ou com data futura é recusado', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const cartao = novoCartao(db);
  novaCompra(db, cartao);
  const fatura = primeiraFatura(db, cartao);

  const recusa = (dados, campo) =>
    assert.throws(
      () => pagarFatura(db, fatura.id, dados, CTX),
      (erro) => erro.statusCode === 400 && campo in erro.campos,
    );
  recusa({ valor_centavos: 10001, conta_id: conta.id }, 'valor_centavos');
  recusa({ valor_centavos: 1000, conta_id: 999 }, 'conta_id');
  recusa({ valor_centavos: 1000, conta_id: conta.id, data_pagamento: '2026-06-16' }, 'data_pagamento');
  assert.equal(saldoDe(db, conta.id), 100000, 'nada foi debitado');
});

test('RF-04: excluir um pagamento devolve o valor à conta e reabre a fatura', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const cartao = novoCartao(db);
  novaCompra(db, cartao);
  const paga10 = paga(db, primeiraFatura(db, cartao), conta, 10000);

  const reaberta = excluirPagamento(db, paga10.pagamentos[0].id, CTX);
  assert.equal(saldoDe(db, conta.id), 100000);
  assert.equal(reaberta.saldo_centavos, 10000);
  assert.equal(reaberta.status, 'fechada');
});

test('RF-04: o status da fatura segue as datas: aberta, fechada e atrasada (sem nada digitado)', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  novaCompra(db, cartao); // fatura de junho: fecha 10/06, vence 17/06
  const id = primeiraFatura(db, cartao).id;
  assert.equal(obterFatura(db, id, '2026-06-08').status, 'aberta');
  assert.equal(obterFatura(db, id, '2026-06-15').status, 'fechada');
  assert.equal(obterFatura(db, id, '2026-06-18').status, 'atrasada');
});

test('RF-04: a fatura mostra as linhas que a compõem e os pagamentos feitos', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const cartao = novoCartao(db);
  novaCompra(db, cartao, { descricao: 'Mercado' });
  paga(db, primeiraFatura(db, cartao), conta, 2500);
  const fatura = obterFatura(db, primeiraFatura(db, cartao).id, CTX.hoje);
  assert.equal(fatura.parcelas.length, 1);
  assert.equal(fatura.parcelas[0].descricao, 'Mercado');
  assert.equal(fatura.pagamentos.length, 1);
  assert.equal(fatura.pagamentos[0].valor_centavos, 2500);
  assert.equal(fatura.data_vencimento, '2026-06-17');
});
