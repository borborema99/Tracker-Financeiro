import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { dataComoTexto, instanteComoIso, paraNumero, tiposDoDriver } from '../servidor/banco/pg/tipos.js';
import { bancoPgDeTeste, novaContaPg, novoUsuario } from './pg-ajuda.js';

let banco;
before(async () => {
  banco = await bancoPgDeTeste();
});
after(() => banco.fechar());

test('bigint volta como Number, nunca como texto (dinheiro em centavos)', async () => {
  const usuario = await novoUsuario(banco, 'tipos_a');
  const id = await novaContaPg(banco, usuario, 'Conta', 123_456_789);
  const [linha] = await banco.consultar('SELECT id, usuario_id, saldo_inicial_centavos FROM contas WHERE id = $1', [id]);
  assert.equal(typeof linha.saldo_inicial_centavos, 'number');
  assert.equal(linha.saldo_inicial_centavos, 123_456_789);
  assert.equal(typeof linha.id, 'number');
  assert.equal(typeof linha.usuario_id, 'number');
});

test('soma e contagem em bigint também voltam como Number', async () => {
  const [linha] = await banco.consultar('SELECT sum(x)::bigint AS soma, count(*) AS n FROM (VALUES (3000000000::bigint), (4000000000::bigint)) v(x)');
  assert.equal(typeof linha.soma, 'number');
  assert.equal(linha.soma, 7_000_000_000);
  assert.equal(typeof linha.n, 'number');
});

test('bigint fora do limite seguro lança erro em vez de arredondar', () => {
  assert.throws(() => paraNumero('9007199254740993'), /fora do limite seguro/);
  assert.equal(paraNumero('9007199254740991'), 9007199254740991);
});

test('coluna date volta como texto AAAA-MM-DD, nunca como Date', async () => {
  const [linha] = await banco.consultar("SELECT DATE '2026-06-15' AS d");
  assert.equal(typeof linha.d, 'string');
  assert.equal(linha.d, '2026-06-15');
  assert.equal(dataComoTexto('2026-01-31'), '2026-01-31');
});

test('date gravada como texto volta igual, sem deslocar por fuso', async () => {
  const usuario = await novoUsuario(banco, 'tipos_b');
  const conta = await novaContaPg(banco, usuario);
  await banco.consultar(
    `INSERT INTO movimentacoes (usuario_id, tipo, valor_centavos, conta_id, data_competencia, status, criada_em, atualizada_em)
     VALUES ($1, 'despesa', 1000, $2, $3, 'pendente', now(), now())`,
    [usuario, conta, '2026-03-01'],
  );
  const [linha] = await banco.consultar('SELECT data_competencia, data_vencimento FROM movimentacoes WHERE usuario_id = $1', [usuario]);
  assert.equal(linha.data_competencia, '2026-03-01');
  assert.equal(linha.data_vencimento, null);
});

test('timestamptz volta como ISO em UTC', async () => {
  const [linha] = await banco.consultar("SELECT TIMESTAMPTZ '2026-06-15 12:00:00-03' AS t");
  assert.equal(linha.t, '2026-06-15T15:00:00.000Z');
});

test('instanteComoIso entende os formatos do Postgres', () => {
  assert.equal(instanteComoIso('2026-06-15 15:00:00+00'), '2026-06-15T15:00:00.000Z');
  assert.equal(instanteComoIso('2026-06-15 12:00:00.5-03'), '2026-06-15T15:00:00.500Z');
  assert.equal(instanteComoIso('2026-06-15T15:00:00Z'), '2026-06-15T15:00:00.000Z');
  assert.equal(instanteComoIso('2026-06-15 15:30:00+05:30'), '2026-06-15T10:00:00.000Z');
  assert.throws(() => instanteComoIso('ontem'), /Instante inválido/);
});

test('o driver de produção usa os mesmos conversores do PGlite', () => {
  assert.equal(tiposDoDriver.inteiro_seguro.parse('42'), 42);
  assert.throws(() => tiposDoDriver.inteiro_seguro.parse('9007199254740993'));
  assert.equal(tiposDoDriver.data_texto.parse('2026-06-15'), '2026-06-15');
  assert.equal(tiposDoDriver.instante_iso.parse('2026-06-15 15:00:00+00'), '2026-06-15T15:00:00.000Z');
  assert.equal(tiposDoDriver.instante_iso.serialize(new Date('2026-06-15T15:00:00Z')), '2026-06-15T15:00:00.000Z');
});

test('jsonb gravado como texto volta como objeto', async () => {
  const usuario = await novoUsuario(banco, 'tipos_c');
  await banco.consultar(
    `INSERT INTO audit_log (usuario_id, entidade, entidade_id, acao, antes, depois, criado_em)
     VALUES ($1, 'conta', '1', 'editar', $2::text::jsonb, $3::text::jsonb, now())`,
    [usuario, JSON.stringify({ nome: 'A' }), JSON.stringify({ nome: 'B' })],
  );
  const [linha] = await banco.consultar('SELECT antes, depois FROM audit_log WHERE usuario_id = $1', [usuario]);
  assert.deepEqual(linha.antes, { nome: 'A' });
  assert.deepEqual(linha.depois, { nome: 'B' });
});
