import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cotacaoVigente, totaisDeMoedas } from '../servidor/dominio/moeda.js';
import {
  criarContaMoeda,
  excluirCotacao,
  listarCotacoes,
  obterContaMoeda,
  registrarCotacao,
  registrarOperacaoMoeda,
} from '../servidor/banco/repositorios/moedas.js';
import { calcularPatrimonioAtual } from '../servidor/banco/repositorios/patrimonio.js';
import { CTX, HOST, ORIGEM, appDeTeste, bancoComPadroes, entrar, novaConta } from './ajuda.js';

const dolar = { nome: 'Viagem', moeda: 'USD', saldo_inicial_centavos: 0, observacao: '' };
const deposito = { tipo: 'deposito', valor_centavos: 10000, data: '2026-06-10', observacao: '' };
const cot = (extra) => ({ moeda: 'USD', data: '2026-06-10', taxa_micros: 5500000, ...extra });

test('RF-30: vale a cotação mais recente até hoje, da própria moeda; no mesmo dia, a última informada', () => {
  const cotacoes = [
    { id: 1, moeda: 'USD', data: '2026-06-01', taxa_micros: 5000000 },
    { id: 2, moeda: 'USD', data: '2026-06-10', taxa_micros: 5500000 },
    { id: 3, moeda: 'USD', data: '2026-06-10', taxa_micros: 5600000 },
    { id: 4, moeda: 'EUR', data: '2026-06-12', taxa_micros: 6000000 },
    { id: 5, moeda: 'USD', data: '2026-06-20', taxa_micros: 9000000 },
  ];
  assert.equal(cotacaoVigente(cotacoes, 'USD', '2026-06-15').id, 3);
  assert.equal(cotacaoVigente(cotacoes, 'USD', '2026-06-05').id, 1);
  assert.equal(cotacaoVigente(cotacoes, 'EUR', '2026-06-15').id, 4);
  assert.equal(cotacaoVigente(cotacoes, 'GBP', '2026-06-15'), null);
  assert.equal(cotacaoVigente(cotacoes, 'USD', '2026-05-01'), null);
});

test('RF-30: sem cotação não há valor em reais (null, não zero); com cotação o valor é saldo × taxa', async () => {
  const db = await bancoComPadroes();
  const c = await criarContaMoeda(db, dolar, CTX);
  const comSaldo = await registrarOperacaoMoeda(db, c.id, deposito, CTX);
  assert.equal(comSaldo.cotacao, null);
  assert.equal(comSaldo.valor_brl_centavos, null);

  await registrarCotacao(db, cot(), CTX);
  const convertida = await obterContaMoeda(db, c.id, CTX.hoje);
  assert.equal(convertida.valor_brl_centavos, 55000);
  assert.deepEqual(convertida.cotacao, { taxa_micros: 5500000, data: '2026-06-10' });

  await registrarCotacao(db, cot({ data: '2026-06-12', taxa_micros: 5600000 }), CTX);
  assert.equal((await obterContaMoeda(db, c.id, CTX.hoje)).valor_brl_centavos, 56000);
});

test('RF-30: cotação repetida na mesma data e cotação futura são recusadas; excluir volta à anterior', async () => {
  const db = await bancoComPadroes();
  await registrarCotacao(db, cot(), CTX);
  await assert.rejects(async () => await registrarCotacao(db, cot({ taxa_micros: 5700000 }), CTX), (e) => e.statusCode === 409);
  await assert.rejects(async () => await registrarCotacao(db, cot({ data: '2026-06-16' }), CTX), (e) => e.statusCode === 400);
  const depois = await registrarCotacao(db, cot({ data: '2026-06-12', taxa_micros: 5600000 }), CTX);
  assert.equal(depois.length, 2);
  await excluirCotacao(db, depois[0].id, CTX);
  assert.deepEqual((await listarCotacoes(db)).map((c) => c.data), ['2026-06-10']);
  await assert.rejects(async () => await excluirCotacao(db, 9999, CTX), (e) => e.statusCode === 404);
});

