import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centavosParaCampo, dividirEmParcelas, formatarDinheiro, parseDinheiro } from '../contratos/dinheiro.js';

const NBSP = ' ';

test('formatarDinheiro: centavos viram R$ com milhar e vírgula', () => {
  assert.equal(formatarDinheiro(123456), `R$${NBSP}1.234,56`);
  assert.equal(formatarDinheiro(0), `R$${NBSP}0,00`);
  assert.equal(formatarDinheiro(5), `R$${NBSP}0,05`);
  assert.equal(formatarDinheiro(-1050), `-R$${NBSP}10,50`);
  assert.equal(formatarDinheiro(100000000), `R$${NBSP}1.000.000,00`);
});

test('centavosParaCampo: texto de edição que o parse lê de volta', () => {
  assert.equal(centavosParaCampo(123456), '1234,56');
  assert.equal(centavosParaCampo(5), '0,05');
  assert.equal(centavosParaCampo(0), '0,00');
  assert.equal(centavosParaCampo(-1050), '-10,50');
  for (const c of [0, 1, 99, 100, 123456, -4599, 99999999]) assert.equal(parseDinheiro(centavosParaCampo(c)), c);
  assert.throws(() => centavosParaCampo(1.5), TypeError);
});

test('formatarDinheiro: recusa número que não é inteiro', () => {
  assert.throws(() => formatarDinheiro(10.5), TypeError);
  assert.throws(() => formatarDinheiro('100'), TypeError);
  assert.throws(() => formatarDinheiro(NaN), TypeError);
});

test('parseDinheiro: formatos brasileiros comuns', () => {
  assert.equal(parseDinheiro('R$ 1.234,56'), 123456);
  assert.equal(parseDinheiro(`R$${NBSP}1.234,56`), 123456);
  assert.equal(parseDinheiro('1.234,56'), 123456);
  assert.equal(parseDinheiro('1234,56'), 123456);
  assert.equal(parseDinheiro('1234,5'), 123450);
  assert.equal(parseDinheiro('0,05'), 5);
  assert.equal(parseDinheiro('10'), 1000);
  assert.equal(parseDinheiro('1.234'), 123400);
  assert.equal(parseDinheiro('1.234.567'), 123456700);
  assert.equal(parseDinheiro('1234.56'), 123456);
  assert.equal(parseDinheiro('12.5'), 1250);
  assert.equal(parseDinheiro(',50'), 50);
});

test('parseDinheiro: negativos e zero', () => {
  assert.equal(parseDinheiro('-10,50'), -1050);
  assert.equal(parseDinheiro('-R$ 10,50'), -1050);
  assert.equal(parseDinheiro('R$ -10,50'), -1050);
  assert.equal(parseDinheiro('-0'), 0);
  assert.equal(Object.is(parseDinheiro('-0,00'), -0), false);
});

test('parseDinheiro: texto inválido devolve null', () => {
  for (const ruim of ['', ' ', 'abc', '1,2,3', '1,234,56', '12,345', '1..2', '1.23.4', 'R$', '--5', '1e3', null, undefined, 12]) {
    assert.equal(parseDinheiro(ruim), null, `deveria recusar ${JSON.stringify(ruim)}`);
  }
});

test('parseDinheiro: recusa valor acima do inteiro seguro', () => {
  assert.equal(parseDinheiro('99999999999999999999,99'), null);
});

test('parseDinheiro e formatarDinheiro fecham o ciclo', () => {
  for (const c of [0, 1, 99, 100, 123456, 99999999, -4599]) {
    assert.equal(parseDinheiro(formatarDinheiro(c)), c);
  }
});

test('dividirEmParcelas: soma fecha e o resto vai para a primeira', () => {
  assert.deepEqual(dividirEmParcelas(10000, 3), [3334, 3333, 3333]);
  assert.deepEqual(dividirEmParcelas(100, 3), [34, 33, 33]);
  assert.deepEqual(dividirEmParcelas(5, 3), [3, 1, 1]);
  assert.deepEqual(dividirEmParcelas(1000, 1), [1000]);
  assert.deepEqual(dividirEmParcelas(0, 4), [0, 0, 0, 0]);
  for (const [total, n] of [[99999, 7], [1, 12], [123456, 10], [10, 3]]) {
    const parcelas = dividirEmParcelas(total, n);
    assert.equal(parcelas.length, n);
    assert.equal(parcelas.reduce((a, b) => a + b, 0), total);
    assert.ok(parcelas.every(Number.isInteger));
  }
});

test('dividirEmParcelas: recusa entradas inválidas', () => {
  assert.throws(() => dividirEmParcelas(100, 0), RangeError);
  assert.throws(() => dividirEmParcelas(100, 1.5), RangeError);
  assert.throws(() => dividirEmParcelas(-1, 2), RangeError);
  assert.throws(() => dividirEmParcelas(10.5, 2), RangeError);
});
