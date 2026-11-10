import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { auditar } from '../auditoria.js';
import { temOrcamentoEmVigor } from './orcamentos.js';

const SQL_LISTA = `
  SELECT c.id, c.nome, c.tipo, c.pai_id, c.papel, c.arquivada,
    ((SELECT COUNT(*) FROM movimentacoes m
      WHERE m.usuario_id = :u AND m.excluida_em IS NULL
        AND (m.categoria_id = c.id
             OR EXISTS (SELECT 1 FROM movimentacao_divisoes d
                         WHERE d.usuario_id = :u AND d.movimentacao_id = m.id AND d.categoria_id = c.id)))
     + (SELECT COUNT(*) FROM compras_cartao cc
         WHERE cc.usuario_id = :u AND cc.excluida_em IS NULL AND cc.categoria_id = c.id)) AS usos
    FROM categorias c
   WHERE c.usuario_id = :u AND c.excluida_em IS NULL`;

/** Lista plana: cada categoria raiz seguida das suas subcategorias, receitas depois de despesas. */
export async function listarCategorias(esc) {
  const todas = await esc.todos(SQL_LISTA);
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const raizes = todas.filter((c) => c.pai_id == null).sort((a, b) => a.tipo.localeCompare(b.tipo) || porNome(a, b));
  return raizes.flatMap((r) => [r, ...todas.filter((c) => c.pai_id === r.id).sort(porNome)]);
}

export async function obterCategoria(esc, id) {
  return (await esc.um(`${SQL_LISTA} AND c.id = ?`, [id])) ?? null;
}

async function validar(esc, dados, idAtual = null) {
  const campos = {};
  if (dados.pai_id != null) {
    const pai = await obterCategoria(esc, dados.pai_id);
    if (!pai) campos.pai_id = 'Categoria principal não encontrada.';
    else if (pai.pai_id != null) campos.pai_id = 'Só há dois níveis: categoria e subcategoria.';
    else if (pai.tipo !== dados.tipo) campos.pai_id = 'A subcategoria precisa ser do mesmo tipo da principal.';
    else if (pai.id === idAtual) campos.pai_id = 'Uma categoria não pode ser subcategoria dela mesma.';
  }
  const repetida = await esc.um(
    `SELECT 1 AS um FROM categorias
      WHERE usuario_id = :u AND excluida_em IS NULL AND tipo = ? AND pai_id IS NOT DISTINCT FROM ?::bigint
        AND lower(nome) = lower(?) AND id <> ?`,
    [dados.tipo, dados.pai_id ?? null, dados.nome, idAtual ?? -1],
  );
  if (repetida) campos.nome = 'Já existe uma categoria com esse nome aqui.';
  if (Object.keys(campos).length) throw invalido(campos);
}

export async function criarCategoria(esc, dados, { agora = new Date(), papel = null } = {}) {
  await validar(esc, dados);
  return esc.transacao(async (tx) => {
    const iso = agora.toISOString();
    const [{ id }] = await tx.rodar(
      `INSERT INTO categorias (usuario_id, nome, tipo, pai_id, papel, arquivada, criada_em, atualizada_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [dados.nome, dados.tipo, dados.pai_id ?? null, papel, !!dados.arquivada, iso, iso],
    );
    const depois = await obterCategoria(tx, id);
    await auditar(tx, { entidade: 'categoria', id: depois.id, acao: 'criar', depois });
    return depois;
  });
}

export async function atualizarCategoria(esc, id, dados, { agora = new Date() } = {}) {
  const antes = await obterCategoria(esc, id);
  if (!antes) throw naoEncontrado('Categoria');
  if (dados.tipo !== antes.tipo) throw invalido({ tipo: 'O tipo da categoria não pode ser alterado.' });
  const temFilhas = await esc.um('SELECT 1 AS um FROM categorias WHERE usuario_id = :u AND pai_id = ? AND excluida_em IS NULL', [id]);
  if (temFilhas && dados.pai_id != null) {
    throw invalido({ pai_id: 'Uma categoria com subcategorias não pode virar subcategoria.' });
  }
  if (dados.pai_id != null && (await temOrcamentoEmVigor(esc, id))) {
    throw invalido({ pai_id: 'Esta categoria tem orçamento. Zere o limite em Orçamento antes de torná-la subcategoria.' });
  }
  await validar(esc, dados, id);
  return esc.transacao(async (tx) => {
    await tx.rodar(
      'UPDATE categorias SET nome = ?, pai_id = ?, arquivada = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?',
      [dados.nome, dados.pai_id ?? null, !!dados.arquivada, agora.toISOString(), id],
    );
    const depois = await obterCategoria(tx, id);
    await auditar(tx, { entidade: 'categoria', id, acao: 'editar', antes, depois });
    return depois;
  });
}

export async function excluirCategoria(esc, id, { agora = new Date() } = {}) {
  const antes = await obterCategoria(esc, id);
  if (!antes) throw naoEncontrado('Categoria');
  if (antes.papel) throw conflito('Esta categoria é usada pelo sistema (tarifas). Renomeie ou arquive.');
  if (await esc.um('SELECT 1 AS um FROM categorias WHERE usuario_id = :u AND pai_id = ? AND excluida_em IS NULL', [id])) {
    throw conflito('Esta categoria tem subcategorias. Exclua ou mova as subcategorias antes.');
  }
  if (antes.usos > 0) throw conflito('Esta categoria tem lançamentos. Arquive em vez de excluir.');
  if (await temOrcamentoEmVigor(esc, id)) throw conflito('Esta categoria tem orçamento. Zere o limite em Orçamento antes de excluir.');
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE categorias SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [
      agora.toISOString(),
      agora.toISOString(),
      id,
    ]);
    await auditar(tx, { entidade: 'categoria', id, acao: 'excluir', antes });
  });
}
