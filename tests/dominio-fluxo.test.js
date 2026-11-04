import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarAlertas } from '../servidor/dominio/alertas.js';
import {
  chaveDoPeriodo,
  fluxoRealizado,
  inicioDaSemana,
  montarCalendario,
  periodosNegativos,
  projetarSaldo,
} from '../servidor/dominio/fluxo.js';
import { dataDaOcorrencia, ocorrenciasDaRecorrencia } from '../servidor/dominio/recorrencia.js';

const ev = (data, tipo, valor_centavos) => ({ data, tipo, valor_centavos });

test('fluxo: agrupa por dia, semana (segunda), mês e ano', () => {
  assert.equal(inicioDaSemana('2026-06-14'), '2026-06-08'); // domingo -> segunda anterior
  assert.equal(inicioDaSemana('2026-06-15'), '2026-06-15');
  assert.equal(chaveDoPeriodo('2026-06-17', 'semana'), '2026-06-15');
  assert.equal(chaveDoPeriodo('2026-06-17', 'mes'), '2026-06');
  assert.equal(chaveDoPeriodo('2026-06-17', 'ano'), '2026');

  const eventos = [ev('2026-05-31', 'entrada', 500), ev('2026-06-01', 'entrada', 1000), ev('2026-06-02', 'saida', 300), ev('2026-07-01', 'saida', 50)];
  const meses = fluxoRealizado(eventos, { de: '2026-06-01', ate: '2026-06-30', agrupar: 'mes' });
  assert.deepEqual(meses, [{ periodo: '2026-06', entradas_centavos: 1000, saidas_centavos: 300, resultado_centavos: 700 }]);
  assert.equal(fluxoRealizado(eventos, { de: '2026-05-01', ate: '2026-07-31', agrupar: 'ano' })[0].resultado_centavos, 1150);
  assert.equal(fluxoRealizado(eventos, { de: '2026-06-01', ate: '2026-06-30', agrupar: 'dia' }).length, 2);
});

test('projeção: parte do saldo atual e aplica o previsto no dia do vencimento', () => {
  const p = projetarSaldo({
    saldo_inicial_centavos: 1000,
    hoje: '2026-06-15',
    dias: 7,
    eventos: [ev('2026-06-16', 'saida', 400), ev('2026-06-18', 'entrada', 900), ev('2026-06-30', 'saida', 5000)],
  });
  assert.equal(p.serie.length, 8);
  assert.equal(p.serie[0].saldo_centavos, 1000);
  assert.equal(p.serie[1].saldo_centavos, 600);
  assert.equal(p.serie[3].saldo_centavos, 1500);
  assert.equal(p.saldo_final_centavos, 1500); // evento depois do horizonte fica de fora
  assert.deepEqual(p.periodos_negativos, []);
  assert.deepEqual(p.saldo_minimo, { data: '2026-06-16', centavos: 600 });
});

test('projeção: o que já venceu e não foi baixado pesa em hoje', () => {
  const p = projetarSaldo({
    saldo_inicial_centavos: 1000,
    hoje: '2026-06-15',
    dias: 3,
    eventos: [ev('2026-06-01', 'saida', 700)],
  });
  assert.equal(p.serie[0].saldo_centavos, 300);
  assert.equal(p.atrasados.saidas_centavos, 700);
});

test('projeção: detecta os períodos de saldo negativo e o mínimo', () => {
  const p = projetarSaldo({
    saldo_inicial_centavos: 500,
    hoje: '2026-06-15',
    dias: 10,
    eventos: [ev('2026-06-17', 'saida', 800), ev('2026-06-20', 'entrada', 1000), ev('2026-06-23', 'saida', 2000)],
  });
  assert.deepEqual(p.periodos_negativos, [
    { de: '2026-06-17', ate: '2026-06-19', minimo_centavos: -300 },
    { de: '2026-06-23', ate: '2026-06-25', minimo_centavos: -1300 },
  ]);
  assert.deepEqual(p.saldo_minimo, { data: '2026-06-23', centavos: -1300 });
  assert.deepEqual(periodosNegativos([]), []);
});

