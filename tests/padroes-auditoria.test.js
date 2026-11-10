import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TIPOS_CONTA } from '../contratos/contas.js';
import { auditar } from '../servidor/banco/auditoria.js';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, semearPadroes } from '../servidor/banco/padroes.js';
import { listarCategorias } from '../servidor/banco/repositorios/categorias.js';
import { criarConta } from '../servidor/banco/repositorios/contas.js';
import { CTX, bancoComPadroes, categoriaPorNome } from './ajuda.js';

const totalDosPadroes = () =>
  [CATEGORIAS_DESPESA, CATEGORIAS_RECEITA].reduce(
    (soma, grupo) => soma + Object.entries(grupo).reduce((n, [, filhas]) => n + 1 + filhas.length, 0),
    0,
  );

test('auditar grava o valor antes e depois e o usuário dono do registro', async () => {
  const db = await bancoComPadroes();
  await auditar(db, { entidade: 'conta', id: 7, acao: 'editar', antes: { nome: 'A' }, depois: { nome: 'B' } });
  await auditar(db, { entidade: 'conta', id: 7, acao: 'criar', depois: { nome: 'A' } });
  const [criar, editar] = await db.todos("SELECT * FROM audit_log WHERE entidade = 'conta' AND usuario_id = :u ORDER BY id DESC");
  assert.equal(criar.acao, 'criar');
  assert.equal(criar.antes, null);
  assert.deepEqual(criar.depois, { nome: 'A' });
  assert.deepEqual(editar.antes, { nome: 'A' });
  assert.deepEqual(editar.depois, { nome: 'B' });
  assert.equal(editar.entidade_id, '7');
  assert.ok(editar.criado_em);
  assert.equal(editar.usuario_id, criar.usuario_id);
});

test('um usuário novo já nasce com as categorias padrão, sem repetir nome sob o mesmo pai, e a semente é idempotente', async () => {
  const db = await bancoComPadroes();
  const categorias = await listarCategorias(db);
  assert.equal(categorias.length, totalDosPadroes());
  const chaves = new Set(categorias.map((c) => `${c.tipo}|${c.pai_id ?? ''}|${c.nome}`));
  assert.equal(chaves.size, categorias.length);
  assert.equal((await categoriaPorNome(db, 'Tarifas bancárias')).papel, 'tarifa');

  assert.equal(await semearPadroes(db), false, 'já semeado: não faz nada');
  assert.equal((await listarCategorias(db)).length, categorias.length);
});

test('a semente recria a lista inteira quando o usuário não tem categoria nenhuma', async () => {
  const db = await bancoComPadroes();
  await db.rodar('DELETE FROM categorias WHERE usuario_id = :u');
  await db.rodar("DELETE FROM config WHERE chave = 'padroes_semeados' AND usuario_id = :u");
  assert.equal((await listarCategorias(db)).length, 0);
  assert.equal(await semearPadroes(db), true);
  assert.equal((await listarCategorias(db)).length, totalDosPadroes());
});

test('os sete tipos de conta valem no banco e no contrato; outro tipo é recusado pelo banco', async () => {
  const db = await bancoComPadroes();
  assert.deepEqual(TIPOS_CONTA, ['corrente', 'poupanca', 'carteira', 'investimento', 'digital', 'beneficio', 'outro']);
  for (const tipo of TIPOS_CONTA) {
    const c = await criarConta(db, { nome: `Conta ${tipo}`, tipo, saldo_inicial_centavos: 0, arquivada: false }, CTX);
    assert.equal(c.tipo, tipo);
  }
  await assert.rejects(
    async () =>
      await db.rodar("INSERT INTO contas (usuario_id, nome, tipo, criada_em, atualizada_em) VALUES (:u, 'x', 'cripto', now(), now())"),
    /check|violates/i,
  );
});
