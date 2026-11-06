import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { auditar } from '../auditoria.js';
import { temOrcamentoEmVigor } from './orcamentos.js';

const SQL_LISTA = `
  SELECT c.id, c.nome, c.tipo, c.pai_id, c.papel, c.arquivada,
    ((SELECT COUNT(*) FROM movimentacoes m
      WHERE m.excluida_em IS NULL
        AND (m.categoria_id = c.id
             OR EXISTS (SELECT 1 FROM movimentacao_divisoes d
                         WHERE d.movimentacao_id = m.id AND d.categoria_id = c.id)))
     + (SELECT COUNT(*) FROM compras_cartao cc
         WHERE cc.excluida_em IS NULL AND cc.categoria_id = c.id)) AS usos
    FROM categorias c
   WHERE c.excluida_em IS NULL`;

const paraApi = (l) => ({ ...l, arquivada: l.arquivada === 1 });

/** Lista plana: cada categoria raiz seguida das suas subcategorias, receitas depois de despesas. */
export function listarCategorias(db) {
  const todas = db.prepare(SQL_LISTA).all().map(paraApi);
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const raizes = todas.filter((c) => c.pai_id == null).sort((a, b) => a.tipo.localeCompare(b.tipo) || porNome(a, b));
  return raizes.flatMap((r) => [r, ...todas.filter((c) => c.pai_id === r.id).sort(porNome)]);
}

export function obterCategoria(db, id) {
  const l = db.prepare(`${SQL_LISTA} AND c.id = ?`).get(id);
  return l ? paraApi(l) : null;
}

function validar(db, dados, idAtual = null) {
  const campos = {};
  if (dados.pai_id != null) {
    const pai = obterCategoria(db, dados.pai_id);
    if (!pai) campos.pai_id = 'Categoria principal não encontrada.';
    else if (pai.pai_id != null) campos.pai_id = 'Só há dois níveis: categoria e subcategoria.';
    else if (pai.tipo !== dados.tipo) campos.pai_id = 'A subcategoria precisa ser do mesmo tipo da principal.';
    else if (pai.id === idAtual) campos.pai_id = 'Uma categoria não pode ser subcategoria dela mesma.';
  }
  const repetida = db
    .prepare(
      `SELECT 1 FROM categorias WHERE excluida_em IS NULL AND tipo = ? AND pai_id IS ? AND nome = ? COLLATE NOCASE AND id <> ?`,
    )
    .get(dados.tipo, dados.pai_id ?? null, dados.nome, idAtual ?? -1);
  if (repetida) campos.nome = 'Já existe uma categoria com esse nome aqui.';
  if (Object.keys(campos).length) throw invalido(campos);
}

export function criarCategoria(db, dados, { agora = new Date(), papel = null } = {}) {
  validar(db, dados);
  return db.transaction(() => {
    const iso = agora.toISOString();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO categorias (nome, tipo, pai_id, papel, arquivada, criada_em, atualizada_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(dados.nome, dados.tipo, dados.pai_id ?? null, papel, dados.arquivada ? 1 : 0, iso, iso);
    const depois = obterCategoria(db, Number(lastInsertRowid));
    auditar(db, { entidade: 'categoria', id: depois.id, acao: 'criar', depois });
    return depois;
  })();
}

export function atualizarCategoria(db, id, dados, { agora = new Date() } = {}) {
  const antes = obterCategoria(db, id);
  if (!antes) throw naoEncontrado('Categoria');
  if (dados.tipo !== antes.tipo) throw invalido({ tipo: 'O tipo da categoria não pode ser alterado.' });
  const temFilhas = db.prepare('SELECT 1 FROM categorias WHERE pai_id = ? AND excluida_em IS NULL').get(id);
  if (temFilhas && dados.pai_id != null) {
    throw invalido({ pai_id: 'Uma categoria com subcategorias não pode virar subcategoria.' });
  }
  if (dados.pai_id != null && temOrcamentoEmVigor(db, id)) {
    throw invalido({ pai_id: 'Esta categoria tem orçamento. Zere o limite em Orçamento antes de torná-la subcategoria.' });
  }
  validar(db, dados, id);
  return db.transaction(() => {
    db.prepare('UPDATE categorias SET nome = ?, pai_id = ?, arquivada = ?, atualizada_em = ? WHERE id = ?').run(
      dados.nome,
      dados.pai_id ?? null,
      dados.arquivada ? 1 : 0,
      agora.toISOString(),
      id,
    );
    const depois = obterCategoria(db, id);
    auditar(db, { entidade: 'categoria', id, acao: 'editar', antes, depois });
    return depois;
  })();
}

export function excluirCategoria(db, id, { agora = new Date() } = {}) {
  const antes = obterCategoria(db, id);
  if (!antes) throw naoEncontrado('Categoria');
  if (antes.papel) throw conflito('Esta categoria é usada pelo sistema (tarifas). Renomeie ou arquive.');
  if (db.prepare('SELECT 1 FROM categorias WHERE pai_id = ? AND excluida_em IS NULL').get(id)) {
    throw conflito('Esta categoria tem subcategorias. Exclua ou mova as subcategorias antes.');
  }
  if (antes.usos > 0) throw conflito('Esta categoria tem lançamentos. Arquive em vez de excluir.');
  if (temOrcamentoEmVigor(db, id)) throw conflito('Esta categoria tem orçamento. Zere o limite em Orçamento antes de excluir.');
  db.transaction(() => {
    db.prepare('UPDATE categorias SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(
      agora.toISOString(),
      agora.toISOString(),
      id,
    );
    auditar(db, { entidade: 'categoria', id, acao: 'excluir', antes });
  })();
}
