import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditar } from '../servidor/banco/auditoria.js';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { migrar } from '../servidor/banco/migrar.js';

test('migrar aplica as migrations uma única vez (idempotente)', () => {
  const db = abrirBanco(':memory:');
  const primeira = migrar(db);
  assert.ok(primeira.includes('001_base.sql'));
  assert.deepEqual(migrar(db), []);
  const linhas = db.prepare('SELECT versao FROM schema_migrations').all();
  assert.equal(linhas.length, primeira.length);
  db.close();
});

test('migrar recusa migration alterada depois de aplicada', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'mig-'));
  try {
    writeFileSync(join(pasta, '001_a.sql'), 'CREATE TABLE a (id INTEGER);');
    const db = abrirBanco(':memory:');
    migrar(db, pasta);
    writeFileSync(join(pasta, '001_a.sql'), 'CREATE TABLE a (id INTEGER, x TEXT);');
    assert.throws(() => migrar(db, pasta), /foi alterada/);
    db.close();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('migrar desfaz a migration inteira se um comando falhar', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'mig-'));
  try {
    writeFileSync(join(pasta, '001_ruim.sql'), 'CREATE TABLE b (id INTEGER); CREATE TABLE b (id INTEGER);');
    const db = abrirBanco(':memory:');
    assert.throws(() => migrar(db, pasta));
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'b'").get(), undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 0);
    db.close();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('o banco liga foreign_keys e WAL (arquivo) e busy_timeout', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'db-'));
  try {
    const db = abrirBanco(join(pasta, 'x.db'));
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);
    db.close();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('auditar grava o valor antes e depois como JSON', () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  auditar(db, { entidade: 'conta', id: 7, acao: 'editar', antes: { nome: 'A' }, depois: { nome: 'B' } });
  auditar(db, { entidade: 'conta', id: 7, acao: 'criar', depois: { nome: 'A' } });
  const [criar, editar] = db.prepare('SELECT * FROM audit_log ORDER BY id DESC').all();
  assert.equal(criar.acao, 'criar');
  assert.equal(criar.antes, null);
  assert.deepEqual(JSON.parse(criar.depois), { nome: 'A' });
  assert.deepEqual(JSON.parse(editar.antes), { nome: 'A' });
  assert.deepEqual(JSON.parse(editar.depois), { nome: 'B' });
  assert.equal(editar.entidade_id, '7');
  assert.match(editar.criado_em, /Z$/);
  db.close();
});
