import { invalido } from '../../erros.js';
import { intervaloDoMes } from '../../dominio/datas.js';
import { montarOrcamento } from '../../dominio/orcamento.js';
import { auditar } from '../auditoria.js';

const SQL_VIGENCIAS = 'SELECT id, categoria_id, mes_inicio, limite_centavos FROM orcamentos';

export const listarVigencias = (db) => db.prepare(`${SQL_VIGENCIAS} ORDER BY categoria_id, mes_inicio`).all();

function categoriasAtivas(db) {
  return db.prepare('SELECT id, nome, tipo, pai_id FROM categorias WHERE excluida_em IS NULL').all();
}

/** Uma linha por categoria; lançamento dividido entre categorias vira uma linha por divisão. */
function expandirDivisoes(db, lancamentos) {
  if (lancamentos.length === 0) return [];
  const marcas = lancamentos.map(() => '?').join(',');
  const partes = new Map();
  for (const d of db
    .prepare(`SELECT movimentacao_id, categoria_id, valor_centavos FROM movimentacao_divisoes WHERE movimentacao_id IN (${marcas})`)
    .all(...lancamentos.map((l) => l.id))) {
    if (!partes.has(d.movimentacao_id)) partes.set(d.movimentacao_id, []);
    partes.get(d.movimentacao_id).push({ categoria_id: d.categoria_id, valor_centavos: d.valor_centavos });
  }
  return lancamentos.flatMap((l) => partes.get(l.id) ?? [{ categoria_id: l.categoria_id, valor_centavos: l.valor_centavos }]);
}

/**
 * Despesas REALIZADAS do período por categoria, na mesma base do resumo (RF-02): despesas liquidadas pela
 * data de liquidação, compras no cartão pela data da compra e estornos (negativos) pela data do estorno.
 * Pagar fatura não aparece: não é despesa (RF-04). Transferência também não (RF-03).
 */
export function despesasRealizadasPorCategoria(db, de, ate) {
  const liquidadas = db
    .prepare(
      `SELECT id, categoria_id, valor_centavos FROM movimentacoes
        WHERE excluida_em IS NULL AND tipo = 'despesa' AND status = 'liquidada' AND data_liquidacao BETWEEN ? AND ?`,
    )
    .all(de, ate);
  const compras = db
    .prepare(
      `SELECT categoria_id, valor_total_centavos AS valor_centavos FROM compras_cartao
        WHERE excluida_em IS NULL AND data_compra BETWEEN ? AND ?`,
    )
    .all(de, ate);
  const estornos = db
    .prepare(
      `SELECT c.categoria_id, -e.valor_centavos AS valor_centavos FROM estornos_cartao e
         JOIN compras_cartao c ON c.id = e.compra_id
        WHERE e.excluido_em IS NULL AND c.excluida_em IS NULL AND e.data_estorno BETWEEN ? AND ?`,
    )
    .all(de, ate);
  return [...expandirDivisoes(db, liquidadas), ...compras, ...estornos];
}

/** Despesas PREVISTAS (pendentes) do período por categoria, pelo vencimento ou, na falta, a competência. */
export function despesasPrevistasPorCategoria(db, de, ate) {
  const pendentes = db
    .prepare(
      `SELECT id, categoria_id, valor_centavos FROM movimentacoes
        WHERE excluida_em IS NULL AND tipo = 'despesa' AND status = 'pendente'
          AND COALESCE(data_vencimento, data_competencia) BETWEEN ? AND ?`,
    )
    .all(de, ate);
  return expandirDivisoes(db, pendentes);
}

/** Orçamento do mês (AAAA-MM): limites vigentes, realizado, previsto e o que não tem orçamento. */
export function orcamentoDoMes(db, mes) {
  const { de, ate } = intervaloDoMes(mes);
  return montarOrcamento({
    mes,
    categorias: categoriasAtivas(db),
    registros: listarVigencias(db),
    realizado: despesasRealizadasPorCategoria(db, de, ate),
    previsto: despesasPrevistasPorCategoria(db, de, ate),
  });
}

/** Orçamento do mês só se existir algum limite em vigor; senão null (RF-10: nada de zero falso). */
export function orcamentoSeExistir(db, mes) {
  const o = orcamentoDoMes(db, mes);
  return o.itens.length > 0 ? o : null;
}

/** Define o limite de uma categoria principal de despesa a partir de `mes_inicio` (0 tira o orçamento). */
export function definirLimite(db, categoriaId, { mes_inicio, limite_centavos }, { agora = new Date() } = {}) {
  const categoria = db
    .prepare('SELECT id, tipo, pai_id, arquivada FROM categorias WHERE id = ? AND excluida_em IS NULL')
    .get(categoriaId);
  if (!categoria) throw invalido({ categoria_id: 'Categoria não encontrada.' });
  if (categoria.tipo !== 'despesa') throw invalido({ categoria_id: 'Só categorias de despesa têm orçamento.' });
  if (categoria.pai_id != null) {
    throw invalido({ categoria_id: 'O orçamento é da categoria principal; as subcategorias somam nela.' });
  }
  if (categoria.arquivada === 1 && limite_centavos > 0) throw invalido({ categoria_id: 'Esta categoria está arquivada.' });

  const iso = agora.toISOString();
  return db.transaction(() => {
    const antes = db.prepare(`${SQL_VIGENCIAS} WHERE categoria_id = ? AND mes_inicio = ?`).get(categoriaId, mes_inicio) ?? null;
    if (antes) {
      db.prepare('UPDATE orcamentos SET limite_centavos = ?, atualizado_em = ? WHERE id = ?').run(limite_centavos, iso, antes.id);
    } else {
      db.prepare(
        'INSERT INTO orcamentos (categoria_id, mes_inicio, limite_centavos, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)',
      ).run(categoriaId, mes_inicio, limite_centavos, iso, iso);
    }
    const depois = db.prepare(`${SQL_VIGENCIAS} WHERE categoria_id = ? AND mes_inicio = ?`).get(categoriaId, mes_inicio);
    auditar(db, { entidade: 'orcamento', id: depois.id, acao: antes ? 'editar' : 'criar', antes, depois });
    return depois;
  })();
}

/** A categoria tem limite em vigor hoje? (o registro mais recente é maior que zero). Impede mover ou excluir sem zerar. */
export function temOrcamentoEmVigor(db, categoriaId) {
  const ultimo = db
    .prepare('SELECT limite_centavos FROM orcamentos WHERE categoria_id = ? ORDER BY mes_inicio DESC LIMIT 1')
    .get(categoriaId);
  return Boolean(ultimo && ultimo.limite_centavos > 0);
}
