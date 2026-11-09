import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { migrar } from '../servidor/banco/pg/migrar.js';
import { abrirBancoLocal } from '../servidor/banco/pg/pglite.js';

let pasta;
before(() => {
  pasta = mkdtempSync(join(tmpdir(), 'mig-pg-'));
});
after(() => rmSync(pasta, { recursive: true, force: true }));

function pastaCom(arquivos) {
  const dir = mkdtempSync(join(pasta, 'm-'));
  for (const [nome, sql] of Object.entries(arquivos)) writeFileSync(join(dir, nome), sql);
  return dir;
}

test('migrar aplica as migrations reais uma única vez (idempotente)', async () => {
  const banco = await abrirBancoLocal();
  const primeira = await migrar(banco);
  assert.ok(primeira.includes('001_base.sql'));
  assert.ok(primeira.includes('010_seguranca_rls.sql'));
  assert.deepEqual(await migrar(banco), []);
  const [{ n }] = await banco.consultar('SELECT count(*)::int AS n FROM schema_migrations');
  assert.equal(n, primeira.length);
  await banco.fechar();
});

test('migrar recusa migration alterada depois de aplicada', async () => {
  const dir = pastaCom({ '001_a.sql': 'CREATE TABLE a (id integer);' });
  const banco = await abrirBancoLocal();
  await migrar(banco, dir);
  writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id integer, x text);');
  await assert.rejects(() => migrar(banco, dir), /foi alterada/);
  await banco.fechar();
});

test('o checksum ignora a diferença entre CRLF e LF', async () => {
  const dir = pastaCom({ '001_a.sql': 'CREATE TABLE a (id integer);\n-- fim\n' });
  const banco = await abrirBancoLocal();
  await migrar(banco, dir);
  writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id integer);\r\n-- fim\r\n');
  assert.deepEqual(await migrar(banco, dir), []);
  await banco.fechar();
});

test('migrar desfaz a migration inteira se um comando falhar', async () => {
  const dir = pastaCom({ '001_ruim.sql': 'CREATE TABLE b (id integer); CREATE TABLE b (id integer);' });
  const banco = await abrirBancoLocal();
  await assert.rejects(() => migrar(banco, dir));
  const [{ existe }] = await banco.consultar("SELECT to_regclass('public.b') IS NOT NULL AS existe");
  assert.equal(existe, false);
  const [{ n }] = await banco.consultar('SELECT count(*)::int AS n FROM schema_migrations');
  assert.equal(n, 0);
  await banco.fechar();
});

test('uma migration nova é aplicada sem refazer as antigas', async () => {
  const dir = pastaCom({ '001_a.sql': 'CREATE TABLE a (id integer);' });
  const banco = await abrirBancoLocal();
  assert.deepEqual(await migrar(banco, dir), ['001_a.sql']);
  writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (id integer);');
  assert.deepEqual(await migrar(banco, dir), ['002_b.sql']);
  await banco.fechar();
});

test('transacao desfaz tudo quando a função lança erro', async () => {
  const banco = await abrirBancoLocal();
  await banco.executar('CREATE TABLE t (n integer)');
  await assert.rejects(() =>
    banco.transacao(async (tx) => {
      await tx.consultar('INSERT INTO t VALUES (1)');
      throw new Error('falhou');
    }),
  );
  const [{ n }] = await banco.consultar('SELECT count(*)::int AS n FROM t');
  assert.equal(n, 0);
  await banco.fechar();
});
