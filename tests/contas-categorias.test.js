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

test('padrões: categorias padrão são criadas uma vez, em dois níveis, com a de tarifas marcada', () => {
  const db = bancoComPadroes();
  const antes = listarCategorias(db).length;
  assert.ok(antes > 30);
  assert.equal(semearPadroes(db), false, 'segunda chamada não faz nada');
  assert.equal(listarCategorias(db).length, antes);
  const mercado = categoriaPorNome(db, 'Mercado');
  assert.equal(mercado.pai_id, categoriaPorNome(db, 'Alimentação').id);
  assert.equal(categoriaPorNome(db, 'Tarifas bancárias').papel, 'tarifa');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'categoria'").get().n >= antes);
});

test('padrões: depois de editadas, a semente não volta a recriar', () => {
  const db = bancoComPadroes();
  const m = categoriaPorNome(db, 'Mercado');
  atualizarCategoria(db, m.id, { nome: 'Supermercado', tipo: 'despesa', pai_id: m.pai_id, arquivada: false });
  semearPadroes(db);
  assert.equal(categoriaPorNome(db, 'Mercado'), undefined);
  assert.ok(categoriaPorNome(db, 'Supermercado'));
});

test('contas: criar, editar, arquivar, nome único e saldo calculado', () => {
  const db = bancoComPadroes();
  const c = criarConta(db, { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 5000, arquivada: false });
  assert.equal(c.saldo_centavos, 5000);
  assert.throws(() => criarConta(db, { nome: 'corrente', tipo: 'poupanca', saldo_inicial_centavos: 0, arquivada: false }), (e) => Boolean(e.campos.nome));
  const arq = atualizarConta(db, c.id, { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 5000, arquivada: true });
  assert.equal(arq.arquivada, true);
  assert.equal(listarContas(db, { incluirArquivadas: false }).length, 0);
  assert.equal(listarContas(db).length, 1);
});

test('contas: conta arquivada não recebe lançamentos novos', () => {
  const db = bancoComPadroes();
  const c = novaConta(db);
  atualizarConta(db, c.id, { nome: c.nome, tipo: c.tipo, saldo_inicial_centavos: 0, arquivada: true });
  assert.throws(() => novaMov(db, { conta_id: c.id }), (e) => e.campos.conta_id === 'Esta conta está arquivada.');
});

test('contas: os quatro tipos existem e um tipo desconhecido é recusado pelo banco', () => {
  const db = bancoComPadroes();
  for (const tipo of ['corrente', 'poupanca', 'carteira', 'investimento']) novaConta(db, `C ${tipo}`, 0, tipo);
  assert.throws(() => db.prepare("INSERT INTO contas (nome, tipo, criada_em, atualizada_em) VALUES ('x', 'cartao', 'a', 'a')").run());
});

test('categorias: dois níveis, tipo da filha igual ao do pai, nome único no mesmo nível', () => {
  const db = bancoComPadroes();
  const moradia = categoriaPorNome(db, 'Moradia');
  const salario = categoriaPorNome(db, 'Salário');
  const nova = criarCategoria(db, { nome: 'Pet', tipo: 'despesa', pai_id: moradia.id, arquivada: false });
  assert.throws(() => criarCategoria(db, { nome: 'Neta', tipo: 'despesa', pai_id: nova.id, arquivada: false }), (e) => Boolean(e.campos.pai_id));
  assert.throws(() => criarCategoria(db, { nome: 'X', tipo: 'despesa', pai_id: salario.id, arquivada: false }), (e) => Boolean(e.campos.pai_id));
  assert.throws(() => criarCategoria(db, { nome: 'pet', tipo: 'despesa', pai_id: moradia.id, arquivada: false }), (e) => Boolean(e.campos.nome));
  criarCategoria(db, { nome: 'Pet', tipo: 'despesa', arquivada: false });
});

test('categorias: tipo não muda; categoria com lançamentos ou subcategorias não se exclui; a de tarifas é protegida', () => {
  const db = bancoComPadroes();
  const mercado = categoriaPorNome(db, 'Mercado');
  assert.throws(() => atualizarCategoria(db, mercado.id, { nome: 'Mercado', tipo: 'receita', pai_id: null, arquivada: false }), (e) => Boolean(e.campos.tipo));
  assert.throws(() => excluirCategoria(db, categoriaPorNome(db, 'Alimentação').id), (e) => e.statusCode === 409);
  assert.throws(() => excluirCategoria(db, categoriaPorNome(db, 'Tarifas bancárias').id), (e) => e.statusCode === 409);
  const c = novaConta(db);
  novaMov(db, { conta_id: c.id, categoria_id: mercado.id });
  assert.throws(() => excluirCategoria(db, mercado.id, CTX), (e) => e.statusCode === 409);
  assert.equal(listarCategorias(db).find((x) => x.id === mercado.id).usos, 1);
  excluirCategoria(db, categoriaPorNome(db, 'Delivery').id, CTX);
  assert.equal(categoriaPorNome(db, 'Delivery'), undefined);
});

test('categorias: o lançamento só aceita categoria do mesmo tipo', () => {
  const db = bancoComPadroes();
  const c = novaConta(db);
  assert.throws(() => novaMov(db, { conta_id: c.id, tipo: 'despesa', categoria_id: categoriaPorNome(db, 'Salário').id }), (e) => /não é de despesa/.test(e.campos.categoria_id));
});
