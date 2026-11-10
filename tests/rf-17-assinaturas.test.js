import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarAssinaturas, resumoDeAssinaturas } from '../servidor/banco/repositorios/assinaturas.js';
import { atualizarRecorrencia, criarRecorrencia } from '../servidor/banco/repositorios/recorrencias.js';
import { custoAnualCentavos, custoMensalEquivalenteCentavos, totaisDeAssinaturas } from '../servidor/dominio/assinatura.js';
import { CTX, bancoComPadroes, novaConta } from './ajuda.js';

const recorrencia = (conta, extra = {}) => ({
  tipo: 'despesa',
  descricao: 'Streaming',
  valor_centavos: 3990,
  conta_id: conta.id,
  categoria_id: null,
  frequencia: 'mensal',
  data_inicio: '2026-06-20',
  data_fim: null,
  ativa: true,
  assinatura: true,
  observacao: '',
  ...extra,
});

test('RF-17: o custo anual vem das cobranças por ano e o mensal é o anual dividido por 12', async () => {
  assert.equal(custoAnualCentavos(3990, 'mensal'), 47880);
  assert.equal(custoAnualCentavos(12000, 'anual'), 12000);
  assert.equal(custoAnualCentavos(1000, 'semanal'), 52000);
  assert.equal(custoAnualCentavos(1000, 'quinzenal'), 26000);
  assert.equal(custoMensalEquivalenteCentavos(3990, 'mensal'), 3990);
  assert.equal(custoMensalEquivalenteCentavos(12000, 'anual'), 1000);
  assert.equal(custoMensalEquivalenteCentavos(1000, 'semanal'), 4333, '52000 ÷ 12 = 4333,33 -> 4333');
  assert.equal(custoMensalEquivalenteCentavos(1000, 'quinzenal'), 2167, '26000 ÷ 12 = 2166,67 -> 2167');
  await assert.rejects(async () => custoAnualCentavos(1, 'diaria'), RangeError);
});

test('RF-17: o total mensal sai da soma dos custos anuais, sem acumular erro de arredondamento', () => {
  const tres = Array.from({ length: 3 }, () => ({ ativa: true, valor_centavos: 1000, frequencia: 'semanal' }));
  const t = totaisDeAssinaturas(tres);
  assert.equal(t.anual_centavos, 156000);
  assert.equal(t.mensal_centavos, 13000, 'somar três mensais arredondados daria 12.999');
  assert.equal(3 * custoMensalEquivalenteCentavos(1000, 'semanal'), 12999);
});

test('RF-17 e RF-18: assinatura pausada não entra nos totais', () => {
  const t = totaisDeAssinaturas([
    { ativa: true, valor_centavos: 3990, frequencia: 'mensal' },
    { ativa: false, valor_centavos: 99900, frequencia: 'mensal' },
  ]);
  assert.deepEqual(t, { ativas: 1, pausadas: 1, anual_centavos: 47880, mensal_centavos: 3990 });
});

test('RF-17: só recorrência marcada como assinatura aparece na lista, com custo calculado e próxima cobrança', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  await criarRecorrencia(db, recorrencia(conta), CTX);
  await criarRecorrencia(db, recorrencia(conta, { descricao: 'Aluguel', valor_centavos: 180000, assinatura: false }), CTX);
  await criarRecorrencia(db, recorrencia(conta, { descricao: 'Seguro', valor_centavos: 120000, frequencia: 'anual', data_inicio: '2026-09-01' }), CTX);

  const { itens, totais } = await listarAssinaturas(db);
  assert.deepEqual(itens.map((i) => i.descricao), ['Streaming', 'Seguro'], 'ordem pela próxima cobrança; aluguel fica de fora');
  assert.equal(itens[0].custo_mensal_centavos, 3990);
  assert.equal(itens[0].custo_anual_centavos, 47880);
  assert.equal(itens[0].proximo_vencimento, '2026-06-20');
  assert.equal(itens[1].custo_mensal_centavos, 10000);
  assert.deepEqual(totais, { ativas: 2, pausadas: 0, anual_centavos: 167880, mensal_centavos: 13990 });
});

test('RF-17 e RF-10: sem assinatura ativa não há bloco de assinaturas', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  assert.equal(await resumoDeAssinaturas(db), null);
  const r = await criarRecorrencia(db, recorrencia(conta), CTX);
  assert.equal((await resumoDeAssinaturas(db)).mensal_centavos, 3990);
  await atualizarRecorrencia(db, r.id, recorrencia(conta, { ativa: false }), CTX);
  assert.equal(await resumoDeAssinaturas(db), null, 'pausada não conta');
  assert.equal((await listarAssinaturas(db)).itens.length, 1, 'mas continua na lista para ser reativada');
});
