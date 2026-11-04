import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  consolidarFaturas,
  datasDaFatura,
  gerarParcelas,
  limiteDoCartao,
  movimentosDeCartao,
  projetarFaturas,
  referenciaDaCompra,
  somarMeses,
  statusDaFatura,
} from '../servidor/dominio/cartao.js';

test('somarMeses vira o ano nos dois sentidos', () => {
  assert.equal(somarMeses('2026-12', 1), '2027-01');
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(somarMeses('2026-06', 0), '2026-06');
  assert.equal(somarMeses('2026-03', 12), '2027-03');
});

test('RF-04: a compra entra na fatura pelo dia de fechamento (o próprio dia de fechamento ainda conta)', () => {
  assert.equal(referenciaDaCompra('2026-06-10', 10), '2026-06');
  assert.equal(referenciaDaCompra('2026-06-11', 10), '2026-07');
  assert.equal(referenciaDaCompra('2026-06-01', 10), '2026-06');
  assert.equal(referenciaDaCompra('2026-12-20', 10), '2027-01');
});

test('RF-05: o vencimento cai no mesmo mês quando é depois do fechamento e no seguinte quando não é', () => {
  assert.deepEqual(datasDaFatura('2026-06', 10, 17), { data_fechamento: '2026-06-10', data_vencimento: '2026-06-17' });
  assert.deepEqual(datasDaFatura('2026-06', 25, 5), { data_fechamento: '2026-06-25', data_vencimento: '2026-07-05' });
  assert.deepEqual(datasDaFatura('2026-12', 25, 5), { data_fechamento: '2026-12-25', data_vencimento: '2027-01-05' });
  assert.deepEqual(datasDaFatura('2026-06', 10, 10), { data_fechamento: '2026-06-10', data_vencimento: '2026-07-10' });
});

test('RF-05: as parcelas somam o total, com o resto de centavos na primeira, uma por fatura', () => {
  assert.deepEqual(gerarParcelas(10000, 3, '2026-06-05', 10), [
    { numero: 1, valor_centavos: 3334, referencia: '2026-06' },
    { numero: 2, valor_centavos: 3333, referencia: '2026-07' },
    { numero: 3, valor_centavos: 3333, referencia: '2026-08' },
  ]);
  const doze = gerarParcelas(1000, 12, '2026-11-20', 10);
  assert.equal(doze[0].referencia, '2026-12');
  assert.equal(doze[11].referencia, '2027-11');
  assert.equal(doze[0].valor_centavos, 87);
  assert.equal(doze.reduce((s, p) => s + p.valor_centavos, 0), 1000);
});

test('RF-05: em qualquer total e quantidade de parcelas a soma fecha com o total', () => {
  for (const total of [1, 2, 99, 100, 101, 12345, 99999, 1000000]) {
    for (const n of [1, 2, 3, 7, 10, 12, 48]) {
      if (total < n) continue;
      const parcelas = gerarParcelas(total, n, '2026-03-31', 28);
      assert.equal(parcelas.reduce((s, p) => s + p.valor_centavos, 0), total, `${total} em ${n}`);
      assert.ok(parcelas.every((p) => p.valor_centavos >= 1));
      assert.equal(new Set(parcelas.map((p) => p.referencia)).size, n, 'uma fatura por parcela');
    }
  }
});

const fatura = (id, referencia, cartao = 1) => ({
  id,
  cartao_id: cartao,
  referencia,
  data_fechamento: `${referencia}-10`,
  data_vencimento: `${referencia}-17`,
});

test('RF-05: o estorno abate a fatura e o que sobra passa para a seguinte (nada se perde)', () => {
  const faturas = [fatura(1, '2026-07'), fatura(2, '2026-08')];
  const parcelas = [
    { fatura_id: 1, valor_centavos: 3000 },
    { fatura_id: 2, valor_centavos: 5000 },
  ];
  const [a, b] = consolidarFaturas({ faturas, parcelas, estornos: [{ fatura_id: 1, valor_centavos: 4000 }] });
  assert.equal(a.total_centavos, 0);
  assert.equal(a.credito_a_transportar_centavos, 1000);
  assert.equal(b.total_centavos, 4000);
  assert.equal(b.credito_a_transportar_centavos, 0);

  const [, sobra] = consolidarFaturas({ faturas, parcelas, estornos: [{ fatura_id: 1, valor_centavos: 10000 }] });
  assert.equal(sobra.total_centavos, 0);
  assert.equal(sobra.credito_a_transportar_centavos, 2000, 'crédito que sobrou depois de todas as faturas');
});

