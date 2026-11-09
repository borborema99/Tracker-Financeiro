import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { abrirBanco } from '../servidor/banco/pg/conexao.js';
import { migrar } from '../servidor/banco/pg/migrar.js';

// O driver de produção (`postgres`, sem prepared statements, como atrás do pooler do Supabase) falando com um
// Postgres de verdade: o PGlite exposto por socket. Prova que conexao.js, os conversores de tipos e o runner
// funcionam pelo mesmo caminho que a Netlify Function vai usar.
let pglite;
let servidor;
let banco;

before(async () => {
  pglite = await PGlite.create();
  servidor = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1' });
  await servidor.start();
  const url = `postgres://postgres@${servidor.getServerConn()}/postgres?sslmode=disable`;
  banco = abrirBanco(url, { ssl: false });
});

after(async () => {
  await banco.fechar();
  await servidor.stop();
  await pglite.close();
});

test('o driver de produção aplica as migrations e elas ficam idempotentes', async () => {
  const novas = await migrar(banco);
  assert.equal(novas.length, 10);
  assert.deepEqual(await migrar(banco), []);
});

test('o driver devolve bigint como Number, date como texto e timestamptz como ISO', async () => {
  const [u] = await banco.consultar(
    `INSERT INTO usuarios (nome_usuario, senha_hash, criado_em, atualizado_em) VALUES ('driver_a', 'h', $1, $1) RETURNING id`,
    [new Date('2026-06-15T15:00:00Z')],
  );
  assert.equal(typeof u.id, 'number');
  const [c] = await banco.consultar(
    `INSERT INTO contas (usuario_id, nome, tipo, saldo_inicial_centavos, criada_em, atualizada_em)
     VALUES ($1, 'Conta', 'corrente', $2, $3, $3) RETURNING id, saldo_inicial_centavos, criada_em`,
    [u.id, 250_000, '2026-06-15T15:00:00.000Z'],
  );
  assert.equal(typeof c.saldo_inicial_centavos, 'number');
  assert.equal(c.saldo_inicial_centavos, 250_000);
  assert.equal(c.criada_em, '2026-06-15T15:00:00.000Z');
  const [d] = await banco.consultar("SELECT DATE '2026-06-15' AS d");
  assert.equal(d.d, '2026-06-15');
});

test('jsonb com $n::text::jsonb funciona e a leitura volta como objeto', async () => {
  const [u] = await banco.consultar(`SELECT id FROM usuarios WHERE nome_usuario = 'driver_a'`);
  // `$n::jsonb` direto faria o driver serializar o texto de novo (string dentro do jsonb); o passo por text evita.
  await banco.consultar(
    `INSERT INTO audit_log (usuario_id, entidade, entidade_id, acao, depois, criado_em) VALUES ($1, 'conta', '1', 'criar', $2::text::jsonb, now())`,
    [u.id, JSON.stringify({ nome: 'A' })],
  );
  const [linha] = await banco.consultar('SELECT depois FROM audit_log WHERE usuario_id = $1', [u.id]);
  assert.deepEqual(linha.depois, { nome: 'A' });
});

test('transacao desfaz tudo em caso de erro, pelo driver de produção', async () => {
  const [u] = await banco.consultar(`SELECT id FROM usuarios WHERE nome_usuario = 'driver_a'`);
  await assert.rejects(() =>
    banco.transacao(async (tx) => {
      await tx.consultar(`INSERT INTO config (usuario_id, chave, valor) VALUES ($1, 'fuso', 'x')`, [u.id]);
      throw new Error('falhou');
    }),
  );
  const linhas = await banco.consultar('SELECT * FROM config WHERE usuario_id = $1', [u.id]);
  assert.equal(linhas.length, 0);
});

test('violação de chave composta chega ao código como erro 23503', async () => {
  const [a] = await banco.consultar(`SELECT id FROM usuarios WHERE nome_usuario = 'driver_a'`);
  const [b] = await banco.consultar(
    `INSERT INTO usuarios (nome_usuario, senha_hash, criado_em, atualizado_em) VALUES ('driver_b', 'h', now(), now()) RETURNING id`,
  );
  const [contaA] = await banco.consultar('SELECT id FROM contas WHERE usuario_id = $1', [a.id]);
  await assert.rejects(
    () =>
      banco.consultar(
        `INSERT INTO movimentacoes (usuario_id, tipo, valor_centavos, conta_id, data_competencia, status, criada_em, atualizada_em)
         VALUES ($1, 'despesa', 100, $2, '2026-06-01', 'pendente', now(), now())`,
        [b.id, contaA.id],
      ),
    (e) => e.code === '23503',
  );
});
