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

const faturas = async (db, cartao) => await faturasDoCartao(db, cartao.id, CTX.hoje);
const limite = async (db, cartao) => (await obterCartao(db, cartao.id, CTX.hoje)).limite;
const despesas = async (db) =>
  resumoRealizado(await movimentosDeCartaoDoPeriodo(db, '2026-01-01', '2026-12-31'), '2026-01-01', '2026-12-31').despesas;
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

test('RF-08: excluir a compra tira as parcelas das faturas, devolve o limite e não deixa fatura órfã', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const compra = await novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });
  assert.equal((await faturas(db, cartao)).length, 3);

  await excluirCompra(db, compra.id, CTX);

  assert.deepEqual(await faturas(db, cartao), [], 'nenhuma fatura sobra sem linhas');
  assert.equal((await limite(db, cartao)).disponivel_centavos, 500000);
  assert.equal(await despesas(db), 0);
  assert.equal(await obterCompra(db, compra.id), null);
});

test('RF-08: excluir a compra leva os estornos junto', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const compra = await novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });
  await estornarCompra(db, compra.id, { valor_centavos: 3000 }, CTX);

  await excluirCompra(db, compra.id, CTX);

  assert.equal((await db.um('SELECT COUNT(*) AS n FROM estornos_cartao WHERE excluido_em IS NULL', [])).n, 0);
  assert.deepEqual(await faturas(db, cartao), []);
  assert.equal(await despesas(db), 0);
});

test('RF-08: excluir compra que deixaria a fatura com mais pagamento que total é recusado e nada muda', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 100000);
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { valor_total_centavos: 10000, descricao: 'A' });
  const b = await novaCompra(db, cartao, { valor_total_centavos: 5000, descricao: 'B' });
  await pagarFatura(db, (await faturas(db, cartao))[0].id, { valor_centavos: 15000, conta_id: conta.id }, CTX);

  await assert.rejects(async () => await excluirCompra(db, b.id, CTX), (erro) => erro.statusCode === 409);

  assert.ok(await obterCompra(db, b.id), 'a compra continua lá');
  assert.equal((await faturas(db, cartao))[0].total_centavos, 15000);
});

test('RF-08: editar o valor e as parcelas recalcula parcelas, faturas e limite', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const compra = await novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });

  const { compra: editada } = await atualizarCompra(
    db,
    compra.id,
    comoEdicao(compra, { valor_total_centavos: 6000, parcelas_total: 2 }),
    CTX,
  );

  assert.deepEqual(editada.parcelas.map((p) => p.valor_centavos), [3000, 3000]);
  assert.deepEqual((await faturas(db, cartao)).map((f) => f.total_centavos).sort(), [3000, 3000]);
  assert.equal((await limite(db, cartao)).faturas_nao_pagas_centavos, 6000);
  assert.equal((await limite(db, cartao)).parcelas_futuras_centavos, 0);
  assert.equal(await despesas(db), 6000);
});

test('RF-08: compra com estorno não muda valor, parcelas nem data, mas pode mudar descrição', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const compra = await novaCompra(db, cartao, { valor_total_centavos: 12000 });
  await estornarCompra(db, compra.id, { valor_centavos: 2000 }, CTX);

  await assert.rejects(
    async () => await atualizarCompra(db, compra.id, comoEdicao(compra, { valor_total_centavos: 9000 }), CTX),
    (erro) => erro.statusCode === 409,
  );
  const { compra: nova } = await atualizarCompra(db, compra.id, comoEdicao(compra, { descricao: 'Novo nome' }), CTX);
  assert.equal(nova.descricao, 'Novo nome');
  assert.equal(nova.estornado_centavos, 2000);
});

test('RF-08: não se troca o cartão de uma compra', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const outro = await novoCartao(db, { nome: 'Cartão B' });
  const compra = await novaCompra(db, cartao);
  await assert.rejects(
    async () => await atualizarCompra(db, compra.id, comoEdicao(compra, { cartao_id: outro.id }), CTX),
    (erro) => erro.statusCode === 409,
  );
});

test('RF-08: cartão com compras só se arquiva; sem compras pode ser excluído', async () => {
  const db = await bancoComPadroes();
  const comCompras = await novoCartao(db, { nome: 'Com compras' });
  const vazio = await novoCartao(db, { nome: 'Vazio' });
  await novaCompra(db, comCompras);

  await assert.rejects(async () => await excluirCartao(db, comCompras.id, CTX), (erro) => erro.statusCode === 409);
  const arquivado = await atualizarCartao(
    db,
    comCompras.id,
    { ...comCompras, arquivado: true, conta_pagamento_id: null },
    CTX,
  );
  assert.equal(arquivado.arquivado, true);

  await excluirCartao(db, vazio.id, CTX);
  assert.equal(await obterCartao(db, vazio.id, CTX.hoje), null);
});

test('RF-08: conta com pagamento de fatura ou escolhida por um cartão não pode ser excluída', async () => {
  const db = await bancoComPadroes();
  const usada = await novaConta(db, 'Usada no cartão');
  const padrao = await novaConta(db, 'Padrão do cartão');
  const cartao = await novoCartao(db, { conta_pagamento_id: padrao.id });
  await novaCompra(db, cartao, { valor_total_centavos: 5000 });

  await assert.rejects(async () => await excluirConta(db, padrao.id, CTX), (erro) => erro.statusCode === 409);
  await pagarFatura(db, (await faturas(db, cartao))[0].id, { valor_centavos: 1000, conta_id: usada.id }, CTX);
  await assert.rejects(async () => await excluirConta(db, usada.id, CTX), (erro) => erro.statusCode === 409);
});

test('RF-08: categoria usada numa compra do cartão não pode ser excluída', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const mercado = await categoriaPorNome(db, 'Mercado');
  await novaCompra(db, cartao, { categoria_id: mercado.id });
  await assert.rejects(async () => await excluirCategoria(db, mercado.id, CTX), (erro) => erro.statusCode === 409);
});

test('toda escrita do cartão grava em audit_log, com o valor antes e depois', async () => {
  const db = await bancoComPadroes();
  const cartao = await novoCartao(db);
  const compra = await novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });
  await atualizarCompra(db, compra.id, comoEdicao(compra, { descricao: 'Editada' }), CTX);
  await estornarCompra(db, compra.id, { valor_centavos: 1000 }, CTX);
  await excluirCompra(db, compra.id, CTX);

  const historico = (await db.todos("SELECT acao, antes, depois FROM audit_log WHERE entidade = 'compra_cartao' AND entidade_id = ? ORDER BY id", [String(compra.id)]));
  assert.deepEqual(historico.map((h) => h.acao), ['criar', 'editar', 'editar', 'excluir']);
  assert.equal(historico[1].antes.descricao, '');
  assert.equal(historico[1].depois.descricao, 'Editada');
  assert.equal(historico[2].depois.estornado_centavos, 1000);
  for (const entidade of ['cartao', 'fatura', 'estorno_cartao']) {
    assert.ok((await db.um('SELECT 1 FROM audit_log WHERE entidade = ?', [entidade])), `auditou ${entidade}`);
  }
});
