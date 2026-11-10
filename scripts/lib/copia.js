import { randomUUID } from 'node:crypto';
import { criarEscopo } from '../../servidor/banco/pg/escopo.js';
import { TABELAS_DA_COPIA, copiaCompleta } from '../../servidor/banco/repositorios/exportacao.js';

// Backup e restauração de UM usuário (ADR 013): um arquivo JSON com os dados da conta e os comprovantes em base64.
// O JSON não leva senha nem sessões; quem restaura escolhe o usuário de destino.

/** Tabelas sem coluna `id` (a sequência não precisa ser acertada). */
const SEM_ID = new Set(['recorrencias_puladas']);

export async function montarBackup(banco, armazenamento, usuarioId, agora = new Date()) {
  const copia = await copiaCompleta(criarEscopo(banco, usuarioId), agora, { comCaminhos: true });
  const arquivos = {};
  const ausentes = [];
  for (const anexo of copia.dados.anexos) {
    if (!anexo.caminho_storage) continue;
    const conteudo = await armazenamento.ler(anexo.caminho_storage);
    if (conteudo) arquivos[anexo.id] = conteudo.toString('base64');
    else ausentes.push(anexo.id);
  }
  for (const anexo of copia.dados.anexos) delete anexo.caminho_storage; // o caminho antigo não vale no destino
  return { ...copia, arquivos, anexos_sem_arquivo: ausentes };
}

function conferir(backup) {
  if (backup?.sistema !== 'tracker-financeiro' || typeof backup.dados !== 'object' || !backup.dados) {
    throw new Error('o arquivo não é um backup do Tracker Financeiro');
  }
}

/**
 * Substitui TODOS os dados do usuário pelos do backup. Os ids originais são mantidos (ficam no mesmo banco, onde as
 * sequências nunca reusam ids); se o destino for outro banco e algum id já existir, a transação inteira é desfeita
 * e nada muda. Comprovantes sobem para o armazenamento antes e saem do armazenamento antigo depois do commit.
 */
export async function restaurarBackup(banco, armazenamento, usuarioId, backup) {
  conferir(backup);
  const [{ v: versaoAtual }] = await banco.consultar('SELECT MAX(versao) AS v FROM schema_migrations');
  if (backup.versao_do_esquema !== versaoAtual) {
    throw new Error(
      `o backup é da versão de esquema ${backup.versao_do_esquema} e o banco está na ${versaoAtual}; ` +
        'restaure num banco com o mesmo esquema',
    );
  }

  const antigos = (
    await banco.consultar('SELECT caminho_storage FROM anexos WHERE usuario_id = $1 AND caminho_storage IS NOT NULL', [
      usuarioId,
    ])
  ).map((l) => l.caminho_storage);

  // Comprovantes primeiro: se algum falhar, nada do banco foi tocado.
  const novos = [];
  const anexos = [];
  let semArquivo = 0;
  try {
    for (const anexo of backup.dados.anexos ?? []) {
      const base64 = backup.arquivos?.[anexo.id];
      if (anexo.excluido_em || !base64) {
        // Removido (ou sem arquivo no backup): fica registrado como removido, sem objeto.
        if (!anexo.excluido_em) semArquivo += 1;
        anexos.push({ ...anexo, caminho_storage: null, excluido_em: anexo.excluido_em ?? backup.exportado_em });
        continue;
      }
      const caminho = `${usuarioId}/${randomUUID()}`;
      await armazenamento.guardar(caminho, Buffer.from(base64, 'base64'), anexo.tipo_mime);
      novos.push(caminho);
      anexos.push({ ...anexo, caminho_storage: caminho, excluido_em: null });
    }

    await banco.transacao(async (tx) => {
      for (const tabela of [...TABELAS_DA_COPIA].reverse()) {
        await tx.consultar(`DELETE FROM ${tabela} WHERE usuario_id = $1`, [usuarioId]);
      }
      for (const tabela of TABELAS_DA_COPIA) {
        const linhas = (tabela === 'anexos' ? anexos : (backup.dados[tabela] ?? [])).map((l) => ({
          ...l,
          usuario_id: usuarioId,
        }));
        if (linhas.length === 0) continue;
        await tx.consultar(
          `INSERT INTO ${tabela} OVERRIDING SYSTEM VALUE
           SELECT * FROM jsonb_populate_recordset(NULL::${tabela}, $1::text::jsonb)`,
          [JSON.stringify(linhas)],
        );
      }
      // As sequências nunca andam para trás: só sobem quando o backup trouxe ids maiores que o próximo valor.
      for (const tabela of TABELAS_DA_COPIA.filter((t) => !SEM_ID.has(t))) {
        const [{ maior }] = await tx.consultar(`SELECT MAX(id) AS maior FROM ${tabela}`);
        if (maior === null) continue;
        const [{ sequencia }] = await tx.consultar('SELECT pg_get_serial_sequence($1, $2) AS sequencia', [tabela, 'id']);
        const [{ proximo }] = await tx.consultar('SELECT nextval($1::regclass) AS proximo', [sequencia]);
        if (Number(proximo) <= Number(maior)) await tx.consultar('SELECT setval($1::regclass, $2)', [sequencia, maior]);
      }
    });
  } catch (erro) {
    for (const caminho of novos) await armazenamento.apagar(caminho).catch(() => {});
    throw erro;
  }

  for (const caminho of antigos) await armazenamento.apagar(caminho).catch(() => {});
  return { tabelas: TABELAS_DA_COPIA.length, comprovantes: novos.length, semArquivo };
}
