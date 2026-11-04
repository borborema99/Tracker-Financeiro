import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  atualizarCompra,
  excluirCartao,
  excluirCompra,
  estornarCompra,
  faturasDoCartao,
  movimentosDeCartaoDoPeriodo,
  obterCartao,
  obterCompra,
  pagarFatura,
  atualizarCartao,
} from '../servidor/banco/repositorios/cartoes.js';
import { excluirCategoria } from '../servidor/banco/repositorios/categorias.js';
import { excluirConta } from '../servidor/banco/repositorios/contas.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaCompra, novaConta, novoCartao } from './ajuda.js';

const faturas = (db, cartao) => faturasDoCartao(db, cartao.id, CTX.hoje);
const limite = (db, cartao) => obterCartao(db, cartao.id, CTX.hoje).limite;
const despesas = (db) =>
  resumoRealizado(movimentosDeCartaoDoPeriodo(db, '2026-01-01', '2026-12-31'), '2026-01-01', '2026-12-31').despesas;
const comoEdicao = (compra, mudancas) => ({
  cartao_id: compra.cartao_id,
  descricao: compra.descricao,
  valor_total_centavos: compra.valor_total_centavos,
  categoria_id: compra.categoria_id,
  data_compra: compra.data_compra,
  parcelas_total: compra.parcelas_total,
  observacao: compra.observacao,
  ...mudancas,
});

test('RF-08: excluir a compra tira as parcelas das faturas, devolve o limite e não deixa fatura órfã', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });
  assert.equal(faturas(db, cartao).length, 3);

  excluirCompra(db, compra.id, CTX);

  assert.deepEqual(faturas(db, cartao), [], 'nenhuma fatura sobra sem linhas');
  assert.equal(limite(db, cartao).disponivel_centavos, 500000);
  assert.equal(despesas(db), 0);
  assert.equal(obterCompra(db, compra.id), null);
});

test('RF-08: excluir a compra leva os estornos junto', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });
  estornarCompra(db, compra.id, { valor_centavos: 3000 }, CTX);

  excluirCompra(db, compra.id, CTX);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM estornos_cartao WHERE excluido_em IS NULL').get().n, 0);
  assert.deepEqual(faturas(db, cartao), []);
  assert.equal(despesas(db), 0);
});

test('RF-08: excluir compra que deixaria a fatura com mais pagamento que total é recusado e nada muda', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const cartao = novoCartao(db);
  novaCompra(db, cartao, { valor_total_centavos: 10000, descricao: 'A' });
  const b = novaCompra(db, cartao, { valor_total_centavos: 5000, descricao: 'B' });
  pagarFatura(db, faturas(db, cartao)[0].id, { valor_centavos: 15000, conta_id: conta.id }, CTX);

  assert.throws(() => excluirCompra(db, b.id, CTX), (erro) => erro.statusCode === 409);

  assert.ok(obterCompra(db, b.id), 'a compra continua lá');
  assert.equal(faturas(db, cartao)[0].total_centavos, 15000);
});

test('RF-08: editar o valor e as parcelas recalcula parcelas, faturas e limite', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });

  const { compra: editada } = atualizarCompra(
    db,
    compra.id,
    comoEdicao(compra, { valor_total_centavos: 6000, parcelas_total: 2 }),
    CTX,
  );

  assert.deepEqual(editada.parcelas.map((p) => p.valor_centavos), [3000, 3000]);
  assert.deepEqual(faturas(db, cartao).map((f) => f.total_centavos).sort(), [3000, 3000]);
  assert.equal(limite(db, cartao).faturas_nao_pagas_centavos, 6000);
  assert.equal(limite(db, cartao).parcelas_futuras_centavos, 0);
  assert.equal(despesas(db), 6000);
});

