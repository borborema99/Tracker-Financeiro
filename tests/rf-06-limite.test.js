import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  anteciparParcelas,
  criarCompra,
  estornarCompra,
  faturasDoCartao,
  obterCartao,
  pagarFatura,
} from '../servidor/banco/repositorios/cartoes.js';
import { CTX, bancoComPadroes, novaCompra, novaConta, novaMov, novoCartao, saldoDe } from './ajuda.js';

const limite = (db, cartao) => obterCartao(db, cartao.id, CTX.hoje).limite;
const fatura = (db, cartao, referencia) =>
  faturasDoCartao(db, cartao.id, CTX.hoje).find((f) => f.referencia === referencia);

// Compra de R$ 1.200,00 em 3 parcelas de R$ 400,00 (junho, julho e agosto). Em 15/06 a fatura aberta é a de julho.
function cartaoComCompraParcelada(db, extra = {}) {
  const cartao = novoCartao(db, extra);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 120000, parcelas_total: 3 });
  return { cartao, compra };
}

test('RF-06: limite disponível = limite − faturas não pagas − parcelas futuras ainda não pagas', () => {
  const db = bancoComPadroes();
  const { cartao } = cartaoComCompraParcelada(db);
  assert.deepEqual(limite(db, cartao), {
    limite_centavos: 500000,
    faturas_nao_pagas_centavos: 80000, // junho (fechada) + julho (aberta)
    parcelas_futuras_centavos: 40000, // agosto
    usado_centavos: 120000,
    disponivel_centavos: 380000,
  });
});

test('RF-06: limite do cartão e saldo bancário são tratados separadamente', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 0);
  const { cartao } = cartaoComCompraParcelada(db);
  const antes = limite(db, cartao);

  novaMov(db, { tipo: 'receita', valor_centavos: 999999, conta_id: conta.id });
  assert.deepEqual(limite(db, cartao), antes, 'ter dinheiro na conta não aumenta o limite');

  novaCompra(db, cartao, { valor_total_centavos: 5000, data_compra: '2026-06-12' });
  assert.equal(saldoDe(db, conta.id), 999999, 'gastar no cartão não mexe no saldo da conta');
  assert.equal(limite(db, cartao).disponivel_centavos, antes.disponivel_centavos - 5000);
});

test('RF-06: pagar a fatura libera o limite e debita só a conta', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const { cartao } = cartaoComCompraParcelada(db);

  pagarFatura(db, fatura(db, cartao, '2026-06').id, { valor_centavos: 40000, conta_id: conta.id }, CTX);

  assert.equal(limite(db, cartao).disponivel_centavos, 420000);
  assert.equal(limite(db, cartao).faturas_nao_pagas_centavos, 40000);
  assert.equal(saldoDe(db, conta.id), 60000);
});

test('RF-06: o pagamento parcial libera só o valor pago', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const { cartao } = cartaoComCompraParcelada(db);
  pagarFatura(db, fatura(db, cartao, '2026-06').id, { valor_centavos: 10000, conta_id: conta.id }, CTX);
  assert.equal(limite(db, cartao).disponivel_centavos, 390000);
});

test('RF-06: o estorno libera limite', () => {
  const db = bancoComPadroes();
  const { cartao, compra } = cartaoComCompraParcelada(db);
  estornarCompra(db, compra.id, { valor_centavos: 30000 }, CTX);
  // O crédito abate a fatura aberta (julho): 40000 − 30000.
  assert.equal(limite(db, cartao).faturas_nao_pagas_centavos, 50000);
  assert.equal(limite(db, cartao).disponivel_centavos, 410000);
});

test('RF-06: antecipar parcelas muda de "futuras" para "faturas", mas não muda o limite disponível', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 120000, parcelas_total: 4 });
  const antes = limite(db, cartao);
  assert.equal(antes.parcelas_futuras_centavos, 60000);

  anteciparParcelas(db, compra.id, { parcelas: [3, 4] }, CTX);

  const depois = limite(db, cartao);
  assert.equal(depois.parcelas_futuras_centavos, 0);
  assert.equal(depois.faturas_nao_pagas_centavos, 120000);
  assert.equal(depois.disponivel_centavos, antes.disponivel_centavos);
});

test('RF-06: o limite é de cada cartão; um cartão não consome o limite do outro', () => {
  const db = bancoComPadroes();
  const { cartao } = cartaoComCompraParcelada(db);
  const outro = novoCartao(db, { nome: 'Cartão B', limite_centavos: 100000 });
  assert.equal(limite(db, outro).disponivel_centavos, 100000);
  assert.equal(limite(db, cartao).disponivel_centavos, 380000);
});

test('RF-06: passar do limite avisa, mas não bloqueia, e o disponível fica negativo', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db, { limite_centavos: 10000 });
  const { compra, avisos } = criarCompra(
    db,
    {
      cartao_id: cartao.id, descricao: 'Compra grande', valor_total_centavos: 15000, categoria_id: null,
      data_compra: '2026-06-05', parcelas_total: 1, observacao: '',
    },
    CTX,
  );
  assert.ok(compra.id, 'a compra foi registrada');
  assert.deepEqual(avisos.map((a) => a.codigo), ['acima_do_limite']);
  assert.equal(limite(db, cartao).disponivel_centavos, -5000);
});
