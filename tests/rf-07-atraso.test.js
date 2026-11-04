import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esquemaMovimentacao } from '../contratos/movimentacoes.js';
import { diasDeAtraso, estaAtrasada, situacaoDoCompromisso, totaisDeCompromissos } from '../servidor/dominio/compromisso.js';
import { listarCompromissos } from '../servidor/banco/repositorios/compromissos.js';
import { bancoComPadroes, novaConta, novaMov } from './ajuda.js';

const pendente = (extra) => ({
  tipo: 'despesa',
  status: 'pendente',
  valor_centavos: 1000,
  data_competencia: '2026-06-01',
  data_vencimento: '2026-06-10',
  ...extra,
});

test('RF-07 atrasada é pendente com vencimento passado', () => {
  assert.equal(estaAtrasada(pendente(), '2026-06-11'), true);
  assert.equal(diasDeAtraso(pendente(), '2026-06-15'), 5);
});

test('RF-07 vencimento hoje ainda não é atraso', () => {
  assert.equal(estaAtrasada(pendente(), '2026-06-10'), false);
  assert.equal(situacaoDoCompromisso(pendente(), '2026-06-10'), 'vence_hoje');
  assert.equal(situacaoDoCompromisso(pendente(), '2026-06-09'), 'a_vencer');
});

test('RF-07 liquidada nunca é atrasada, mesmo com vencimento antigo', () => {
  const paga = pendente({ status: 'liquidada' });
  assert.equal(estaAtrasada(paga, '2027-01-01'), false);
  assert.equal(diasDeAtraso(paga, '2027-01-01'), 0);
  assert.equal(situacaoDoCompromisso(paga, '2027-01-01'), 'liquidada');
});

test('RF-07 sem data de vencimento vale a competência', () => {
  const m = pendente({ data_vencimento: null, data_competencia: '2026-06-05' });
  assert.equal(estaAtrasada(m, '2026-06-06'), true);
});

test('RF-07 transferência e lançamento excluído nunca contam como atrasados', () => {
  assert.equal(estaAtrasada(pendente({ tipo: 'transferencia' }), '2026-07-01'), false);
  assert.equal(estaAtrasada(pendente({ excluida_em: '2026-06-02T00:00:00Z' }), '2026-07-01'), false);
});

test('RF-07 totais separam atrasado, próximos 7 dias e depois, e somam o total pendente', () => {
  const itens = [
    pendente({ valor_centavos: 100, data_vencimento: '2026-06-01' }),
    pendente({ valor_centavos: 200, data_vencimento: '2026-06-15' }),
    pendente({ valor_centavos: 400, data_vencimento: '2026-06-22' }),
    pendente({ valor_centavos: 800, data_vencimento: '2026-06-23' }),
  ];
  assert.deepEqual(totaisDeCompromissos(itens, '2026-06-15'), {
    atrasado_centavos: 100,
    vence_em_breve_centavos: 600,
    depois_centavos: 800,
    total_centavos: 1500,
  });
});

test('RF-07 "atrasada" não é um status que se possa digitar', () => {
  const r = esquemaMovimentacao.safeParse({
    tipo: 'despesa', valor_centavos: 100, conta_id: 1, data_competencia: '2026-06-01', status: 'atrasada',
  });
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.includes('status')));
});

test('RF-07 o atraso muda só com o calendário: nada é gravado e o status segue pendente', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db);
  const m = novaMov(db, {
    conta_id: conta.id, status: 'pendente', descricao: 'Luz', data_competencia: '2026-06-10', data_vencimento: '2026-06-20',
  });
  const filtros = { tipo: 'despesa', pagina: 1, por_pagina: 50 };

  const antes = listarCompromissos(db, filtros, '2026-06-15');
  assert.equal(antes.itens[0].situacao, 'a_vencer');
  assert.equal(antes.totais.atrasado_centavos, 0);

  const depois = listarCompromissos(db, filtros, '2026-06-25');
  assert.equal(depois.itens[0].situacao, 'atrasada');
  assert.equal(depois.itens[0].dias_de_atraso, 5);
  assert.equal(depois.totais.atrasado_centavos, 1000);

  assert.equal(db.prepare('SELECT status FROM movimentacoes WHERE id = ?').get(m.id).status, 'pendente');
  assert.equal(listarCompromissos(db, { ...filtros, situacao: 'atrasada' }, '2026-06-25').total, 1);
  assert.equal(listarCompromissos(db, { ...filtros, situacao: 'atrasada' }, '2026-06-15').total, 0);
});
