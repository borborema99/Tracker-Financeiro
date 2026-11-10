import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { carimbo, gravarBackup } from '../scripts/backup.js';
import { montarBackup, restaurarBackup } from '../scripts/lib/copia.js';
import { criarArmazenamentoMemoria } from '../servidor/armazenamento/index.js';
import { criarEscopo } from '../servidor/banco/pg/escopo.js';
import { anexarArquivo, listarAnexos, obterArquivo } from '../servidor/banco/repositorios/anexos.js';
import { listarContas } from '../servidor/banco/repositorios/contas.js';
import { criarRecorrencia } from '../servidor/banco/repositorios/recorrencias.js';
import { CTX, banco, novaConta, novaCompra, novaMov, novoCartao, novoUsuarioDeTeste } from './ajuda.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('comprovante-do-backup')]);
const TABELAS = ['contas', 'movimentacoes', 'compras_cartao', 'parcelas_cartao', 'faturas', 'recorrencias', 'anexos'];

/** Usuário com dados de todos os módulos e um comprovante no armazenamento. */
async function usuarioPopulado(armazenamento) {
  const id = await novoUsuarioDeTeste();
  const db = criarEscopo(banco, id);
  const conta = await novaConta(db, 'Corrente', 100000);
  const mov = await novaMov(db, { conta_id: conta.id, valor_centavos: 2500, descricao: 'Mercado' });
  await novaMov(db, { conta_id: conta.id, status: 'pendente', data_vencimento: '2026-06-20', descricao: 'Luz' });
  await novaCompra(db, await novoCartao(db), { valor_total_centavos: 9000, parcelas_total: 3 });
  await criarRecorrencia(
    db,
    { tipo: 'despesa', descricao: 'Aluguel', valor_centavos: 50000, conta_id: conta.id, categoria_id: null, frequencia: 'mensal', data_inicio: '2026-06-15', data_fim: null, ativa: true, observacao: '' },
    CTX,
  );
  await anexarArquivo(db, armazenamento, mov.id, { nome: 'recibo.png', conteudo: PNG }, CTX);
  return { id, db, conta };
}

// Em sequência de propósito: o banco de teste usa SAVEPOINTs, que não aceitam comandos intercalados.
async function contagens(db) {
  const resultado = {};
  for (const t of TABELAS) resultado[t] = (await db.um(`SELECT COUNT(*) AS n FROM ${t} WHERE usuario_id = :u`, [])).n;
  return resultado;
}
const saldos = async (db) => (await listarContas(db)).map((c) => [c.nome, c.saldo_centavos]);

test('backup: o JSON traz tudo do usuário e os comprovantes em base64, sem senha nem sessão', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id, db } = await usuarioPopulado(arm);
  const outro = criarEscopo(banco, await novoUsuarioDeTeste());
  await novaConta(outro, 'Conta de outra pessoa', 1);

  const backup = await montarBackup(banco, arm, id, CTX.agora);
  assert.equal(backup.sistema, 'tracker-financeiro');
  assert.equal(backup.dados.contas.length, 1, 'só as contas deste usuário');
  assert.equal(backup.dados.movimentacoes.length, (await contagens(db)).movimentacoes);
  assert.ok(backup.dados.movimentacoes.length >= 2);
  const [anexo] = backup.dados.anexos;
  assert.equal(Buffer.from(backup.arquivos[anexo.id], 'base64').equals(PNG), true);
  assert.equal('caminho_storage' in anexo, false, 'o caminho do storage não vai no arquivo');
  assert.deepEqual(backup.anexos_sem_arquivo, []);
  assert.doesNotMatch(JSON.stringify(backup), /scrypt|senha_hash|sessoes|tentativas/);
  assert.deepEqual(await contagens(db), { ...(await contagens(db)), contas: 1 });
});

test('backup: comprovante que sumiu do storage é listado em anexos_sem_arquivo, sem derrubar o backup', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id } = await usuarioPopulado(arm);
  for (const caminho of arm.caminhos()) await arm.apagar(caminho);
  const backup = await montarBackup(banco, arm, id, CTX.agora);
  assert.equal(backup.anexos_sem_arquivo.length, 1);
  assert.deepEqual(backup.arquivos, {});
});

test('restaurar: volta exatamente ao estado do backup e leva os comprovantes', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id, db } = await usuarioPopulado(arm);
  const backup = await montarBackup(banco, arm, id, CTX.agora);
  const antes = { contagens: await contagens(db), saldos: await saldos(db) };

  // Depois do backup a pessoa "estraga" tudo.
  const extra = await novaConta(db, 'Conta que não existia no backup', 5);
  await novaMov(db, { conta_id: extra.id, valor_centavos: 777 });
  assert.notDeepEqual(await contagens(db), antes.contagens);
  const objetoAntigo = arm.caminhos()[0];

  const resultado = await restaurarBackup(banco, arm, id, JSON.parse(JSON.stringify(backup)));
  assert.equal(resultado.comprovantes, 1);
  assert.deepEqual(await contagens(db), antes.contagens);
  assert.deepEqual(await saldos(db), antes.saldos);

  const mov = await db.um("SELECT id FROM movimentacoes WHERE descricao = 'Mercado' AND usuario_id = :u", []);
  const [anexo] = await listarAnexos(db, mov.id);
  const { conteudo } = await obterArquivo(db, arm, anexo.id);
  assert.ok(conteudo.equals(PNG), 'o comprovante voltou');
  assert.equal(arm.caminhos().includes(objetoAntigo), false, 'o objeto antigo foi apagado depois do commit');
  assert.equal(arm.caminhos().length, 1);
  assert.match(arm.caminhos()[0], new RegExp(`^${id}/`));
});