test('RF-08: compra com estorno não muda valor, parcelas nem data, mas pode mudar descrição', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000 });
  estornarCompra(db, compra.id, { valor_centavos: 2000 }, CTX);

  assert.throws(
    () => atualizarCompra(db, compra.id, comoEdicao(compra, { valor_total_centavos: 9000 }), CTX),
    (erro) => erro.statusCode === 409,
  );
  const { compra: nova } = atualizarCompra(db, compra.id, comoEdicao(compra, { descricao: 'Novo nome' }), CTX);
  assert.equal(nova.descricao, 'Novo nome');
  assert.equal(nova.estornado_centavos, 2000);
});

test('RF-08: não se troca o cartão de uma compra', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const outro = novoCartao(db, { nome: 'Cartão B' });
  const compra = novaCompra(db, cartao);
  assert.throws(
    () => atualizarCompra(db, compra.id, comoEdicao(compra, { cartao_id: outro.id }), CTX),
    (erro) => erro.statusCode === 409,
  );
});

test('RF-08: cartão com compras só se arquiva; sem compras pode ser excluído', () => {
  const db = bancoComPadroes();
  const comCompras = novoCartao(db, { nome: 'Com compras' });
  const vazio = novoCartao(db, { nome: 'Vazio' });
  novaCompra(db, comCompras);

  assert.throws(() => excluirCartao(db, comCompras.id, CTX), (erro) => erro.statusCode === 409);
  const arquivado = atualizarCartao(
    db,
    comCompras.id,
    { ...comCompras, arquivado: true, conta_pagamento_id: null },
    CTX,
  );
  assert.equal(arquivado.arquivado, true);

  excluirCartao(db, vazio.id, CTX);
  assert.equal(obterCartao(db, vazio.id, CTX.hoje), null);
});

test('RF-08: conta com pagamento de fatura ou escolhida por um cartão não pode ser excluída', () => {
  const db = bancoComPadroes();
  const usada = novaConta(db, 'Usada no cartão');
  const padrao = novaConta(db, 'Padrão do cartão');
  const cartao = novoCartao(db, { conta_pagamento_id: padrao.id });
  novaCompra(db, cartao, { valor_total_centavos: 5000 });

  assert.throws(() => excluirConta(db, padrao.id, CTX), (erro) => erro.statusCode === 409);
  pagarFatura(db, faturas(db, cartao)[0].id, { valor_centavos: 1000, conta_id: usada.id }, CTX);
  assert.throws(() => excluirConta(db, usada.id, CTX), (erro) => erro.statusCode === 409);
});

test('RF-08: categoria usada numa compra do cartão não pode ser excluída', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const mercado = categoriaPorNome(db, 'Mercado');
  novaCompra(db, cartao, { categoria_id: mercado.id });
  assert.throws(() => excluirCategoria(db, mercado.id, CTX), (erro) => erro.statusCode === 409);
});

test('toda escrita do cartão grava em audit_log, com o valor antes e depois', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });
  atualizarCompra(db, compra.id, comoEdicao(compra, { descricao: 'Editada' }), CTX);
  estornarCompra(db, compra.id, { valor_centavos: 1000 }, CTX);
  excluirCompra(db, compra.id, CTX);

  const historico = db
    .prepare("SELECT acao, antes, depois FROM audit_log WHERE entidade = 'compra_cartao' AND entidade_id = ? ORDER BY id")
    .all(String(compra.id));
  assert.deepEqual(historico.map((h) => h.acao), ['criar', 'editar', 'editar', 'excluir']);
  assert.equal(JSON.parse(historico[1].antes).descricao, '');
  assert.equal(JSON.parse(historico[1].depois).descricao, 'Editada');
  assert.equal(JSON.parse(historico[2].depois).estornado_centavos, 1000);
  for (const entidade of ['cartao', 'fatura', 'estorno_cartao']) {
    assert.ok(db.prepare('SELECT 1 FROM audit_log WHERE entidade = ?').get(entidade), `auditou ${entidade}`);
  }
});
