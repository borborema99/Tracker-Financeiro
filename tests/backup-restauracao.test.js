import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fazerBackup } from '../scripts/backup.js';
import { conferirBackup, restaurarBanco } from '../scripts/lib/restauracao.js';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { migrar } from '../servidor/banco/migrar.js';
import { criarRecorrencia } from '../servidor/banco/repositorios/recorrencias.js';
import { semearPadroes } from '../servidor/banco/padroes.js';
import { listarContas } from '../servidor/banco/repositorios/contas.js';
import { conferirSenha, definirSenha } from '../servidor/seguranca/senha.js';
import { CTX, novaConta, novaCompra, novaMov, novoCartao } from './ajuda.js';

const abertos = new Set();

/** Abre o banco e lembra dele: no Windows a pasta temporária só some depois que todo banco é fechado. */
function abrir(caminho) {
  const db = abrirBanco(caminho);
  abertos.add(db);
  return db;
}

function pastaTemporaria(t) {
  const pasta = mkdtempSync(join(tmpdir(), 'tracker-teste-'));
  t.after(() => {
    for (const db of abertos) if (db.open) db.close();
    abertos.clear();
    rmSync(pasta, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 }); // o Windows solta o arquivo com atraso
  });
  return pasta;
}

/** Banco em arquivo (como o de verdade) com dados de todos os módulos. */
async function bancoPopulado(caminho) {
  const db = abrir(caminho);
  migrar(db);
  semearPadroes(db);
  await definirSenha(db, 'senha-de-teste-123');
  const conta = novaConta(db, 'Corrente', 100000);
  novaMov(db, { conta_id: conta.id, valor_centavos: 2500, descricao: 'Mercado' });
  novaMov(db, { conta_id: conta.id, status: 'pendente', data_vencimento: '2026-06-20', descricao: 'Luz' });
  novaCompra(db, novoCartao(db), { valor_total_centavos: 9000, parcelas_total: 3 });
  criarRecorrencia(
    db,
    { tipo: 'despesa', descricao: 'Aluguel', valor_centavos: 50000, conta_id: conta.id, categoria_id: null, frequencia: 'mensal', data_inicio: '2026-06-15', data_fim: null, ativa: true, observacao: '' },
    CTX,
  );
  return db;
}

const contagens = (db) =>
  Object.fromEntries(
    ['contas', 'movimentacoes', 'compras_cartao', 'parcelas_cartao', 'faturas', 'recorrencias', 'audit_log'].map((t) => [
      t,
      db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n,
    ]),
  );
const saldos = (db) => listarContas(db).map((c) => [c.nome, c.saldo_centavos]);

test('backup: gera um arquivo íntegro e completo, com o banco aberto e em uso', async (t) => {
  const pasta = pastaTemporaria(t);
  const db = await bancoPopulado(join(pasta, 'data', 'tracker.db'));

  const destino = await fazerBackup(db, 'tracker', join(pasta, 'backups'));
  assert.ok(existsSync(destino));
  assert.match(destino, /tracker-\d{4}-\d{2}-\d{2}_\d{6}\.db$/);
  conferirBackup(destino); // não lança

  const copia = abrir(destino);
  assert.deepEqual(contagens(copia), contagens(db));
  assert.deepEqual(saldos(copia), saldos(db));
  copia.close();
});

