import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarMovimentacoes } from '../servidor/banco/repositorios/movimentacoes.js';
import { esquemaFiltros } from '../contratos/movimentacoes.js';
import { bancoComPadroes, categoriaPorNome, novaConta, novaMov } from './ajuda.js';

const listar = (db, filtros = {}) => listarMovimentacoes(db, esquemaFiltros.parse(filtros));

function massa(db) {
  const a = novaConta(db, 'Corrente');
  const b = novaConta(db, 'Carteira', 0, 'carteira');
  const mercado = categoriaPorNome(db, 'Mercado');
  const alimentacao = categoriaPorNome(db, 'Alimentação');
  const salario = categoriaPorNome(db, 'Salário');
  novaMov(db, { descricao: 'Compras do mês', valor_centavos: 25000, conta_id: a.id, categoria_id: mercado.id, data_competencia: '2026-06-03' });
  novaMov(db, { descricao: 'Almoço', valor_centavos: 3500, conta_id: b.id, categoria_id: alimentacao.id, data_competencia: '2026-06-05' });
  novaMov(db, { tipo: 'receita', descricao: 'Salário', valor_centavos: 400000, conta_id: a.id, categoria_id: salario.id, data_competencia: '2026-06-01' });
  novaMov(db, { descricao: '100% promoção_', valor_centavos: 999, conta_id: a.id, status: 'pendente', data_vencimento: '2026-06-28', data_competencia: '2026-06-20' });
  return { a, b, mercado, alimentacao, salario };
}

test('listagem: paginação no servidor com total', () => {
  const db = bancoComPadroes();
  const a = novaConta(db);
  for (let i = 1; i <= 7; i++) novaMov(db, { conta_id: a.id, valor_centavos: i * 100, data_competencia: `2026-06-${String(i).padStart(2, '0')}` });
  const p1 = listar(db, { por_pagina: '3', pagina: '1' });
  const p3 = listar(db, { por_pagina: '3', pagina: '3' });
  assert.equal(p1.total, 7);
  assert.equal(p1.itens.length, 3);
  assert.equal(p3.itens.length, 1);
  assert.equal(p1.por_pagina, 3);
  assert.equal(p1.itens[0].data_competencia, '2026-06-07', 'mais recente primeiro por padrão');
  const todos = [...listar(db, { por_pagina: '3', pagina: '1' }).itens, ...listar(db, { por_pagina: '3', pagina: '2' }).itens, ...p3.itens];
  assert.equal(new Set(todos.map((m) => m.id)).size, 7, 'sem repetir nem pular itens entre páginas');
});

test('listagem: por_pagina é limitado a 100 e pagina mínima é 1', () => {
  assert.throws(() => esquemaFiltros.parse({ por_pagina: '101' }));
  assert.throws(() => esquemaFiltros.parse({ pagina: '0' }));
});

test('listagem: ordenação por valor, descrição e data, nos dois sentidos', () => {
  const db = bancoComPadroes();
  massa(db);
  assert.deepEqual(listar(db, { ordenar: 'valor', direcao: 'asc' }).itens.map((m) => m.valor_centavos), [999, 3500, 25000, 400000]);
  assert.equal(listar(db, { ordenar: 'valor', direcao: 'desc' }).itens[0].valor_centavos, 400000);
  assert.equal(listar(db, { ordenar: 'descricao', direcao: 'asc' }).itens[0].descricao, '100% promoção_');
  assert.equal(listar(db, { ordenar: 'data', direcao: 'asc' }).itens[0].data_competencia, '2026-06-01');
});

test('listagem: busca por texto (e trata % e _ como texto comum)', () => {
  const db = bancoComPadroes();
  massa(db);
  assert.equal(listar(db, { q: 'almoço' }).total, 1);
  assert.equal(listar(db, { q: 'COMPRAS' }).total, 1);
  assert.equal(listar(db, { q: '100%' }).total, 1);
  assert.equal(listar(db, { q: '%' }).total, 1);
  assert.equal(listar(db, { q: '_' }).total, 1);
  assert.equal(listar(db, { q: 'inexistente' }).total, 0);
});

test('listagem: filtros por tipo, status, conta, valor e período', () => {
  const db = bancoComPadroes();
  const { a, b } = massa(db);
  assert.equal(listar(db, { tipo: 'receita' }).total, 1);
  assert.equal(listar(db, { status: 'pendente' }).total, 1);
  assert.equal(listar(db, { conta_id: String(b.id) }).total, 1);
  assert.equal(listar(db, { conta_id: String(a.id) }).total, 3);
  assert.equal(listar(db, { valor_min: '3000', valor_max: '30000' }).total, 2);
  assert.equal(listar(db, { de: '2026-06-04', ate: '2026-06-30' }).total, 2);
  assert.equal(listar(db, { campo_data: 'vencimento', de: '2026-06-28', ate: '2026-06-28' }).total, 1);
  assert.equal(listar(db, { campo_data: 'liquidacao', de: '2026-06-15', ate: '2026-06-15' }).total, 3, 'liquidadas hoje (contexto de teste)');
});

test('listagem: filtro por categoria inclui as subcategorias e as divisões', () => {
  const db = bancoComPadroes();
  const { a, mercado, alimentacao } = massa(db);
  const farmacia = categoriaPorNome(db, 'Farmácia');
  novaMov(db, {
    descricao: 'Compra mista', valor_centavos: 10000, conta_id: a.id,
    divisoes: [{ categoria_id: mercado.id, valor_centavos: 7000 }, { categoria_id: farmacia.id, valor_centavos: 3000 }],
  });
  assert.equal(listar(db, { categoria_id: String(alimentacao.id) }).total, 3, 'pai Alimentação: Mercado, Almoço e a dividida');
  const soMercado = listar(db, { categoria_id: String(mercado.id) });
  assert.equal(soMercado.total, 2);
  assert.equal(soMercado.totais.realizado.despesas, 25000 + 7000, 'a dividida entra só com a parte da categoria');
});

test('listagem: totais separados em realizado e previsto', () => {
  const db = bancoComPadroes();
  massa(db);
  const { totais } = listar(db);
  assert.deepEqual(totais.realizado, { receitas: 400000, despesas: 28500, resultado: 371500 });
  assert.deepEqual(totais.previsto, { receitas: 0, despesas: 999 });
});

test('dividir entre categorias: soma tem que fechar, mínimo duas partes, categorias do tipo certo', () => {
  const db = bancoComPadroes();
  const a = novaConta(db);
  const mercado = categoriaPorNome(db, 'Mercado');
  const salario = categoriaPorNome(db, 'Salário');
  const parte = (c, v) => ({ categoria_id: c.id, valor_centavos: v });
  assert.throws(() => novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 600), parte(mercado, 300)] }), (e) => /soma das divisões/.test(e.campos.divisoes));
  assert.throws(() => novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 1000)] }), (e) => Boolean(e.campos.divisoes));
  assert.throws(() => novaMov(db, { conta_id: a.id, valor_centavos: 1000, categoria_id: mercado.id, divisoes: [parte(mercado, 500), parte(mercado, 500)] }), (e) => Boolean(e.campos.categoria_id));
  assert.throws(() => novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 500), parte(salario, 500)] }), (e) => Boolean(e.campos.divisoes));
  const ok = novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 600), parte(mercado, 400)] });
  assert.equal(ok.categoria_id, null);
  assert.equal(ok.divisoes.length, 2);
});