test('restaurar: sequências não voltam atrás, então o próximo lançamento não colide com os restaurados', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id, db, conta } = await usuarioPopulado(arm);
  const backup = await montarBackup(banco, arm, id, CTX.agora);
  await restaurarBackup(banco, arm, id, backup);
  const nova = await novaMov(db, { conta_id: conta.id, valor_centavos: 1, descricao: 'Depois da restauração' });
  const maiorDoBackup = Math.max(...backup.dados.movimentacoes.map((m) => m.id));
  assert.ok(nova.id > maiorDoBackup);
});

test('restaurar: não mexe nos dados de outro usuário', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id } = await usuarioPopulado(arm);
  const outra = await usuarioPopulado(arm);
  const antesDela = { contagens: await contagens(outra.db), saldos: await saldos(outra.db) };
  const backup = await montarBackup(banco, arm, id, CTX.agora);

  await restaurarBackup(banco, arm, id, backup);

  assert.deepEqual(await contagens(outra.db), antesDela.contagens);
  assert.deepEqual(await saldos(outra.db), antesDela.saldos);
  const [anexo] = await listarAnexos(outra.db, (await outra.db.um('SELECT id FROM movimentacoes WHERE usuario_id = :u', [])).id);
  assert.ok(await arm.ler((await outra.db.um('SELECT caminho_storage FROM anexos WHERE id = ? AND usuario_id = :u', [anexo.id])).caminho_storage));
});

test('restaurar: id que já existe em outro usuário aborta tudo, sem trocar nada e sem deixar objeto órfão', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id, db } = await usuarioPopulado(arm);
  const backupDele = await montarBackup(banco, arm, id, CTX.agora);
  const destino = await usuarioPopulado(arm); // outro usuário no mesmo banco: os ids do backup já são do primeiro
  const antes = await contagens(destino.db);
  const objetos = arm.caminhos().length;

  await assert.rejects(async () => await restaurarBackup(banco, arm, destino.id, backupDele));

  assert.deepEqual(await contagens(destino.db), antes, 'nada foi apagado do destino');
  assert.equal(arm.caminhos().length, objetos, 'o comprovante enviado antes foi desfeito');
  assert.equal((await contagens(db)).contas, 1);
});

test('restaurar: esquema diferente e arquivo que não é do sistema são recusados antes de tocar em qualquer coisa', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id, db } = await usuarioPopulado(arm);
  const antes = await contagens(db);
  const backup = await montarBackup(banco, arm, id, CTX.agora);

  await assert.rejects(
    async () => await restaurarBackup(banco, arm, id, { ...backup, versao_do_esquema: '000_antigo.sql' }),
    /versão de esquema 000_antigo\.sql/,
  );
  await assert.rejects(async () => await restaurarBackup(banco, arm, id, { qualquer: 1 }), /não é um backup/);
  await assert.rejects(async () => await restaurarBackup(banco, arm, id, null), /não é um backup/);
  assert.deepEqual(await contagens(db), antes);
});

test('restaurar: comprovante sem arquivo no backup fica registrado como removido e conta em semArquivo', async () => {
  const arm = criarArmazenamentoMemoria();
  const { id, db } = await usuarioPopulado(arm);
  const backup = await montarBackup(banco, arm, id, CTX.agora);
  backup.arquivos = {};
  const resultado = await restaurarBackup(banco, arm, id, backup);
  assert.equal(resultado.semArquivo, 1);
  assert.equal(resultado.comprovantes, 0);
  const linha = await db.um('SELECT caminho_storage, excluido_em FROM anexos WHERE usuario_id = :u', []);
  assert.equal(linha.caminho_storage, null);
  assert.ok(linha.excluido_em);
  assert.equal(arm.caminhos().length, 0);
});

test('backup em arquivo: nome com usuário e carimbo, permissão restrita e conteúdo íntegro', async (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'tracker-backup-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 }));
  const arm = criarArmazenamentoMemoria();
  const { id } = await usuarioPopulado(arm);
  const backup = await montarBackup(banco, arm, id, CTX.agora);

  const destino = gravarBackup(backup, 'maria', join(pasta, 'backups'));
  assert.ok(existsSync(destino));
  assert.match(destino, /maria-\d{4}-\d{2}-\d{2}_\d{6}\.json$/);
  assert.match(carimbo(new Date(2026, 5, 15, 9, 8, 7)), /^2026-06-15_090807$/);
  if (process.platform !== 'win32') assert.equal(statSync(destino).mode & 0o077, 0, 'só o dono lê');
  assert.deepEqual(JSON.parse(readFileSync(destino, 'utf8')).dados.contas.length, 1);
});
