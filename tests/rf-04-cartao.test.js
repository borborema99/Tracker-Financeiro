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
async function realizado(db, de, ate) {
  const movs = [...await movimentacoesDoPeriodo(db, de, ate), ...await movimentosDeCartaoDoPeriodo(db, de, ate)];
  return resumoRealizado(movs, de, ate);
}

const primeiraFatura = async (db, cartao) => (await faturasDoCartao(db, cartao.id, CTX.hoje))[0];
const paga = async (db, fatura, conta, valor) =>
  await pagarFatura(db, fatura.id, { valor_centavos: valor, conta_id: conta.id }, CTX);

test('RF-04: a compra no cartão é despesa uma única vez, na data da compra', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { valor_total_centavos: 120000, parcelas_total: 12, data_compra: '2026-06-05' });

  assert.equal((await realizado(db, '2026-06-01', '2026-06-30')).despesas, 120000);
  assert.equal((await realizado(db, '2026-07-01', '2027-12-31')).despesas, 0, 'as parcelas não viram despesa de novo');
  assert.equal((await realizado(db, '2026-06-01', '2027-12-31')).despesas, 120000);
});

test('RF-04: a compra no cartão não altera o saldo de nenhuma conta', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 100000);
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { valor_total_centavos: 30000 });
  assert.equal(await saldoDe(db, conta.id), 100000);
});

test('RF-04: a compra entra na fatura pelo dia de fechamento', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db); // fecha dia 10
  const noFechamento = await novaCompra(db, cartao, { data_compra: '2026-06-10', descricao: 'No dia do fechamento' });
  const depois = await novaCompra(db, cartao, { data_compra: '2026-06-11', descricao: 'Um dia depois' });
  assert.equal(noFechamento.parcelas[0].referencia, '2026-06');
  assert.equal(depois.parcelas[0].referencia, '2026-07');
  assert.deepEqual(
    (await faturasDoCartao(db, cartao.id, CTX.hoje)).map((f) => [f.referencia, f.total_centavos]).sort(),
    [['2026-06', 10000], ['2026-07', 10000]],
  );
});

test('RF-04: pagar a fatura debita a conta e abate a fatura, sem criar despesa nova', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 100000);
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { valor_total_centavos: 10000 });
  const despesaAntes = (await realizado(db, '2026-06-01', '2026-06-30')).despesas;

  const fatura = await paga(db, await primeiraFatura(db, cartao), conta, 10000);

  assert.equal(await saldoDe(db, conta.id), 90000, 'a conta foi debitada');
  assert.equal(fatura.saldo_centavos, 0);
  assert.equal(fatura.status, 'paga');
  assert.equal((await realizado(db, '2026-06-01', '2026-06-30')).despesas, despesaAntes, 'a despesa continua uma só');
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM movimentacoes', [])).n, 0, 'nenhum lançamento novo');
});

test('RF-04: o pagamento parcial abate só o valor pago e a fatura fica paga em parte', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 100000);
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao);

  const parcial = await paga(db, await primeiraFatura(db, cartao), conta, 4000);
  assert.equal(parcial.status, 'parcial');
  assert.equal(parcial.saldo_centavos, 6000);
  assert.equal(await saldoDe(db, conta.id), 96000);

  const total = await paga(db, parcial, conta, 6000);
  assert.equal(total.status, 'paga');
  assert.equal(await saldoDe(db, conta.id), 90000);
});

test('RF-04: pagamento acima do que falta, em conta inexistente ou com data futura é recusado', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 100000);
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao);
  const fatura = await primeiraFatura(db, cartao);

  const recusa = async (dados, campo) =>
    await assert.rejects(
      async () => await pagarFatura(db, fatura.id, dados, CTX),
      (erro) => erro.statusCode === 400 && campo in erro.campos,
    );
  await recusa({ valor_centavos: 10001, conta_id: conta.id }, 'valor_centavos');
  await recusa({ valor_centavos: 1000, conta_id: 999 }, 'conta_id');
  await recusa({ valor_centavos: 1000, conta_id: conta.id, data_pagamento: '2026-06-16' }, 'data_pagamento');
  assert.equal(await saldoDe(db, conta.id), 100000, 'nada foi debitado');
});

test('RF-04: excluir um pagamento devolve o valor à conta e reabre a fatura', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 100000);
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao);
  const paga10 = await paga(db, await primeiraFatura(db, cartao), conta, 10000);

  const reaberta = await excluirPagamento(db, paga10.pagamentos[0].id, CTX);
  assert.equal(await saldoDe(db, conta.id), 100000);
  assert.equal(reaberta.saldo_centavos, 10000);
  assert.equal(reaberta.status, 'fechada');
});

test('RF-04: o status da fatura segue as datas: aberta, fechada e atrasada (sem nada digitado)', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao); // fatura de junho: fecha 10/06, vence 17/06
  const id = (await primeiraFatura(db, cartao)).id;
  assert.equal((await obterFatura(db, id, '2026-06-08')).status, 'aberta');
  assert.equal((await obterFatura(db, id, '2026-06-15')).status, 'fechada');
  assert.equal((await obterFatura(db, id, '2026-06-18')).status, 'atrasada');
});

test('RF-04: a fatura mostra as linhas que a compõem e os pagamentos feitos', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 100000);
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { descricao: 'Mercado' });
  await paga(db, await primeiraFatura(db, cartao), conta, 2500);
  const fatura = await obterFatura(db, (await primeiraFatura(db, cartao)).id, CTX.hoje);
  assert.equal(fatura.parcelas.length, 1);
  assert.equal(fatura.parcelas[0].descricao, 'Mercado');
  assert.equal(fatura.pagamentos.length, 1);
  assert.equal(fatura.pagamentos[0].valor_centavos, 2500);
  assert.equal(fatura.data_vencimento, '2026-06-17');
});
