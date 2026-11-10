import { createHash, randomUUID } from 'node:crypto';
import { MAXIMO_DE_ANEXOS_POR_LANCAMENTO, TAMANHO_MAXIMO_ANEXO } from '../../../contratos/anexos.js';
import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { detectarTipo, nomeSeguro } from '../../dominio/anexo.js';
import { auditar } from '../auditoria.js';
import { obterMovimentacao } from './movimentacoes.js';

const COLUNAS = 'id, movimentacao_id, nome, tipo_mime, tamanho_bytes, criado_em';
const COLUNAS_A = COLUNAS.split(', ').map((c) => `a.${c}`).join(', ');

/** Anexos do lançamento (sem o conteúdo), do mais novo ao mais antigo. Null se o lançamento não existe. */
export async function listarAnexos(esc, movimentacaoId) {
  if (!(await obterMovimentacao(esc, movimentacaoId))) return null;
  return esc.todos(
    `SELECT ${COLUNAS} FROM anexos WHERE usuario_id = :u AND movimentacao_id = ? AND excluido_em IS NULL ORDER BY id DESC`,
    [movimentacaoId],
  );
}

const anexosAtivos = (esc, movimentacaoId) =>
  esc.todos('SELECT sha256 FROM anexos WHERE usuario_id = :u AND movimentacao_id = ? AND excluido_em IS NULL', [movimentacaoId]);

function conferirLimites(atuais, sha256) {
  if (atuais.length >= MAXIMO_DE_ANEXOS_POR_LANCAMENTO) {
    throw conflito(`Este lançamento já tem ${MAXIMO_DE_ANEXOS_POR_LANCAMENTO} anexos. Remova algum antes.`);
  }
  if (atuais.some((a) => a.sha256 === sha256)) throw conflito('Este arquivo já está anexado neste lançamento.');
}

/**
 * Guarda um comprovante num lançamento (RF-25). O tipo vem dos bytes do arquivo; o tamanho e a quantidade têm
 * limite; o mesmo arquivo não entra duas vezes no mesmo lançamento. O arquivo vai para o armazenamento
 * (caminho `<usuario_id>/<uuid>`); se o registro falhar depois do envio, o objeto é apagado.
 */
export async function anexarArquivo(esc, armazenamento, movimentacaoId, { nome, conteudo }, { agora = new Date() }) {
  if (!(await obterMovimentacao(esc, movimentacaoId))) throw naoEncontrado('Lançamento');
  if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) throw invalido({ arquivo: 'Envie um arquivo.' });
  if (conteudo.length > TAMANHO_MAXIMO_ANEXO) {
    throw invalido({ arquivo: `Arquivo grande demais (máx. ${TAMANHO_MAXIMO_ANEXO / 1024 / 1024} MB).` });
  }
  const tipo = detectarTipo(conteudo);
  if (!tipo) throw invalido({ arquivo: 'Tipo de arquivo não aceito. Use PDF, PNG, JPG ou WEBP.' });
  const sha256 = createHash('sha256').update(conteudo).digest('hex');

  // Confere antes de enviar, para não subir um arquivo que será recusado; confere de novo dentro da transação.
  conferirLimites(await anexosAtivos(esc, movimentacaoId), sha256);

  const caminho = `${esc.usuarioId}/${randomUUID()}`;
  await armazenamento.guardar(caminho, conteudo, tipo);
  try {
    return await esc.transacao(async (tx) => {
      conferirLimites(await anexosAtivos(tx, movimentacaoId), sha256);
      const registro = {
        movimentacao_id: movimentacaoId,
        nome: nomeSeguro(nome, tipo),
        tipo_mime: tipo,
        tamanho_bytes: conteudo.length,
        sha256,
        criado_em: agora.toISOString(),
      };
      const [{ id }] = await tx.rodar(
        `INSERT INTO anexos (usuario_id, movimentacao_id, nome, tipo_mime, tamanho_bytes, sha256, caminho_storage, criado_em)
         VALUES (:u, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [registro.movimentacao_id, registro.nome, registro.tipo_mime, registro.tamanho_bytes, registro.sha256, caminho, registro.criado_em],
      );
      await auditar(tx, { entidade: 'anexo', id, acao: 'criar', depois: registro });
      return tx.um(`SELECT ${COLUNAS} FROM anexos WHERE usuario_id = :u AND id = ?`, [id]);
    });
  } catch (erro) {
    await armazenamento.apagar(caminho).catch(() => {});
    throw erro;
  }
}

/** Nome, tipo e conteúdo de um anexo. Null se o anexo foi removido, se o lançamento foi excluído ou se não é seu. */
export async function obterArquivo(esc, armazenamento, anexoId) {
  const linha = await esc.um(
    `SELECT a.nome, a.tipo_mime, a.caminho_storage
       FROM anexos a
       JOIN movimentacoes m ON m.usuario_id = a.usuario_id AND m.id = a.movimentacao_id
      WHERE a.usuario_id = :u AND a.id = ? AND a.excluido_em IS NULL AND m.excluida_em IS NULL`,
    [anexoId],
  );
  if (!linha) return null;
  const conteudo = await armazenamento.ler(linha.caminho_storage);
  if (!conteudo) return null;
  return { nome: linha.nome, tipo_mime: linha.tipo_mime, conteudo };
}

/** Remove o anexo: apaga o objeto do armazenamento, zera o caminho e mantém o registro e o audit_log. */
export async function removerAnexo(esc, armazenamento, anexoId, { agora = new Date() }) {
  const antes = await esc.um(
    `SELECT ${COLUNAS_A}, a.caminho_storage FROM anexos a
       JOIN movimentacoes m ON m.usuario_id = a.usuario_id AND m.id = a.movimentacao_id
      WHERE a.usuario_id = :u AND a.id = ? AND a.excluido_em IS NULL AND m.excluida_em IS NULL`,
    [anexoId],
  );
  if (!antes) throw naoEncontrado('Anexo');
  const { caminho_storage: caminho, ...registro } = antes;
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE anexos SET excluido_em = ?, caminho_storage = NULL WHERE usuario_id = :u AND id = ?', [
      agora.toISOString(),
      anexoId,
    ]);
    await auditar(tx, { entidade: 'anexo', id: anexoId, acao: 'excluir', antes: registro });
  });
  // Depois de gravar o banco: se o armazenamento falhar, sobra um objeto sem dono, nunca um registro sem arquivo.
  await armazenamento.apagar(caminho).catch((erro) => console.error('Objeto de anexo não apagado:', erro.message));
}
