import assert from 'node:assert/strict';
import { test } from 'node:test';
import { semearPadroes } from '../servidor/banco/padroes.js';
import { atualizarConta, criarConta, listarContas } from '../servidor/banco/repositorios/contas.js';
import {
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  listarCategorias,
} from '../servidor/banco/repositorios/categorias.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaConta, novaMov } from './ajuda.js';

test('padrões: categorias padrão são criadas uma vez, em dois níveis, com a de tarifas marcada', async () => {
  const db = await bancoComPadroes();
  const antes = (await listarCategorias(db)).length;
  assert.ok(antes > 30);
  assert.equal(await semearPadroes(db), false, 'segunda chamada não faz nada');
  assert.equal((await listarCategorias(db)).length, antes);
  const mercado = await categoriaPorNome(db, 'Mercado');
  assert.equal(mercado.pai_id, (await categoriaPorNome(db, 'Alimentação')).id);
  assert.equal((await categoriaPorNome(db, 'Tarifas bancárias')).papel, 'tarifa');
  assert.ok((await db.um("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'categoria'", [])).n >= antes);
});

test('padrões: depois de editadas, a semente não volta a recriar', async () => {
  const db = await bancoComPadroes();
  const m = await categoriaPorNome(db, 'Mercado');
  await atualizarCategoria(db, m.id, { nome: 'Supermercado', tipo: 'despesa', pai_id: m.pai_id, arquivada: false });
  await semearPadroes(db);
  assert.equal(await categoriaPorNome(db, 'Mercado'), undefined);
  assert.ok(await categoriaPorNome(db, 'Supermercado'));
});

test('contas: criar, editar, arquivar, nome único e saldo calculado', async () => {
  const db = await bancoComPadroes();
  const c = await criarConta(db, { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 5000, arquivada: false });
  assert.equal(c.saldo_centavos, 5000);
  await assert.rejects(async () => await criarConta(db, { nome: 'corrente', tipo: 'poupanca', saldo_inicial_centavos: 0, arquivada: false }), (e) => Boolean(e.campos.nome));
  const arq = await atualizarConta(db, c.id, { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 5000, arquivada: true });
  assert.equal(arq.arquivada, true);
  assert.equal((await listarContas(db, { incluirArquivadas: false })).length, 0);
  assert.equal((await listarContas(db)).length, 1);
});

test('contas: conta arquivada não recebe lançamentos novos', async () => {
  const db = await bancoComPadroes();
  const c = await novaConta(db);
  await atualizarConta(db, c.id, { nome: c.nome, tipo: c.tipo, saldo_inicial_centavos: 0, arquivada: true });
  await assert.rejects(async () => await novaMov(db, { conta_id: c.id }), (e) => e.campos.conta_id === 'Esta conta está arquivada.');
});

test('contas: os quatro tipos existem e um tipo desconhecido é recusado pelo banco', async () => {
  const db = await bancoComPadroes();
  for (const tipo of ['corrente', 'poupanca', 'carteira', 'investimento']) await novaConta(db, `C ${tipo}`, 0, tipo);
  await assert.rejects(async () => (await db.rodar("INSERT INTO contas (nome, tipo, criada_em, atualizada_em) VALUES ('x', 'cartao', 'a', 'a')", [])));
});

test('categorias: dois níveis, tipo da filha igual ao do pai, nome único no mesmo nível', async () => {
  const db = await bancoComPadroes();
  const moradia = await categoriaPorNome(db, 'Moradia');
  const salario = await categoriaPorNome(db, 'Salário');
  const nova = await criarCategoria(db, { nome: 'Pet', tipo: 'despesa', pai_id: moradia.id, arquivada: false });
  await assert.rejects(async () => await criarCategoria(db, { nome: 'Neta', tipo: 'despesa', pai_id: nova.id, arquivada: false }), (e) => Boolean(e.campos.pai_id));
  await assert.rejects(async () => await criarCategoria(db, { nome: 'X', tipo: 'despesa', pai_id: salario.id, arquivada: false }), (e) => Boolean(e.campos.pai_id));
  await assert.rejects(async () => await criarCategoria(db, { nome: 'pet', tipo: 'despesa', pai_id: moradia.id, arquivada: false }), (e) => Boolean(e.campos.nome));
  await criarCategoria(db, { nome: 'Pet', tipo: 'despesa', arquivada: false });
});

test('categorias: tipo não muda; categoria com lançamentos ou subcategorias não se exclui; a de tarifas é protegida', async () => {
  const db = await bancoComPadroes();
  const mercado = await categoriaPorNome(db, 'Mercado');
  await assert.rejects(async () => await atualizarCategoria(db, mercado.id, { nome: 'Mercado', tipo: 'receita', pai_id: null, arquivada: false }), (e) => Boolean(e.campos.tipo));
  await assert.rejects(async () => await excluirCategoria(db, (await categoriaPorNome(db, 'Alimentação')).id), (e) => e.statusCode === 409);
  await assert.rejects(async () => await excluirCategoria(db, (await categoriaPorNome(db, 'Tarifas bancárias')).id), (e) => e.statusCode === 409);
  const c = await novaConta(db);
  await novaMov(db, { conta_id: c.id, categoria_id: mercado.id });
  await assert.rejects(async () => await excluirCategoria(db, mercado.id, CTX), (e) => e.statusCode === 409);
  assert.equal((await listarCategorias(db)).find((x) => x.id === mercado.id).usos, 1);
  await excluirCategoria(db, (await categoriaPorNome(db, 'Delivery')).id, CTX);
  assert.equal(await categoriaPorNome(db, 'Delivery'), undefined);
});

test('categorias: o lançamento só aceita categoria do mesmo tipo', async () => {
  const db = await bancoComPadroes();
  const c = await novaConta(db);
  await assert.rejects(async () => await novaMov(db, { conta_id: c.id, tipo: 'despesa', categoria_id: (await categoriaPorNome(db, 'Salário')).id }), (e) => /não é de despesa/.test(e.campos.categoria_id));
});
