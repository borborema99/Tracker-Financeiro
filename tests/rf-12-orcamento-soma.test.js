import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estornarCompra, movimentosDeCartaoDoPeriodo, pagarFatura, faturasDoCartao } from '../servidor/banco/repositorios/cartoes.js';
import { movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { definirLimite, orcamentoDoMes } from '../servidor/banco/repositorios/orcamentos.js';
import { intervaloDoMes } from '../servidor/dominio/datas.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaCompra, novaConta, novaMov, novoCartao } from './ajuda.js';

const MES = '2026-06';

test('RF-12: a soma do gasto por categoria (com e sem orçamento) é a despesa realizada do resumo, sem contar nada duas vezes', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'Conta A', 2000000);
  const b = await novaConta(db, 'Conta B', 0);
  const cartao = await novoCartao(db);
  const lazer = await categoriaPorNome(db, 'Lazer');
  const mercado = await categoriaPorNome(db, 'Mercado');
  const vestuario = await categoriaPorNome(db, 'Vestuário');
  await definirLimite(db, lazer.id, { mes_inicio: MES, limite_centavos: 100000 }, CTX);

  await novaMov(db, { conta_id: a.id, categoria_id: lazer.id, valor_centavos: 12345 });
  await novaMov(db, { conta_id: a.id, categoria_id: mercado.id, valor_centavos: 23456 });
  await novaMov(db, { conta_id: a.id, categoria_id: null, valor_centavos: 777 }); // sem categoria
  await novaMov(db, {
    conta_id: a.id,
    valor_centavos: 10001,
    categoria_id: null,
    divisoes: [
      { categoria_id: lazer.id, valor_centavos: 5000 },
      { categoria_id: vestuario.id, valor_centavos: 5001 },
    ],
  });
  // Transferência com tarifa: só a tarifa é despesa (RF-03).
  await novaMov(db, { tipo: 'transferencia', conta_id: a.id, conta_destino_id: b.id, valor_centavos: 50000, tarifa_centavos: 990 });
  // Pendente não é realizado.
  await novaMov(db, { conta_id: a.id, categoria_id: lazer.id, valor_centavos: 99999, status: 'pendente', data_vencimento: '2026-06-28' });
  // Cartão: a compra conta uma vez, o estorno reduz, pagar a fatura não é despesa nova (RF-04).
  const compra = await novaCompra(db, cartao, { categoria_id: lazer.id, valor_total_centavos: 30000, parcelas_total: 3 });
  await estornarCompra(db, compra.id, { valor_centavos: 4000, data_estorno: '2026-06-12' }, CTX);
  const [primeira] = await faturasDoCartao(db, cartao.id, CTX.hoje);
  await pagarFatura(db, primeira.id, { valor_centavos: 1000, conta_id: a.id }, CTX);

  const { de, ate } = intervaloDoMes(MES);
  const realizadoDoResumo = resumoRealizado(
    [...await movimentacoesDoPeriodo(db, de, ate), ...await movimentosDeCartaoDoPeriodo(db, de, ate)],
    de,
    ate,
  ).despesas;

  const o = await orcamentoDoMes(db, MES);
  const somaPorCategoria =
    o.itens.reduce((s, i) => s + i.realizado_centavos, 0) + o.sem_orcamento.reduce((s, i) => s + i.realizado_centavos, 0);

  assert.equal(somaPorCategoria, realizadoDoResumo);
  // 12345 + 23456 + 777 + 10001 + 990 (tarifa) + 30000 − 4000
  assert.equal(realizadoDoResumo, 73569);
});

test('RF-12: lançamento excluído e compra excluída saem do gasto da categoria', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const lazer = await categoriaPorNome(db, 'Lazer');
  await definirLimite(db, lazer.id, { mes_inicio: MES, limite_centavos: 100000 }, CTX);
  const mov = await novaMov(db, { conta_id: conta.id, categoria_id: lazer.id, valor_centavos: 4000 });
  assert.equal((await orcamentoDoMes(db, MES)).itens[0].realizado_centavos, 4000);
  (await db.rodar('UPDATE movimentacoes SET excluida_em = ? WHERE id = ?', [CTX.agora.toISOString(), mov.id]));
  assert.equal((await orcamentoDoMes(db, MES)).itens[0].realizado_centavos, 0);
});

test('RF-12: o gasto de um mês não vaza para o mês vizinho (por data de liquidação, compra e estorno)', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const cartao = await novoCartao(db);
  const lazer = await categoriaPorNome(db, 'Lazer');
  await definirLimite(db, lazer.id, { mes_inicio: '2026-05', limite_centavos: 100000 }, CTX);
  await novaMov(db, { conta_id: conta.id, categoria_id: lazer.id, valor_centavos: 1000, data_competencia: '2026-05-31', data_liquidacao: '2026-05-31' });
  await novaMov(db, { conta_id: conta.id, categoria_id: lazer.id, valor_centavos: 2000, data_competencia: '2026-06-01', data_liquidacao: '2026-06-01' });
  await novaCompra(db, cartao, { categoria_id: lazer.id, valor_total_centavos: 4000, data_compra: '2026-06-30' });
  await novaCompra(db, cartao, { categoria_id: lazer.id, valor_total_centavos: 8000, data_compra: '2026-07-01' });

  assert.equal((await orcamentoDoMes(db, '2026-05')).itens[0].realizado_centavos, 1000);
  assert.equal((await orcamentoDoMes(db, '2026-06')).itens[0].realizado_centavos, 6000);
  assert.equal((await orcamentoDoMes(db, '2026-07')).itens[0].realizado_centavos, 8000);
});
