import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarMovimentacoes } from '../servidor/banco/repositorios/movimentacoes.js';
import { esquemaFiltros } from '../contratos/movimentacoes.js';
import { bancoComPadroes, categoriaPorNome, novaConta, novaMov } from './ajuda.js';

const listar = async (db, filtros = {}) => await listarMovimentacoes(db, esquemaFiltros.parse(filtros));

async function massa(db) {
  const a = await novaConta(db, 'Corrente');
  const b = await novaConta(db, 'Carteira', 0, 'carteira');
  const mercado = await categoriaPorNome(db, 'Mercado');
  const alimentacao = await categoriaPorNome(db, 'Alimentação');
  const salario = await categoriaPorNome(db, 'Salário');
  await novaMov(db, { descricao: 'Compras do mês', valor_centavos: 25000, conta_id: a.id, categoria_id: mercado.id, data_competencia: '2026-06-03' });
  await novaMov(db, { descricao: 'Almoço', valor_centavos: 3500, conta_id: b.id, categoria_id: alimentacao.id, data_competencia: '2026-06-05' });
  await novaMov(db, { tipo: 'receita', descricao: 'Salário', valor_centavos: 400000, conta_id: a.id, categoria_id: salario.id, data_competencia: '2026-06-01' });
  await novaMov(db, { descricao: '100% promoção_', valor_centavos: 999, conta_id: a.id, status: 'pendente', data_vencimento: '2026-06-28', data_competencia: '2026-06-20' });
  return { a, b, mercado, alimentacao, salario };
}

test('listagem: paginação no servidor com total', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  for (let i = 1; i <= 7; i++) await novaMov(db, { conta_id: a.id, valor_centavos: i * 100, data_competencia: `2026-06-${String(i).padStart(2, '0')}` });
  const p1 = await listar(db, { por_pagina: '3', pagina: '1' });
  const p3 = await listar(db, { por_pagina: '3', pagina: '3' });
  assert.equal(p1.total, 7);
  assert.equal(p1.itens.length, 3);
  assert.equal(p3.itens.length, 1);
  assert.equal(p1.por_pagina, 3);
  assert.equal(p1.itens[0].data_competencia, '2026-06-07', 'mais recente primeiro por padrão');
  const todos = [...(await listar(db, { por_pagina: '3', pagina: '1' })).itens, ...(await listar(db, { por_pagina: '3', pagina: '2' })).itens, ...p3.itens];
  assert.equal(new Set(todos.map((m) => m.id)).size, 7, 'sem repetir nem pular itens entre páginas');
});

test('listagem: por_pagina é limitado a 100 e pagina mínima é 1', async () => {
  await assert.rejects(async () => esquemaFiltros.parse({ por_pagina: '101' }));
  await assert.rejects(async () => esquemaFiltros.parse({ pagina: '0' }));
});

test('listagem: ordenação por valor, descrição e data, nos dois sentidos', async () => {
  const db = await bancoComPadroes();
  await massa(db);
  assert.deepEqual((await listar(db, { ordenar: 'valor', direcao: 'asc' })).itens.map((m) => m.valor_centavos), [999, 3500, 25000, 400000]);
  assert.equal((await listar(db, { ordenar: 'valor', direcao: 'desc' })).itens[0].valor_centavos, 400000);
  assert.equal((await listar(db, { ordenar: 'descricao', direcao: 'asc' })).itens[0].descricao, '100% promoção_');
  assert.equal((await listar(db, { ordenar: 'data', direcao: 'asc' })).itens[0].data_competencia, '2026-06-01');
});

test('listagem: busca por texto (e trata % e _ como texto comum)', async () => {
  const db = await bancoComPadroes();
  await massa(db);
  assert.equal((await listar(db, { q: 'almoço' })).total, 1);
  assert.equal((await listar(db, { q: 'COMPRAS' })).total, 1);
  assert.equal((await listar(db, { q: '100%' })).total, 1);
  assert.equal((await listar(db, { q: '%' })).total, 1);
  assert.equal((await listar(db, { q: '_' })).total, 1);
  assert.equal((await listar(db, { q: 'inexistente' })).total, 0);
});

test('listagem: filtros por tipo, status, conta, valor e período', async () => {
  const db = await bancoComPadroes();
  const { a, b } = await massa(db);
  assert.equal((await listar(db, { tipo: 'receita' })).total, 1);
  assert.equal((await listar(db, { status: 'pendente' })).total, 1);
  assert.equal((await listar(db, { conta_id: String(b.id) })).total, 1);
  assert.equal((await listar(db, { conta_id: String(a.id) })).total, 3);
  assert.equal((await listar(db, { valor_min: '3000', valor_max: '30000' })).total, 2);
  assert.equal((await listar(db, { de: '2026-06-04', ate: '2026-06-30' })).total, 2);
  assert.equal((await listar(db, { campo_data: 'vencimento', de: '2026-06-28', ate: '2026-06-28' })).total, 1);
  assert.equal((await listar(db, { campo_data: 'liquidacao', de: '2026-06-15', ate: '2026-06-15' })).total, 3, 'liquidadas hoje (contexto de teste)');
});

test('listagem: filtro por categoria inclui as subcategorias e as divisões', async () => {
  const db = await bancoComPadroes();
  const { a, mercado, alimentacao } = await massa(db);
  const farmacia = await categoriaPorNome(db, 'Farmácia');
  await novaMov(db, {
    descricao: 'Compra mista', valor_centavos: 10000, conta_id: a.id,
    divisoes: [{ categoria_id: mercado.id, valor_centavos: 7000 }, { categoria_id: farmacia.id, valor_centavos: 3000 }],
  });
  assert.equal((await listar(db, { categoria_id: String(alimentacao.id) })).total, 3, 'pai Alimentação: Mercado, Almoço e a dividida');
  const soMercado = await listar(db, { categoria_id: String(mercado.id) });
  assert.equal(soMercado.total, 2);
  assert.equal(soMercado.totais.realizado.despesas, 25000 + 7000, 'a dividida entra só com a parte da categoria');
});

test('listagem: totais separados em realizado e previsto', async () => {
  const db = await bancoComPadroes();
  await massa(db);
  const { totais } = await listar(db);
  assert.deepEqual(totais.realizado, { receitas: 400000, despesas: 28500, resultado: 371500 });
  assert.deepEqual(totais.previsto, { receitas: 0, despesas: 999 });
});

test('dividir entre categorias: soma tem que fechar, mínimo duas partes, categorias do tipo certo', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db);
  const mercado = await categoriaPorNome(db, 'Mercado');
  const salario = await categoriaPorNome(db, 'Salário');
  const parte = (c, v) => ({ categoria_id: c.id, valor_centavos: v });
  await assert.rejects(async () => await novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 600), parte(mercado, 300)] }), (e) => /soma das divisões/.test(e.campos.divisoes));
  await assert.rejects(async () => await novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 1000)] }), (e) => Boolean(e.campos.divisoes));
  await assert.rejects(async () => await novaMov(db, { conta_id: a.id, valor_centavos: 1000, categoria_id: mercado.id, divisoes: [parte(mercado, 500), parte(mercado, 500)] }), (e) => Boolean(e.campos.categoria_id));
  await assert.rejects(async () => await novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 500), parte(salario, 500)] }), (e) => Boolean(e.campos.divisoes));
  const ok = await novaMov(db, { conta_id: a.id, valor_centavos: 1000, divisoes: [parte(mercado, 600), parte(mercado, 400)] });
  assert.equal(ok.categoria_id, null);
  assert.equal(ok.divisoes.length, 2);
});
