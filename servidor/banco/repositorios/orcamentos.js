import { invalido } from '../../erros.js';
import { intervaloDoMes } from '../../dominio/datas.js';
import { montarOrcamento } from '../../dominio/orcamento.js';
import { auditar } from '../auditoria.js';

const SQL_VIGENCIAS = 'SELECT id, categoria_id, mes_inicio, limite_centavos FROM orcamentos WHERE usuario_id = :u';

export const listarVigencias = (esc) => esc.todos(`${SQL_VIGENCIAS} ORDER BY categoria_id, mes_inicio`);

const categoriasAtivas = (esc) =>
  esc.todos('SELECT id, nome, tipo, pai_id FROM categorias WHERE usuario_id = :u AND excluida_em IS NULL');

/** Uma linha por categoria; lançamento dividido entre categorias vira uma linha por divisão. */
export async function expandirDivisoes(esc, lancamentos) {
  if (lancamentos.length === 0) return [];
  const marcas = lancamentos.map(() => '?').join(',');
  const partes = new Map();
  const divisoes = await esc.todos(
    `SELECT movimentacao_id, categoria_id, valor_centavos FROM movimentacao_divisoes
      WHERE usuario_id = :u AND movimentacao_id IN (${marcas})`,
    lancamentos.map((l) => l.id),
  );
  for (const d of divisoes) {
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
export async function despesasRealizadasPorCategoria(esc, de, ate) {
  const liquidadas = await esc.todos(
    `SELECT id, categoria_id, valor_centavos FROM movimentacoes
      WHERE usuario_id = :u AND excluida_em IS NULL AND tipo = 'despesa' AND status = 'liquidada'
        AND data_liquidacao BETWEEN ? AND ?`,
    [de, ate],
  );
  const compras = await esc.todos(
    `SELECT categoria_id, valor_total_centavos AS valor_centavos FROM compras_cartao
      WHERE usuario_id = :u AND excluida_em IS NULL AND data_compra BETWEEN ? AND ?`,
    [de, ate],
  );
  const estornos = await esc.todos(
    `SELECT c.categoria_id, -e.valor_centavos AS valor_centavos FROM estornos_cartao e
       JOIN compras_cartao c ON c.usuario_id = e.usuario_id AND c.id = e.compra_id
      WHERE e.usuario_id = :u AND e.excluido_em IS NULL AND c.excluida_em IS NULL AND e.data_estorno BETWEEN ? AND ?`,
    [de, ate],
  );
  return [...(await expandirDivisoes(esc, liquidadas)), ...compras, ...estornos];
}

/** Despesas PREVISTAS (pendentes) do período por categoria, pelo vencimento ou, na falta, a competência. */
export async function despesasPrevistasPorCategoria(esc, de, ate) {
  const pendentes = await esc.todos(
    `SELECT id, categoria_id, valor_centavos FROM movimentacoes
      WHERE usuario_id = :u AND excluida_em IS NULL AND tipo = 'despesa' AND status = 'pendente'
        AND COALESCE(data_vencimento, data_competencia) BETWEEN ? AND ?`,
    [de, ate],
  );
  return expandirDivisoes(esc, pendentes);
}

/** Orçamento do mês (AAAA-MM): limites vigentes, realizado, previsto e o que não tem orçamento. */
export async function orcamentoDoMes(esc, mes) {
  const { de, ate } = intervaloDoMes(mes);
  return montarOrcamento({
    mes,
    categorias: await categoriasAtivas(esc),
    registros: await listarVigencias(esc),
    realizado: await despesasRealizadasPorCategoria(esc, de, ate),
    previsto: await despesasPrevistasPorCategoria(esc, de, ate),
  });
}

/** Orçamento do mês só se existir algum limite em vigor; senão null (RF-10: nada de zero falso). */
export async function orcamentoSeExistir(esc, mes) {
  const o = await orcamentoDoMes(esc, mes);
  return o.itens.length > 0 ? o : null;
}

/** Define o limite de uma categoria principal de despesa a partir de `mes_inicio` (0 tira o orçamento). */
export async function definirLimite(esc, categoriaId, { mes_inicio, limite_centavos }, { agora = new Date() } = {}) {
  const categoria = await esc.um(
    'SELECT id, tipo, pai_id, arquivada FROM categorias WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL',
    [categoriaId],
  );
  if (!categoria) throw invalido({ categoria_id: 'Categoria não encontrada.' });
  if (categoria.tipo !== 'despesa') throw invalido({ categoria_id: 'Só categorias de despesa têm orçamento.' });
  if (categoria.pai_id != null) {
    throw invalido({ categoria_id: 'O orçamento é da categoria principal; as subcategorias somam nela.' });
  }
  if (categoria.arquivada && limite_centavos > 0) throw invalido({ categoria_id: 'Esta categoria está arquivada.' });

  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    const antes = (await tx.um(`${SQL_VIGENCIAS} AND categoria_id = ? AND mes_inicio = ?`, [categoriaId, mes_inicio])) ?? null;
    if (antes) {
      await tx.rodar('UPDATE orcamentos SET limite_centavos = ?, atualizado_em = ? WHERE usuario_id = :u AND id = ?', [
        limite_centavos,
        iso,
        antes.id,
      ]);
    } else {
      await tx.rodar(
        `INSERT INTO orcamentos (usuario_id, categoria_id, mes_inicio, limite_centavos, criado_em, atualizado_em)
         VALUES (:u, ?, ?, ?, ?, ?)`,
        [categoriaId, mes_inicio, limite_centavos, iso, iso],
      );
    }
    const depois = await tx.um(`${SQL_VIGENCIAS} AND categoria_id = ? AND mes_inicio = ?`, [categoriaId, mes_inicio]);
    await auditar(tx, { entidade: 'orcamento', id: depois.id, acao: antes ? 'editar' : 'criar', antes, depois });
    return depois;
  });
}

/** A categoria tem limite em vigor hoje? (o registro mais recente é maior que zero). Impede mover ou excluir sem zerar. */
export async function temOrcamentoEmVigor(esc, categoriaId) {
  const ultimo = await esc.um(
    'SELECT limite_centavos FROM orcamentos WHERE usuario_id = :u AND categoria_id = ? ORDER BY mes_inicio DESC LIMIT 1',
    [categoriaId],
  );
  return Boolean(ultimo && ultimo.limite_centavos > 0);
}
