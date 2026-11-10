import { semearPadroes } from '../padroes.js';
import { criarEscopo } from '../pg/escopo.js';
import { conflito } from '../../erros.js';

// Contas de usuário (ADR 013). Aqui o repositório trabalha com o banco inteiro, não com um escopo: é a única
// parte que procura gente pelo nome. Tudo o mais recebe um escopo já amarrado a um usuário.

const COLUNAS = 'id, nome_usuario, senha_hash, demo, criado_em';

const paraUsuario = (l) => l && { id: l.id, nome: l.nome_usuario, senhaHash: l.senha_hash, demo: l.demo, criadoEm: l.criado_em };

export async function buscarPorNome(banco, nome) {
  const [linha] = await banco.consultar(`SELECT ${COLUNAS} FROM usuarios WHERE lower(nome_usuario) = lower($1)`, [nome.trim()]);
  return paraUsuario(linha);
}

export async function buscarPorId(banco, id) {
  const [linha] = await banco.consultar(`SELECT ${COLUNAS} FROM usuarios WHERE id = $1`, [id]);
  return paraUsuario(linha);
}

export async function contarUsuarios(banco) {
  const [{ total }] = await banco.consultar('SELECT count(*) AS total FROM usuarios');
  return Number(total);
}

/** Cria o usuário e já semeia as categorias padrão dele, na mesma transação. Nome repetido é conflito (409). */
export async function criarUsuario(banco, { nome, senhaHash, demo = false }, agora = new Date()) {
  const instante = agora.toISOString();
  try {
    return await banco.transacao(async (tx) => {
      const [{ id }] = await tx.consultar(
        `INSERT INTO usuarios (nome_usuario, senha_hash, demo, criado_em, atualizado_em)
         VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [nome.trim(), senhaHash, demo, instante],
      );
      await semearPadroes(criarEscopo(tx, id, { emTransacao: true }), agora);
      return id;
    });
  } catch (erro) {
    if (erro?.code === '23505' || /idx_usuarios_nome|duplicate key/i.test(erro?.message ?? '')) {
      throw conflito('Esse nome de usuário já está em uso.');
    }
    throw erro;
  }
}

export async function definirSenhaDoUsuario(banco, id, senhaHash, agora = new Date()) {
  const trocadas = await banco.consultar('UPDATE usuarios SET senha_hash = $2, atualizado_em = $3 WHERE id = $1 RETURNING id', [
    id,
    senhaHash,
    agora.toISOString(),
  ]);
  return trocadas.length === 1;
}

/**
 * Apaga a conta e tudo o que é dela. As tabelas de dados têm ON DELETE CASCADE para `usuarios`, então uma
 * linha só leva junto lançamentos, contas, auditoria, sessões e a configuração. Os arquivos do Storage saem
 * depois: se algum apagar falhar, sobra um objeto órfão (sem dono no banco, inacessível pela API), nunca dado
 * de outra pessoa exposto.
 */
export async function excluirUsuario(banco, armazenamento, id) {
  const caminhos = (
    await banco.consultar('SELECT caminho_storage FROM anexos WHERE usuario_id = $1 AND caminho_storage IS NOT NULL', [id])
  ).map((l) => l.caminho_storage);
  const apagados = await banco.consultar('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
  if (apagados.length === 0) return false;
  const falhas = [];
  for (const caminho of caminhos) {
    try {
      await armazenamento.apagar(caminho);
    } catch {
      falhas.push(caminho);
    }
  }
  return { arquivosOrfaos: falhas };
}
