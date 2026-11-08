import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estornarCompra } from '../servidor/banco/repositorios/cartoes.js';
import { movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { relatorioPorCategoria } from '../servidor/banco/repositorios/relatorios.js';
import { movimentosDeCartaoDoPeriodo } from '../servidor/banco/repositorios/cartoes.js';
import { periodoAnterior, valoresPorCategoria } from '../servidor/dominio/relatorio.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaCompra, novaConta, novaMov, novoCartao } from './ajuda.js';

test('RF-23: o período anterior de meses cheios são os mesmos meses antes; o resto, o mesmo número de dias', () => {
  assert.deepEqual(periodoAnterior('2026-03-01', '2026-03-31'), { de: '2026-02-01', ate: '2026-02-28' });
  assert.deepEqual(periodoAnterior('2026-01-01', '2026-03-31'), { de: '2025-10-01', ate: '2025-12-31' });
  assert.deepEqual(periodoAnterior('2026-01-01', '2026-01-31'), { de: '2025-12-01', ate: '2025-12-31' });
  assert.deepEqual(periodoAnterior('2026-06-10', '2026-06-19'), { de: '2026-05-31', ate: '2026-06-09' });
});

const categorias = [
  { id: 1, nome: 'Alimentação', pai_id: null },
  { id: 2, nome: 'Mercado', pai_id: 1 },
  { id: 3, nome: 'Lazer', pai_id: null },
];

test('RF-23: subcategorias somam na principal, sem categoria vira item próprio e a soma dos itens é o total', () => {
  const r = valoresPorCategoria({
    linhas: [
      { categoria_id: 2, valor_centavos: 30000 },
      { categoria_id: 1, valor_centavos: 10000 },
      { categoria_id: 3, valor_centavos: 50000 },
      { categoria_id: null, valor_centavos: 10000 },
    ],
    anteriores: [],
    categorias,
  });
  assert.equal(r.total_centavos, 100000);
  assert.equal(r.itens.reduce((s, i) => s + i.valor_centavos, 0), r.total_centavos);
  const alimentacao = r.itens.find((i) => i.categoria_id === 1);
  assert.equal(alimentacao.valor_centavos, 40000);
  assert.deepEqual(alimentacao.subcategorias, [{ categoria_id: 2, nome: 'Mercado', valor_centavos: 30000 }]);
  assert.equal(alimentacao.percentual, 40);
  assert.equal(r.itens.find((i) => i.categoria_id === null).nome, 'Sem categoria');
  assert.deepEqual(r.itens.map((i) => i.categoria_id), [3, 1, null]);
});

test('RF-23: a variação é null sem valor anterior (não existe percentual sobre zero); categoria que sumiu aparece com zero', () => {
  const r = valoresPorCategoria({
    linhas: [{ categoria_id: 3, valor_centavos: 15000 }],
    anteriores: [
      { categoria_id: 3, valor_centavos: 10000 },
      { categoria_id: 1, valor_centavos: 20000 },
    ],
    categorias,
  });
  const lazer = r.itens.find((i) => i.categoria_id === 3);
  assert.equal(lazer.variacao_percentual, 50);
  const alimentacao = r.itens.find((i) => i.categoria_id === 1);
  assert.equal(alimentacao.valor_centavos, 0);
  assert.equal(alimentacao.variacao_percentual, -100);
  assert.equal(alimentacao.percentual, null);
  assert.equal(r.variacao_percentual, -50);

  const novo = valoresPorCategoria({ linhas: [{ categoria_id: 3, valor_centavos: 100 }], anteriores: [], categorias });
  assert.equal(novo.itens[0].variacao_percentual, null);
  assert.equal(novo.variacao_percentual, null);
});

test('RF-23: pelo banco, o total por categoria é a despesa realizada do resumo (cartão, estorno, divisão e tarifa)', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'Conta A', 2000000);
  const b = novaConta(db, 'Conta B', 0);
  const cartao = novoCartao(db);
  const lazer = categoriaPorNome(db, 'Lazer');
  const mercado = categoriaPorNome(db, 'Mercado');
  const vestuario = categoriaPorNome(db, 'Vestuário');

  novaMov(db, { conta_id: a.id, categoria_id: lazer.id, valor_centavos: 12345 });
  novaMov(db, { conta_id: a.id, categoria_id: mercado.id, valor_centavos: 23456 });
  novaMov(db, { conta_id: a.id, categoria_id: null, valor_centavos: 777 });
  novaMov(db, {
    conta_id: a.id,
    valor_centavos: 10001,
    categoria_id: null,
    divisoes: [
      { categoria_id: lazer.id, valor_centavos: 5000 },
      { categoria_id: vestuario.id, valor_centavos: 5001 },
    ],
  });
  novaMov(db, { tipo: 'transferencia', conta_id: a.id, conta_destino_id: b.id, valor_centavos: 50000, tarifa_centavos: 990 });
  novaMov(db, { conta_id: a.id, categoria_id: lazer.id, valor_centavos: 99999, status: 'pendente', data_vencimento: '2026-06-28' });
  novaMov(db, { conta_id: a.id, categoria_id: lazer.id, valor_centavos: 5555, data_competencia: '2026-05-10', data_liquidacao: '2026-05-10' });
  const compra = novaCompra(db, cartao, { categoria_id: lazer.id, valor_total_centavos: 30000, parcelas_total: 3 });
  estornarCompra(db, compra.id, { valor_centavos: 4000, data_estorno: '2026-06-12' }, CTX);

  const r = relatorioPorCategoria(db, { de: '2026-06-01', ate: '2026-06-30', tipo: 'despesa' });
  const movs = [...movimentacoesDoPeriodo(db, '2026-06-01', '2026-06-30'), ...movimentosDeCartaoDoPeriodo(db, '2026-06-01', '2026-06-30')];
  assert.equal(r.total_centavos, resumoRealizado(movs, '2026-06-01', '2026-06-30').despesas);
  assert.equal(r.itens.reduce((s, i) => s + i.valor_centavos, 0), r.total_centavos);
  assert.deepEqual(r.periodo_anterior, { de: '2026-05-01', ate: '2026-05-31' });
  assert.equal(r.total_anterior_centavos, 5555);
  const lazerItem = r.itens.find((i) => i.categoria_id === lazer.id);
  assert.equal(lazerItem.valor_centavos, 12345 + 5000 + 30000 - 4000);
  assert.equal(lazerItem.anterior_centavos, 5555);
});

test('RF-23: o relatório de receitas usa só receita liquidada, com divisão', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'Conta A', 0);
  const salario = categoriaPorNome(db, 'Salário');
  novaMov(db, { tipo: 'receita', conta_id: a.id, categoria_id: salario.id, valor_centavos: 500000 });
  novaMov(db, { tipo: 'receita', conta_id: a.id, categoria_id: salario.id, valor_centavos: 70000, status: 'pendente', data_vencimento: '2026-06-28' });
  novaMov(db, { conta_id: a.id, categoria_id: null, valor_centavos: 1000 });
  const r = relatorioPorCategoria(db, { de: '2026-06-01', ate: '2026-06-30', tipo: 'receita' });
  assert.equal(r.total_centavos, 500000);
  assert.equal(r.itens[0].nome, 'Salário');
});
