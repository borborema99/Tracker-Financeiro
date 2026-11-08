import { intervaloDoMes } from '../../dominio/datas.js';
import { evolucaoMensal, maioresDespesas, mesesAteHoje, periodoAnterior, valoresPorCategoria } from '../../dominio/relatorio.js';
import { movimentosDeCartaoDoPeriodo } from './cartoes.js';
import { movimentacoesDoPeriodo } from './movimentacoes.js';
import { despesasRealizadasPorCategoria, expandirDivisoes } from './orcamentos.js';

/** Evolução dos últimos `quantidade` meses, na mesma base do resumo: lançamentos mais cartão (RF-04). */
export function evolucaoDoRealizado(db, hoje, quantidade) {
  const meses = mesesAteHoje(hoje, quantidade);
  const de = intervaloDoMes(meses[0]).de;
  const ate = intervaloDoMes(meses[meses.length - 1]).ate;
  const movs = [...movimentacoesDoPeriodo(db, de, ate), ...movimentosDeCartaoDoPeriodo(db, de, ate)];
  return { de, ate, ...evolucaoMensal(movs, meses) };
}

/** Receitas REALIZADAS do período por categoria: liquidadas pela data de liquidação, com divisões expandidas. */
function receitasRealizadasPorCategoria(db, de, ate) {
  const liquidadas = db
    .prepare(
      `SELECT id, categoria_id, valor_centavos FROM movimentacoes
        WHERE excluida_em IS NULL AND tipo = 'receita' AND status = 'liquidada' AND data_liquidacao BETWEEN ? AND ?`,
    )
    .all(de, ate);
  return expandirDivisoes(db, liquidadas);
}

/** Valores do período por categoria principal, comparados com o período anterior (RF-23). */
export function relatorioPorCategoria(db, { de, ate, tipo }) {
  const anterior = periodoAnterior(de, ate);
  const ler = tipo === 'receita' ? receitasRealizadasPorCategoria : despesasRealizadasPorCategoria;
  const categorias = db.prepare('SELECT id, nome, pai_id FROM categorias WHERE excluida_em IS NULL AND tipo = ?').all(tipo);
  return {
    tipo,
    periodo: { de, ate },
    periodo_anterior: anterior,
    ...valoresPorCategoria({ linhas: ler(db, de, ate), anteriores: ler(db, anterior.de, anterior.ate), categorias }),
  };
}

/** As maiores despesas realizadas do período: lançamentos liquidados e compras no cartão (valor total). */
export function relatorioMaioresDespesas(db, { de, ate, limite }) {
  const lancamentos = db
    .prepare(
      `SELECT m.descricao, m.valor_centavos, m.data_liquidacao AS data, m.categoria_id, c.nome AS categoria_nome,
              EXISTS (SELECT 1 FROM movimentacao_divisoes d WHERE d.movimentacao_id = m.id) AS dividida
         FROM movimentacoes m LEFT JOIN categorias c ON c.id = m.categoria_id
        WHERE m.excluida_em IS NULL AND m.tipo = 'despesa' AND m.status = 'liquidada' AND m.data_liquidacao BETWEEN ? AND ?`,
    )
    .all(de, ate)
    .map((l) => ({ ...l, dividida: l.dividida === 1, origem: 'lancamento' }));
  const compras = db
    .prepare(
      `SELECT p.descricao, p.valor_total_centavos AS valor_centavos, p.data_compra AS data, p.categoria_id, c.nome AS categoria_nome
         FROM compras_cartao p LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.excluida_em IS NULL AND p.data_compra BETWEEN ? AND ?`,
    )
    .all(de, ate)
    .map((c) => ({ ...c, dividida: false, origem: 'cartao' }));
  return { periodo: { de, ate }, itens: maioresDespesas([...lancamentos, ...compras], limite) };
}