test('o crédito de um cartão não abate a fatura de outro', () => {
  const faturas = [fatura(1, '2026-07', 1), fatura(2, '2026-07', 2)];
  const parcelas = [{ fatura_id: 2, valor_centavos: 5000 }];
  const [, outro] = consolidarFaturas({ faturas, parcelas, estornos: [{ fatura_id: 1, valor_centavos: 9000 }] });
  assert.equal(outro.total_centavos, 5000);
});

test('RF-07 (fatura): a situação é calculada pelas datas e pelo que foi pago, nunca digitada', () => {
  const base = { total_centavos: 10000, pago_centavos: 0, data_fechamento: '2026-06-10', data_vencimento: '2026-06-17' };
  assert.equal(statusDaFatura(base, '2026-06-10'), 'aberta');
  assert.equal(statusDaFatura(base, '2026-06-11'), 'fechada');
  assert.equal(statusDaFatura(base, '2026-06-17'), 'fechada');
  assert.equal(statusDaFatura(base, '2026-06-18'), 'atrasada');
  assert.equal(statusDaFatura({ ...base, pago_centavos: 4000 }, '2026-06-12'), 'parcial');
  assert.equal(statusDaFatura({ ...base, pago_centavos: 4000 }, '2026-06-18'), 'atrasada');
  assert.equal(statusDaFatura({ ...base, pago_centavos: 10000 }, '2026-06-30'), 'paga');
  assert.equal(statusDaFatura({ ...base, total_centavos: 0 }, '2026-06-30'), 'paga');
  assert.equal(statusDaFatura({ ...base, total_centavos: 0 }, '2026-06-05'), 'aberta');
});

test('RF-06: limite disponível = limite − faturas não pagas − parcelas futuras ainda não pagas', () => {
  const faturas = [
    { referencia: '2026-06', saldo_centavos: 4000 },
    { referencia: '2026-07', saldo_centavos: 6000 },
    { referencia: '2026-08', saldo_centavos: 5000 },
  ];
  // Em 15/06 com fechamento dia 10, a fatura aberta é a de julho: junho e julho são "faturas"; agosto é futura.
  assert.deepEqual(limiteDoCartao({ limite_centavos: 100000, faturas, hoje: '2026-06-15', dia_fechamento: 10 }), {
    limite_centavos: 100000,
    faturas_nao_pagas_centavos: 10000,
    parcelas_futuras_centavos: 5000,
    usado_centavos: 15000,
    disponivel_centavos: 85000,
  });
});

test('projeção das próximas faturas: da atual em diante, só com valor, sem misturar com o que já passou', () => {
  const faturas = [
    { id: 1, referencia: '2026-05', total_centavos: 9000, saldo_centavos: 9000, data_fechamento: '2026-05-10', data_vencimento: '2026-05-17' },
    { id: 2, referencia: '2026-07', total_centavos: 6000, saldo_centavos: 2000, data_fechamento: '2026-07-10', data_vencimento: '2026-07-17' },
    { id: 3, referencia: '2026-08', total_centavos: 0, saldo_centavos: 0, data_fechamento: '2026-08-10', data_vencimento: '2026-08-17' },
    { id: 4, referencia: '2026-09', total_centavos: 5000, saldo_centavos: 5000, data_fechamento: '2026-09-10', data_vencimento: '2026-09-17' },
  ];
  const { itens, total_centavos: total } = projetarFaturas({ faturas, hoje: '2026-06-15', dia_fechamento: 10 });
  assert.deepEqual(itens.map((i) => i.referencia), ['2026-07', '2026-09']);
  assert.equal(total, 7000);
});

test('RF-04: a compra vira despesa uma vez, pelo valor total, e o estorno a reduz na data do estorno', () => {
  const movs = movimentosDeCartao(
    [{ valor_total_centavos: 12000, data_compra: '2026-06-05' }],
    [{ valor_centavos: 3000, data_estorno: '2026-06-20' }],
  );
  assert.equal(movs.length, 2);
  assert.ok(movs.every((m) => m.tipo === 'despesa' && m.status === 'liquidada'));
  assert.deepEqual(movs.map((m) => [m.data_liquidacao, m.valor_centavos]), [
    ['2026-06-05', 12000],
    ['2026-06-20', -3000],
  ]);
});
