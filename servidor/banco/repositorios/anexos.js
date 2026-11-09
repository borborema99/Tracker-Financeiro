import { createHash } from 'node:crypto';
import { MAXIMO_DE_ANEXOS_POR_LANCAMENTO, TAMANHO_MAXIMO_ANEXO } from '../../../contratos/anexos.js';
import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { detectarTipo, nomeSeguro } from '../../dominio/anexo.js';
import { auditar } from '../auditoria.js';
import { obterMovimentacao } from './movimentacoes.js';

const COLUNAS = 'id, movimentacao_id, nome, tipo_mime, tamanho_bytes, criado_em';

/** Anexos do lançamento (sem o conteúdo), do mais novo ao mais antigo. Null se o lançamento não existe. */
export function listarAnexos(db, movimentacaoId) {
  if (!obterMovimentacao(db, movimentacaoId)) return null;
  return db
    .prepare(`SELECT ${COLUNAS} FROM anexos WHERE movimentacao_id = ? AND excluido_em IS NULL ORDER BY id DESC`)
    .all(movimentacaoId);
}

/**
 * Guarda um comprovante num lançamento (RF-25). O tipo vem dos bytes do arquivo; o tamanho e a quantidade têm
 * limite; o mesmo arquivo não entra duas vezes no mesmo lançamento.
 */
export function anexarArquivo(db, movimentacaoId, { nome, conteudo }, { agora = new Date() }) {
  if (!obterMovimentacao(db, movimentacaoId)) throw naoEncontrado('Lançamento');
  if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) throw invalido({ arquivo: 'Envie um arquivo.' });
  if (conteudo.length > TAMANHO_MAXIMO_ANEXO) {
    throw invalido({ arquivo: `Arquivo grande demais (máx. ${TAMANHO_MAXIMO_ANEXO / 1024 / 1024} MB).` });
  }
  const tipo = detectarTipo(conteudo);
  if (!tipo) throw invalido({ arquivo: 'Tipo de arquivo não aceito. Use PDF, PNG, JPG ou WEBP.' });
  const sha256 = createHash('sha256').update(conteudo).digest('hex');

  return db.transaction(() => {
    const atuais = db
      .prepare('SELECT sha256 FROM anexos WHERE movimentacao_id = ? AND excluido_em IS NULL')
      .all(movimentacaoId);
    if (atuais.length >= MAXIMO_DE_ANEXOS_POR_LANCAMENTO) {
      throw conflito(`Este lançamento já tem ${MAXIMO_DE_ANEXOS_POR_LANCAMENTO} anexos. Remova algum antes.`);
    }
    if (atuais.some((a) => a.sha256 === sha256)) throw conflito('Este arquivo já está anexado neste lançamento.');
    const registro = {
      movimentacao_id: movimentacaoId,
      nome: nomeSeguro(nome, tipo),
      tipo_mime: tipo,
      tamanho_bytes: conteudo.length,
      sha256,
      criado_em: agora.toISOString(),
    };
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO anexos (movimentacao_id, nome, tipo_mime, tamanho_bytes, sha256, criado_em)
         VALUES (@movimentacao_id, @nome, @tipo_mime, @tamanho_bytes, @sha256, @criado_em)`,
      )
      .run(registro);
    const id = Number(lastInsertRowid);
    db.prepare('INSERT INTO anexos_arquivos (anexo_id, conteudo) VALUES (?, ?)').run(id, conteudo);
    auditar(db, { entidade: 'anexo', id, acao: 'criar', depois: registro });
    return db.prepare(`SELECT ${COLUNAS} FROM anexos WHERE id = ?`).get(id);
  })();
}

/** Nome, tipo e conteúdo de um anexo. Null se o anexo foi removido ou se o lançamento foi excluído. */
export function obterArquivo(db, anexoId) {
  const linha = db
    .prepare(
      `SELECT a.nome, a.tipo_mime, f.conteudo
         FROM anexos a
         JOIN anexos_arquivos f ON f.anexo_id = a.id
         JOIN movimentacoes m ON m.id = a.movimentacao_id
        WHERE a.id = ? AND a.excluido_em IS NULL AND m.excluida_em IS NULL`,
    )
    .get(anexoId);
  return linha ?? null;
}

/** Remove o anexo: apaga o conteúdo do banco e mantém o registro e o audit_log. */
export function removerAnexo(db, anexoId, { agora = new Date() }) {
  const antes = db
    .prepare(
      `SELECT ${COLUNAS.split(', ').map((c) => `a.${c}`).join(', ')} FROM anexos a
         JOIN movimentacoes m ON m.id = a.movimentacao_id
        WHERE a.id = ? AND a.excluido_em IS NULL AND m.excluida_em IS NULL`,
    )
    .get(anexoId);
  if (!antes) throw naoEncontrado('Anexo');
  db.transaction(() => {
    db.prepare('UPDATE anexos SET excluido_em = ? WHERE id = ?').run(agora.toISOString(), anexoId);
    db.prepare('DELETE FROM anexos_arquivos WHERE anexo_id = ?').run(anexoId);
    auditar(db, { entidade: 'anexo', id: anexoId, acao: 'excluir', antes });
  })();
}
