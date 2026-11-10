import { intervaloDoMes } from '../../dominio/datas.js';
import { evolucaoMensal, maioresDespesas, mesesAteHoje, periodoAnterior, valoresPorCategoria } from '../../dominio/relatorio.js';
import { movimentosDeCartaoDoPeriodo } from './cartoes.js';
import { movimentacoesDoPeriodo } from './movimentacoes.js';
import { despesasRealizadasPorCategoria, expandirDivisoes } from './orcamentos.js';

/** Evolução dos últimos `quantidade` meses, na mesma base do resumo: lançamentos mais cartão (RF-04). */
export async function evolucaoDoRealizado(esc, hoje, quantidade) {
  const meses = mesesAteHoje(hoje, quantidade);
  const de = intervaloDoMes(meses[0]).de;
  const ate = intervaloDoMes(meses[meses.length - 1]).ate;
  const movs = [...(await movimentacoesDoPeriodo(esc, de, ate)), ...(await movimentosDeCartaoDoPeriodo(esc, de, ate))];
  return { de, ate, ...evolucaoMensal(movs, meses) };
}

/** Receitas REALIZADAS do período por categoria: liquidadas pela data de liquidação, com divisões expandidas. */
async function receitasRealizadasPorCategoria(esc, de, ate) {
  const liquidadas = await esc.todos(
    `SELECT id, categoria_id, valor_centavos FROM movimentacoes
      WHERE usuario_id = :u AND excluida_em IS NULL AND tipo = 'receita' AND status = 'liquidada'
        AND data_liquidacao BETWEEN ? AND ?`,
    [de, ate],
  );
  return expandirDivisoes(esc, liquidadas);
}

/** Valores do período por categoria principal, comparados com o período anterior (RF-23). */
export async function relatorioPorCategoria(esc, { de, ate, tipo }) {
  const anterior = periodoAnterior(de, ate);
  const ler = tipo === 'receita' ? receitasRealizadasPorCategoria : despesasRealizadasPorCategoria;
  const categorias = await esc.todos('SELECT id, nome, pai_id FROM categorias WHERE usuario_id = :u AND excluida_em IS NULL AND tipo = ?', [
    tipo,
  ]);
  return {
    tipo,
    periodo: { de, ate },
    periodo_anterior: anterior,
    ...valoresPorCategoria({
      linhas: await ler(esc, de, ate),
      anteriores: await ler(esc, anterior.de, anterior.ate),
      categorias,
    }),
  };
}

/** As maiores despesas realizadas do período: lançamentos liquidados e compras no cartão (valor total). */
export async function relatorioMaioresDespesas(esc, { de, ate, limite }) {
  const lancamentos = (
    await esc.todos(
      `SELECT m.descricao, m.valor_centavos, m.data_liquidacao AS data, m.categoria_id, c.nome AS categoria_nome,
              EXISTS (SELECT 1 FROM movimentacao_divisoes d WHERE d.usuario_id = :u AND d.movimentacao_id = m.id) AS dividida
         FROM movimentacoes m LEFT JOIN categorias c ON c.usuario_id = m.usuario_id AND c.id = m.categoria_id
        WHERE m.usuario_id = :u AND m.excluida_em IS NULL AND m.tipo = 'despesa' AND m.status = 'liquidada'
          AND m.data_liquidacao BETWEEN ? AND ?`,
      [de, ate],
    )
  ).map((l) => ({ ...l, dividida: l.dividida === true, origem: 'lancamento' }));
  const compras = (
    await esc.todos(
      `SELECT p.descricao, p.valor_total_centavos AS valor_centavos, p.data_compra AS data, p.categoria_id, c.nome AS categoria_nome
         FROM compras_cartao p LEFT JOIN categorias c ON c.usuario_id = p.usuario_id AND c.id = p.categoria_id
        WHERE p.usuario_id = :u AND p.excluida_em IS NULL AND p.data_compra BETWEEN ? AND ?`,
      [de, ate],
    )
  ).map((c) => ({ ...c, dividida: false, origem: 'cartao' }));
  return { periodo: { de, ate }, itens: maioresDespesas([...lancamentos, ...compras], limite) };
}
