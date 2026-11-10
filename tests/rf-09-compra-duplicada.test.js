import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarCompra, listarComprasDoCartao } from '../servidor/banco/repositorios/cartoes.js';
import { CTX, bancoComPadroes, novoCartao } from './ajuda.js';

const dados = (cartao, extra = {}) => ({
  cartao_id: cartao.id,
  descricao: 'Mercado',
  valor_total_centavos: 8500,
  categoria_id: null,
  data_compra: '2026-06-05',
  parcelas_total: 1,
  observacao: '',
  ...extra,
});
const lancar = async (db, d) => await criarCompra(db, d, CTX);

test('RF-09: compra repetida no mesmo cartão avisa, mas não bloqueia', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const primeira = await lancar(db, dados(cartao));
  assert.deepEqual(primeira.avisos, []);

  const repetida = await lancar(db, dados(cartao));
  assert.deepEqual(repetida.avisos.map((a) => a.codigo), ['possivel_duplicidade']);
  assert.deepEqual(repetida.avisos[0].ids, [primeira.compra.id]);
  assert.equal((await listarComprasDoCartao(db, cartao.id, { pagina: 1, por_pagina: 25 })).total, 2, 'as duas foram salvas');
});

test('RF-09: a comparação ignora maiúsculas, acentos e espaços sobrando na descrição', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  await lancar(db, dados(cartao, { descricao: 'Padaria Pão Quente' }));
  const parecida = await lancar(db, dados(cartao, { descricao: '  padaria  pao quente ' }));
  assert.equal(parecida.avisos.length, 1);
});

test('RF-09: valor, data, descrição ou cartão diferentes não são duplicidade', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const outro = await novoCartao(db, { nome: 'Cartão B' });
  await lancar(db, dados(cartao));
  assert.deepEqual((await lancar(db, dados(cartao, { valor_total_centavos: 8501 }))).avisos, []);
  assert.deepEqual((await lancar(db, dados(cartao, { data_compra: '2026-06-06' }))).avisos, []);
  assert.deepEqual((await lancar(db, dados(cartao, { descricao: 'Feira' }))).avisos, []);
  assert.deepEqual((await lancar(db, dados(outro))).avisos, []);
});

test('RF-09: a parcela de uma compra parcelada não conta como outra compra', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const { avisos } = await lancar(db, dados(cartao, { valor_total_centavos: 9000, parcelas_total: 3 }));
  assert.deepEqual(avisos, []);
  assert.equal((await listarComprasDoCartao(db, cartao.id, { pagina: 1, por_pagina: 25 })).total, 1);
});
