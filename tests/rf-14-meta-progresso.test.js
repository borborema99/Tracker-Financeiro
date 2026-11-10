import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mesesRestantes, progressoDaMeta, situacaoDaMeta } from '../servidor/dominio/meta.js';
import { criarMeta, listarMetas, registrarAporte, resumoDeMetas } from '../servidor/banco/repositorios/metas.js';
import { CTX, bancoComPadroes } from './ajuda.js';

const HOJE = '2026-11-05';
const meta = (extra = {}) => ({ valor_alvo_centavos: 100000, prazo: null, ...extra });
const aportes = (...valores) => valores.map((v) => ({ tipo: 'aporte', valor_centavos: v }));

test('RF-14: meses restantes contam o mês de hoje e o do prazo', () => {
  assert.equal(mesesRestantes(HOJE, '2026-11-30'), 1);
  assert.equal(mesesRestantes(HOJE, '2026-12-15'), 2);
  assert.equal(mesesRestantes(HOJE, '2027-11-05'), 13, 'atravessa o ano');
  assert.equal(mesesRestantes(HOJE, '2026-11-05'), 1, 'prazo hoje ainda conta o mês');
  assert.equal(mesesRestantes(HOJE, '2026-11-04'), 0, 'prazo vencido');
  assert.equal(mesesRestantes(HOJE, null), 0, 'sem prazo');
});

test('RF-14: a situação é calculada: concluída, atrasada ou em andamento', () => {
  assert.equal(situacaoDaMeta(meta(), 99999, HOJE), 'em_andamento');
  assert.equal(situacaoDaMeta(meta(), 100000, HOJE), 'concluida');
  assert.equal(situacaoDaMeta(meta(), 150000, HOJE), 'concluida', 'passar do alvo também conclui');
  assert.equal(situacaoDaMeta(meta({ prazo: '2026-11-04' }), 50000, HOJE), 'atrasada');
  assert.equal(situacaoDaMeta(meta({ prazo: '2026-11-05' }), 50000, HOJE), 'em_andamento', 'prazo hoje não é atraso');
  assert.equal(situacaoDaMeta(meta({ prazo: '2026-11-04' }), 100000, HOJE), 'concluida', 'concluída nunca é atrasada');
});

test('RF-14: o valor necessário por mês é o que falta dividido pelos meses restantes, arredondado para cima', () => {
  // Falta 70.000 em 3 meses (nov, dez, jan) = 23.333,33 -> 23.334: três parcelas nunca ficam abaixo do que falta.
  const p = progressoDaMeta(meta({ prazo: '2027-01-20' }), aportes(30000), HOJE);
  assert.equal(p.falta_centavos, 70000);
  assert.equal(p.meses_restantes, 3);
  assert.equal(p.necessario_por_mes_centavos, 23334);
  assert.ok(p.necessario_por_mes_centavos * p.meses_restantes >= p.falta_centavos);
});

test('RF-14: sem prazo, com prazo vencido ou concluída não há valor por mês (nada de número inventado)', () => {
  const semPrazo = progressoDaMeta(meta(), aportes(10000), HOJE);
  assert.equal(semPrazo.necessario_por_mes_centavos, null);
  assert.equal(semPrazo.meses_restantes, null);
  assert.equal(semPrazo.situacao, 'em_andamento');

  const vencida = progressoDaMeta(meta({ prazo: '2026-10-31' }), aportes(10000), HOJE);
  assert.equal(vencida.situacao, 'atrasada');
  assert.equal(vencida.necessario_por_mes_centavos, null);
  assert.equal(vencida.falta_centavos, 90000, 'a meta atrasada continua mostrando quanto falta');

  const pronta = progressoDaMeta(meta({ prazo: '2027-01-20' }), aportes(100000), HOJE);
  assert.equal(pronta.situacao, 'concluida');
  assert.equal(pronta.falta_centavos, 0);
  assert.equal(pronta.necessario_por_mes_centavos, null);
});

test('RF-14: o percentual é calculado em centavos e pode passar de 100 quando se guarda além do alvo', () => {
  assert.equal(progressoDaMeta(meta(), aportes(33333), HOJE).percentual, 33);
  assert.equal(progressoDaMeta(meta(), aportes(150000), HOJE).percentual, 150);
  assert.equal(progressoDaMeta(meta(), [], HOJE).percentual, 0);
});

test('RF-14: a lista põe atrasadas e em andamento antes das concluídas, e o resumo só conta as abertas', async () => {
  const db = await bancoComPadroes();
  const nova = async (nome, alvo, prazo) => await criarMeta(db, { nome, valor_alvo_centavos: alvo, prazo, observacao: '' }, CTX);
  const pronta = await nova('Concluída', 1000, null);
  await registrarAporte(db, pronta.id, { tipo: 'aporte', valor_centavos: 1000, data: '2026-06-01', observacao: '' }, CTX);
  await nova('Viagem', 500000, '2026-12-31');
  await nova('Atrasada', 200000, '2026-05-31');
  await nova('Sem prazo', 300000, null);

  assert.deepEqual((await listarMetas(db, CTX.hoje)).map((m) => m.nome), ['Atrasada', 'Viagem', 'Sem prazo', 'Concluída']);
  const resumo = await resumoDeMetas(db, CTX.hoje);
  assert.equal(resumo.abertas, 3);
  assert.equal(resumo.atrasadas, 1);
  assert.equal(resumo.alvo_centavos, 1000000);
  assert.equal(resumo.acumulado_centavos, 0);
});