test('calendário: agrupa por dia, ignora fora do mês e separa entrada de saída', () => {
  const { dias } = montarCalendario({
    de: '2026-06-01',
    ate: '2026-06-30',
    itens: [
      { data: '2026-06-10', tipo: 'despesa', valor_centavos: 100 },
      { data: '2026-06-10', tipo: 'receita', valor_centavos: 300 },
      { data: '2026-06-05', tipo: 'fatura', valor_centavos: 50 },
      { data: '2026-07-01', tipo: 'despesa', valor_centavos: 999 },
    ],
  });
  assert.deepEqual(dias.map((d) => d.data), ['2026-06-05', '2026-06-10']);
  assert.equal(dias[1].entradas_centavos, 300);
  assert.equal(dias[1].saidas_centavos, 100);
  assert.equal(dias[0].saidas_centavos, 50);
});

test('recorrência: mensal no dia 31 usa o último dia do mês e volta ao 31', () => {
  assert.equal(dataDaOcorrencia('2026-01-31', 'mensal', 1), '2026-02-28');
  assert.equal(dataDaOcorrencia('2026-01-31', 'mensal', 2), '2026-03-31');
  assert.equal(dataDaOcorrencia('2024-01-31', 'mensal', 1), '2024-02-29');
  assert.equal(dataDaOcorrencia('2024-02-29', 'anual', 1), '2025-02-28');
  assert.equal(dataDaOcorrencia('2026-06-15', 'semanal', 2), '2026-06-29');
  assert.equal(dataDaOcorrencia('2026-06-15', 'quinzenal', 3), '2026-07-27');
});

test('recorrência: respeita a data final e o limite à frente', () => {
  const r = { data_inicio: '2026-06-15', data_fim: '2026-08-20', frequencia: 'mensal' };
  assert.deepEqual(ocorrenciasDaRecorrencia(r, '2026-12-31'), ['2026-06-15', '2026-07-15', '2026-08-15']);
  assert.deepEqual(ocorrenciasDaRecorrencia(r, '2026-07-01'), ['2026-06-15']);
  assert.deepEqual(ocorrenciasDaRecorrencia({ ...r, data_fim: null }, '2026-06-14'), []);
});

test('alertas: atraso, vencimento próximo, fechamento e saldo negativo, do mais grave ao mais leve', () => {
  const hoje = '2026-06-15';
  const projecao = projetarSaldo({ saldo_inicial_centavos: 0, hoje, dias: 5, eventos: [ev('2026-06-16', 'saida', 100)] });
  const alertas = montarAlertas({
    hoje,
    compromissos: [
      { tipo: 'despesa', valor_centavos: 1000, data_vencimento: '2026-06-10', data_competencia: '2026-06-01' },
      { tipo: 'despesa', valor_centavos: 500, data_vencimento: '2026-06-17', data_competencia: '2026-06-01' },
      { tipo: 'despesa', valor_centavos: 500, data_vencimento: '2026-06-30', data_competencia: '2026-06-01' },
      { tipo: 'receita', valor_centavos: 700, data_vencimento: '2026-06-16', data_competencia: '2026-06-01' },
    ],
    faturas: [
      { id: 9, cartao_nome: 'Roxo', referencia: '2026-06', data_fechamento: '2026-06-16', data_vencimento: '2026-06-25', total_centavos: 300, saldo_centavos: 300, status: 'aberta' },
    ],
    projecao,
  });
  assert.deepEqual(
    alertas.map((a) => a.codigo).sort(),
    ['atraso_pagar', 'fechamento_fatura', 'recebimento_proximo', 'saldo_negativo_projetado', 'vencimento_proximo'],
  );
  const peso = { alta: 0, media: 1, info: 2 };
  const pesos = alertas.map((a) => peso[a.nivel]);
  assert.deepEqual(pesos, [...pesos].sort((a, b) => a - b));
  assert.equal(alertas[0].nivel, 'alta');
  assert.equal(alertas.at(-1).nivel, 'info');
  assert.ok(alertas.find((a) => a.codigo === 'vencimento_proximo').mensagem.includes('R$'));
});

test('alertas: sem pendências, faturas ou saldo negativo não há alerta (nada de zero falso)', () => {
  const projecao = projetarSaldo({ saldo_inicial_centavos: 100, hoje: '2026-06-15', dias: 3, eventos: [] });
  assert.deepEqual(montarAlertas({ hoje: '2026-06-15', compromissos: [], faturas: [], projecao }), []);
});
