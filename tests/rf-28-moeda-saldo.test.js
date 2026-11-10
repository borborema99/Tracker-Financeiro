import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  esquemaContaMoeda,
  esquemaCotacao,
  esquemaOperacaoMoeda,
  formatarTaxa,
  parseTaxa,
} from '../contratos/moedas.js';
import { converterParaBrl, saldoNaMoeda, taxaImplicita } from '../servidor/dominio/moeda.js';
import {
  criarContaMoeda,
  excluirContaMoeda,
  excluirOperacaoMoeda,
  obterContaMoeda,
  registrarOperacaoMoeda,
} from '../servidor/banco/repositorios/moedas.js';
import { CTX, bancoComPadroes } from './ajuda.js';

const conta = { nome: 'Viagem', moeda: 'USD', saldo_inicial_centavos: 0, observacao: '' };
const op = (extra) => ({ tipo: 'deposito', valor_centavos: 10000, data: '2026-06-10', observacao: '', ...extra });

test('RF-28: saldo na moeda = saldo inicial + depósitos e compras − saques e vendas', () => {
  const ops = [
    { tipo: 'deposito', valor_centavos: 10000 },
    { tipo: 'compra', valor_centavos: 5000 },
    { tipo: 'saque', valor_centavos: 3000 },
    { tipo: 'venda', valor_centavos: 1000 },
  ];
  assert.equal(saldoNaMoeda(2000, ops), 13000);
  assert.equal(saldoNaMoeda(0, []), 0);
});

test('RF-28: a conversão para reais usa inteiros, arredonda para o mais próximo e não estoura com valores grandes', () => {
  assert.equal(converterParaBrl(333, 5432100), 1809); // 1808,8893
  assert.equal(converterParaBrl(1, 5500000), 6); // 5,5 arredonda para cima
  assert.equal(converterParaBrl(1, 5490000), 5);
  assert.equal(converterParaBrl(0, 5500000), 0);
  assert.equal(converterParaBrl(1_000_000_000_000, 1_000_000_000), 1_000_000_000_000_000);
  assert.equal(taxaImplicita(10000, 54000), 5400000);
  assert.equal(taxaImplicita(3, 10), 3333333); // 3,333333
});

test('RF-28: cotação digitada vira milionésimos sem float, e volta para texto com 2 a 6 casas', () => {
  assert.equal(parseTaxa('5,43'), 5430000);
  assert.equal(parseTaxa('5.4321'), 5432100);
  assert.equal(parseTaxa('R$ 5,4321'), 5432100);
  assert.equal(parseTaxa('5'), 5000000);
  for (const ruim of ['', 'abc', '0', '0,00', '5,1234567', '1.234,5', '-5', '5,4,3', null]) {
    assert.equal(parseTaxa(ruim), null, String(ruim));
  }
  assert.equal(formatarTaxa(5432100), '5,4321');
  assert.equal(formatarTaxa(5430000), '5,43');
  assert.equal(formatarTaxa(5000000), '5,00');
  assert.equal(formatarTaxa(1), '0,000001');
});

test('RF-28: depósito e saque movem só a conta em moeda, e o saldo nunca fica negativo', async () => {
  const db = await bancoComPadroes();
  const c = await criarContaMoeda(db, { ...conta, saldo_inicial_centavos: 5000 }, CTX);
  assert.equal(c.saldo_centavos, 5000);
  assert.equal((await registrarOperacaoMoeda(db, c.id, op(), CTX)).saldo_centavos, 15000);
  assert.equal((await registrarOperacaoMoeda(db, c.id, op({ tipo: 'saque', valor_centavos: 15000 }), CTX)).saldo_centavos, 0);
  await assert.rejects(
    async () => await registrarOperacaoMoeda(db, c.id, op({ tipo: 'saque', valor_centavos: 1 }), CTX),
    (e) => e.statusCode === 409,
  );
  assert.equal((await obterContaMoeda(db, c.id, CTX.hoje)).saldo_centavos, 0);
});

test('RF-28: conta encerrada é a que teve operações e zerou; remover depósito que sustenta saque é recusado', async () => {
  const db = await bancoComPadroes();
  const c = await criarContaMoeda(db, conta, CTX);
  assert.equal(c.encerrada, false, 'conta nova e vazia não é encerrada');
  const comDeposito = await registrarOperacaoMoeda(db, c.id, op(), CTX);
  const deposito = comDeposito.operacoes[0];
  const zerada = await registrarOperacaoMoeda(db, c.id, op({ tipo: 'saque', data: '2026-06-11' }), CTX);
  assert.equal(zerada.encerrada, true);
  await assert.rejects(async () => await excluirOperacaoMoeda(db, c.id, deposito.id, CTX), (e) => e.statusCode === 409);
  const saque = (await obterContaMoeda(db, c.id, CTX.hoje)).operacoes.find((o) => o.tipo === 'saque');
  await excluirOperacaoMoeda(db, c.id, saque.id, CTX);
  assert.equal((await obterContaMoeda(db, c.id, CTX.hoje)).saldo_centavos, 10000);
});

test('RF-28 (RF-08): conta com operações não é excluída; sem operações, sim, e a data futura é recusada', async () => {
  const db = await bancoComPadroes();
  const c = await criarContaMoeda(db, conta, CTX);
  await assert.rejects(async () => await registrarOperacaoMoeda(db, c.id, op({ data: '2026-06-16' }), CTX), (e) => e.statusCode === 400);
  await registrarOperacaoMoeda(db, c.id, op(), CTX);
  await assert.rejects(async () => await excluirContaMoeda(db, c.id, CTX), (e) => e.statusCode === 409);
  const vazia = await criarContaMoeda(db, { ...conta, nome: 'Sem operações' }, CTX);
  await excluirContaMoeda(db, vazia.id, CTX);
  assert.equal(await obterContaMoeda(db, vazia.id, CTX.hoje), null);
});

test('RF-28: o contrato recusa moeda fora da lista, saldo negativo, valor zero e cotação inválida', () => {
  assert.equal(esquemaContaMoeda.safeParse({ ...conta, moeda: 'BRL' }).success, false);
  assert.equal(esquemaContaMoeda.safeParse({ ...conta, moeda: 'JPY' }).success, false);
  assert.equal(esquemaContaMoeda.safeParse({ ...conta, saldo_inicial_centavos: -1 }).success, false);
  assert.equal(esquemaContaMoeda.safeParse(conta).success, true);
  assert.equal(esquemaOperacaoMoeda.safeParse(op({ valor_centavos: 0 })).success, false);
  assert.equal(esquemaOperacaoMoeda.safeParse(op({ valor_centavos: 10.5 })).success, false);
  assert.equal(esquemaCotacao.safeParse({ moeda: 'USD', data: '2026-06-10', taxa_micros: 0 }).success, false);
  assert.equal(esquemaCotacao.safeParse({ moeda: 'USD', data: '2026-06-10', taxa_micros: 5400000 }).success, true);
});