test('restaurar: volta exatamente ao estado do backup, guarda o banco atual e mantém a senha', async (t) => {
  const pasta = pastaTemporaria(t);
  const caminho = join(pasta, 'data', 'tracker.db');
  const pastaBackups = join(pasta, 'backups');
  const db = await bancoPopulado(caminho);
  const backup = await fazerBackup(db, 'tracker', pastaBackups);
  const antes = { contagens: contagens(db), saldos: saldos(db) };

  // Depois do backup o usuário "estraga" tudo: novo lançamento e conta nova.
  const extra = novaConta(db, 'Conta que não existia no backup', 5);
  novaMov(db, { conta_id: extra.id, valor_centavos: 777 });
  assert.notDeepEqual(contagens(db), antes.contagens);
  db.close();

  const guardada = await restaurarBanco({ origem: backup, caminhoBanco: caminho, pastaBackups });
  assert.match(guardada, /antes-de-restaurar-.*\.db$/);

  const restaurado = abrir(caminho);
  assert.deepEqual(contagens(restaurado), antes.contagens);
  assert.deepEqual(saldos(restaurado), antes.saldos);
  assert.equal(restaurado.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(await conferirSenha(restaurado, 'senha-de-teste-123'), true);

  // A cópia de segurança do estado "estragado" existe e tem o que foi perdido.
  const seguranca = abrir(guardada);
  assert.ok(listarContas(seguranca).some((c) => c.nome === 'Conta que não existia no backup'));
  seguranca.close();
});

test('restaurar: um backup de esquema antigo é aceito e o migrar o atualiza sem perder dados', async (t) => {
  const pasta = pastaTemporaria(t);
  const antigo = join(pasta, 'migrations-antigas');
  mkdirSync(antigo);
  const todas = new URL('../servidor/banco/migrations/', import.meta.url);
  for (const f of readdirSync(todas).filter((n) => /^00[123]_/.test(n))) {
    copyFileSync(new URL(f, todas), join(antigo, f));
  }

  const caminho = join(pasta, 'data', 'tracker.db');
  const velho = abrir(join(pasta, 'velho.db'));
  migrar(velho, antigo); // só as migrations 001 a 003
  semearPadroes(velho);
  // Direto no SQL: o código atual já lê e grava tabelas e colunas que o esquema antigo não tem.
  const conta = {
    id: Number(
      velho
        .prepare(
          `INSERT INTO contas (nome, tipo, saldo_inicial_centavos, criada_em, atualizada_em)
           VALUES ('Corrente', 'corrente', 1234, 'a', 'a')`,
        )
        .run().lastInsertRowid,
    ),
  };
  velho
    .prepare(
      `INSERT INTO movimentacoes (tipo, descricao, valor_centavos, conta_id, data_competencia, data_liquidacao, status,
         criada_em, atualizada_em)
       VALUES ('despesa', 'Antiga', 100, ?, '2026-06-10', '2026-06-10', 'liquidada', 'a', 'a')`,
    )
    .run(conta.id);
  velho.close();

  await restaurarBanco({ origem: join(pasta, 'velho.db'), caminhoBanco: caminho, pastaBackups: join(pasta, 'backups') });
  const db = abrir(caminho);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'recorrencias'").get(), undefined);
  assert.deepEqual(migrar(db), ['004_compromissos.sql', '005_planejamento.sql', '006_dividas_assinaturas.sql', '007_investimentos.sql']);
  assert.deepEqual(saldos(db), [['Corrente', 1234 - 100]]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recorrencias').get().n, 0);
});

test('restaurar: arquivo que não é do sistema ou não é um banco é recusado e o banco atual fica intacto', async (t) => {
  const pasta = pastaTemporaria(t);
  const caminho = join(pasta, 'data', 'tracker.db');
  const db = await bancoPopulado(caminho);
  const antes = contagens(db);
  db.close();
  const pastaBackups = join(pasta, 'backups');

  const outro = abrir(join(pasta, 'outro.db'));
  outro.exec('CREATE TABLE qualquer (x)');
  outro.close();
  await assert.rejects(restaurarBanco({ origem: join(pasta, 'outro.db'), caminhoBanco: caminho, pastaBackups }), /não é um backup/);

  writeFileSync(join(pasta, 'lixo.db'), 'isto não é um banco sqlite, é só texto suficiente para ter mais de cem bytes '.repeat(5));
  await assert.rejects(restaurarBanco({ origem: join(pasta, 'lixo.db'), caminhoBanco: caminho, pastaBackups }));

  assert.ok(!existsSync(pastaBackups), 'nada foi guardado porque nada foi trocado');
  const intacto = abrir(caminho);
  assert.deepEqual(contagens(intacto), antes);
  intacto.close();
  assert.ok(readFileSync(caminho).length > 0);
});

test('restaurar: sem banco atual (instalação nova) só copia o backup', async (t) => {
  const pasta = pastaTemporaria(t);
  const origemDb = await bancoPopulado(join(pasta, 'origem.db'));
  const backup = await fazerBackup(origemDb, 'tracker', join(pasta, 'backups'));
  origemDb.close();

  const destino = join(pasta, 'novo', 'tracker.db');
  mkdirSync(join(pasta, 'novo'));
  const guardada = await restaurarBanco({ origem: backup, caminhoBanco: destino, pastaBackups: join(pasta, 'backups') });
  assert.equal(guardada, null);
  const db = abrir(destino);
  assert.equal(listarContas(db).length, 1);
  db.close();
});
