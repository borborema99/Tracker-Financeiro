import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  criarInvestimento,
  excluirAvaliacao,
  obterInvestimento,
  registrarAvaliacao,
  registrarOperacao,
  resumoDeInvestimentos,
} from '../servidor/banco/repositorios/investimentos.js';
import { situacaoDoInvestimento, totaisDaCarteira, valorAtual } from '../servidor/dominio/investimento.js';
import { CTX, bancoComPadroes } from './ajuda.js';

const dados = { nome: 'Carteira de ações', tipo: 'acoes', instituicao: '', observacao: '' };
const op = (tipo, valor, data) => ({ tipo, valor_centavos: valor, data, observacao: '' });
const aval = (valor, data) => ({ valor_centavos: valor, data });

test('RF-20: sem avaliação o valor é o custo e não existe resultado nem rentabilidade (nada de zero falso)', () => {
  const s = situacaoDoInvestimento([op('aporte', 100000, '2026-05-01')], []);
  assert.equal(s.valor_atual_centavos, 100000);
  assert.equal(s.avaliado, false);
  assert.equal(s.resultado_centavos, null);
  assert.equal(s.rentabilidade_percentual, null);
});

test('RF-20: valor atual = última avaliação + aportes − resgates depois dela', () => {
  const ops = [op('aporte', 100000, '2026-05-01'), op('aporte', 50000, '2026-06-05'), op('resgate', 20000, '2026-06-08')];
  const v = valorAtual(ops, [aval(110000, '2026-06-01'), aval(90000, '2026-04-01')]);
  assert.deepEqual(v, { valor_centavos: 140000, avaliado: true, avaliado_em: '2026-06-01' });
});

test('RF-20: resultado = valor atual + resgatado − aportado e rentabilidade em % sobre o aportado', () => {
  const ops = [op('aporte', 100000, '2026-05-01'), op('resgate', 30000, '2026-05-20')];
  const s = situacaoDoInvestimento(ops, [aval(85000, '2026-06-01')]);
  assert.equal(s.resultado_centavos, 15000);
  assert.equal(s.rentabilidade_percentual, 15);
  const perda = situacaoDoInvestimento([op('aporte', 100000, '2026-05-01')], [aval(87550, '2026-06-01')]);
  assert.equal(perda.resultado_centavos, -12450);
  assert.equal(perda.rentabilidade_percentual, -12.45);
});

test('RF-20: o total da carteira só soma resultado dos avaliados, sem misturar custo com valor de mercado', () => {
  const a = { ...situacaoDoInvestimento([op('aporte', 100000, '2026-05-01')], [aval(110000, '2026-06-01')]) };
  const b = { ...situacaoDoInvestimento([op('aporte', 40000, '2026-05-01')], []) };
  const t = totaisDaCarteira([a, b]);
  assert.equal(t.valor_atual_centavos, 150000);
  assert.equal(t.resultado_centavos, 10000);
  assert.equal(t.sem_avaliacao, 1);
  assert.equal(totaisDaCarteira([b]).resultado_centavos, null);
});

test('RF-20: avaliação por data, sem data futura; operação não pode ser anterior à última avaliação', async () => {
  const db = await bancoComPadroes();
  const inv = await criarInvestimento(db, dados, CTX);
  await registrarOperacao(db, inv.id, op('aporte', 100000, '2026-06-01'), CTX);
  const r = await registrarAvaliacao(db, inv.id, aval(120000, '2026-06-10'), CTX);
  assert.equal(r.valor_atual_centavos, 120000);
  assert.equal(r.resultado_centavos, 20000);

  await assert.rejects(async () => await registrarAvaliacao(db, inv.id, aval(1, '2026-06-10'), CTX), (e) => e.statusCode === 409);
  await assert.rejects(async () => await registrarAvaliacao(db, inv.id, aval(1, '2026-06-16'), CTX), (e) => e.statusCode === 400);
  await assert.rejects(async () => await registrarOperacao(db, inv.id, op('aporte', 1000, '2026-06-09'), CTX), (e) => e.statusCode === 409);

  const depois = await registrarOperacao(db, inv.id, op('aporte', 10000, '2026-06-12'), CTX);
  assert.equal(depois.valor_atual_centavos, 130000);
});

test('RF-20: excluir a avaliação volta ao custo e o resultado some; o resumo só existe com investimento em aberto', async () => {
  const db = await bancoComPadroes();
  assert.equal(await resumoDeInvestimentos(db), null);
  const inv = await criarInvestimento(db, dados, CTX);
  assert.equal(await resumoDeInvestimentos(db), null);
  await registrarOperacao(db, inv.id, op('aporte', 100000, '2026-06-01'), CTX);
  const comAval = await registrarAvaliacao(db, inv.id, aval(120000, '2026-06-10'), CTX);
  assert.equal((await resumoDeInvestimentos(db)).valor_atual_centavos, 120000);

  await excluirAvaliacao(db, inv.id, comAval.avaliacoes[0].id, CTX);
  const s = await obterInvestimento(db, inv.id);
  assert.equal(s.valor_atual_centavos, 100000);
  assert.equal(s.resultado_centavos, null);
});