test('RF-30: totais somam só o que tem cotação e contam o resto; conta sem saldo não aparece', () => {
  assert.equal(totaisDeMoedas([]), null);
  assert.equal(totaisDeMoedas([{ saldo_centavos: 0, valor_brl_centavos: 0 }]), null);
  assert.deepEqual(
    totaisDeMoedas([
      { saldo_centavos: 100, valor_brl_centavos: 550 },
      { saldo_centavos: 200, valor_brl_centavos: 1000 },
      { saldo_centavos: 300, valor_brl_centavos: null },
      { saldo_centavos: 0, valor_brl_centavos: 0 },
    ]),
    { quantidade: 3, com_cotacao: 2, sem_cotacao: 1, valor_brl_centavos: 1550 },
  );
});

test('RF-30 (RF-21): o patrimônio soma a moeda convertida; sem cotação ela fica de fora com aviso, nunca como zero', async () => {
  const db = await bancoComPadroes();
  await novaConta(db, 'Conta A', 500000);
  assert.equal((await calcularPatrimonioAtual(db, CTX.hoje)).patrimonio.ativos.moedas_centavos, undefined, 'sem módulo, sem parte');

  const c = await criarContaMoeda(db, dolar, CTX);
  await registrarOperacaoMoeda(db, c.id, deposito, CTX);
  const sem = (await calcularPatrimonioAtual(db, CTX.hoje)).patrimonio;
  assert.equal(sem.ativos.moedas_centavos, undefined);
  assert.equal(sem.moedas_sem_cotacao, 1);
  assert.equal(sem.patrimonio_liquido_centavos, 500000);

  await registrarCotacao(db, cot(), CTX);
  const com = (await calcularPatrimonioAtual(db, CTX.hoje)).patrimonio;
  assert.equal(com.ativos.moedas_centavos, 55000);
  assert.equal(com.moedas_sem_cotacao, undefined);
  assert.equal(com.patrimonio_liquido_centavos, 555000);
});

test('API moedas: exigem sessão, e o Início só traz o bloco com saldo, sem somar moeda ao saldo em reais', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  assert.equal((await app.inject({ method: 'GET', url: '/api/moedas', headers: { host: HOST } })).statusCode, 401);
  const { cookie, csrf } = await entrar(app);
  const chamar = (method, url, payload) =>
    app.inject({ method, url, headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf }, payload });
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  assert.equal((await chamar('GET', '/api/resumo')).json().moedas, undefined);

  const criada = await chamar('POST', '/api/moedas/contas', { nome: 'Viagem', moeda: 'USD', saldo_inicial_centavos: 0 });
  assert.equal(criada.statusCode, 201);
  const id = criada.json().id;
  assert.equal((await chamar('POST', '/api/moedas/contas', { nome: 'X', moeda: 'BRL' })).statusCode, 400);
  const dep = await chamar('POST', `/api/moedas/contas/${id}/operacoes`, { tipo: 'deposito', valor_centavos: 10000, data: hoje });
  assert.equal(dep.statusCode, 201);
  assert.equal((await chamar('POST', `/api/moedas/contas/${id}/operacoes`, { tipo: 'compra', valor_centavos: 100, data: hoje })).statusCode, 400);

  let resumo = (await chamar('GET', '/api/resumo')).json();
  assert.deepEqual(resumo.moedas, { quantidade: 1, com_cotacao: 0, sem_cotacao: 1, valor_brl_centavos: 0 });
  assert.equal(resumo.saldos.total_centavos, 0, 'moeda não entra no saldo em reais');

  assert.equal((await chamar('POST', '/api/moedas/cotacoes', { moeda: 'USD', data: hoje, taxa_micros: 5500000 })).statusCode, 201);
  const lista = (await chamar('GET', '/api/moedas')).json();
  assert.equal(lista.itens[0].valor_brl_centavos, 55000);
  assert.deepEqual(lista.totais, { quantidade: 1, com_cotacao: 1, sem_cotacao: 0, valor_brl_centavos: 55000 });
  resumo = (await chamar('GET', '/api/resumo')).json();
  assert.equal(resumo.patrimonio.ativos.moedas_centavos, 55000);
  assert.equal((await chamar('GET', '/api/patrimonio')).json().ativos.moedas_centavos, 55000);
});
