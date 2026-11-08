// RF-22 a RF-24: relatórios. Só leem o REALIZADO, na mesma base do resumo e do orçamento (RF-02, RF-12), e
// nunca criam um número novo que concorra com o do início. Funções puras; a tela só formata.
import { diasEntre, intervaloDoMes, somarDias } from './datas.js';
import { resumoRealizado } from './resumo.js';

/** Os `quantidade` meses (AAAA-MM) que terminam no mês de `hoje`, do mais antigo ao mais novo. */
export function mesesAteHoje(hoje, quantidade) {
  const [ano, mes] = hoje.split('-').map(Number);
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (quantidade - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * Evolução mensal do realizado (RF-22): receitas, despesas e resultado de cada mês, pelo mesmo cálculo do início.
 * A média só conta a partir do primeiro mês com movimento (meses antes de a pessoa começar a usar o app não
 * puxam a média para baixo); é null se nunca houve movimento. `movs`: formato de `resumo.js`.
 */
export function evolucaoMensal(movs, meses) {
  const linhas = meses.map((mes) => {
    const { de, ate } = intervaloDoMes(mes);
    return { mes, ...resumoRealizado(movs, de, ate) };
  });
  const inicio = linhas.findIndex((l) => l.receitas > 0 || l.despesas > 0);
  const considerados = inicio === -1 ? [] : linhas.slice(inicio);
  const total = (campo) => considerados.reduce((s, l) => s + l[campo], 0);
  return {
    meses: linhas,
    media:
      considerados.length === 0
        ? null
        : {
            meses_considerados: considerados.length,
            receitas_centavos: Math.round(total('receitas') / considerados.length),
            despesas_centavos: Math.round(total('despesas') / considerados.length),
            resultado_centavos: Math.round(total('resultado') / considerados.length),
          },
  };
}

/**
 * Período imediatamente anterior, para comparar (RF-23). Meses cheios comparam com os mesmos meses antes
 * (março → fevereiro); qualquer outro intervalo compara com o mesmo número de dias logo antes.
 */
export function periodoAnterior(de, ate) {
  const mesDe = de.slice(0, 7);
  const mesAte = ate.slice(0, 7);
  if (de === intervaloDoMes(mesDe).de && ate === intervaloDoMes(mesAte).ate) {
    const [a1, m1] = mesDe.split('-').map(Number);
    const [a2, m2] = mesAte.split('-').map(Number);
    const meses = (a2 - a1) * 12 + (m2 - m1) + 1;
    const inicio = new Date(Date.UTC(a1, m1 - 1 - meses, 1)).toISOString().slice(0, 7);
    const fim = new Date(Date.UTC(a1, m1 - 2, 1)).toISOString().slice(0, 7);
    return { de: intervaloDoMes(inicio).de, ate: intervaloDoMes(fim).ate };
  }
  const dias = diasEntre(de, ate) + 1;
  const fim = somarDias(de, -1);
  return { de: somarDias(fim, -(dias - 1)), ate: fim };
}

const variacao = (valor, anterior) => (anterior > 0 ? Math.round(((valor - anterior) * 1000) / anterior) / 10 : null);

/**
 * Valores por categoria principal no período e no anterior (RF-23). `linhas`: { categoria_id, valor_centavos }
 * (divisão já expandida; estorno negativo). A soma dos itens é o total do período, o mesmo do resumo. Sem
 * categoria vira um item com `categoria_id` null. A variação é null quando o anterior é zero ou negativo
 * (não existe percentual sobre zero). Categoria que só teve valor no anterior aparece com valor zero.
 */
export function valoresPorCategoria({ linhas, anteriores, categorias }) {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const principal = (id) => {
    const c = id == null ? null : porId.get(id);
    return c ? (c.pai_id ?? c.id) : null;
  };
  const somar = (lista) => {
    const principais = new Map();
    const subs = new Map();
    for (const l of lista) {
      const p = principal(l.categoria_id);
      principais.set(p, (principais.get(p) ?? 0) + l.valor_centavos);
      const c = l.categoria_id == null ? null : porId.get(l.categoria_id);
      if (c?.pai_id != null) subs.set(c.id, (subs.get(c.id) ?? 0) + l.valor_centavos);
    }
    return { principais, subs };
  };
  const atual = somar(linhas);
  const anterior = somar(anteriores);
  const total = [...atual.principais.values()].reduce((s, v) => s + v, 0);
  const totalAnterior = [...anterior.principais.values()].reduce((s, v) => s + v, 0);

  const chaves = new Set([...atual.principais.keys(), ...anterior.principais.keys()]);
  const itens = [...chaves].map((id) => {
    const valor = atual.principais.get(id) ?? 0;
    const antes = anterior.principais.get(id) ?? 0;
    const subcategorias = categorias
      .filter((c) => c.pai_id === id && atual.subs.has(c.id))
      .map((c) => ({ categoria_id: c.id, nome: c.nome, valor_centavos: atual.subs.get(c.id) }))
      .sort((a, b) => b.valor_centavos - a.valor_centavos);
    return {
      categoria_id: id,
      nome: id == null ? 'Sem categoria' : porId.get(id).nome,
      valor_centavos: valor,
      percentual: total > 0 && valor > 0 ? Math.round((valor * 1000) / total) / 10 : null,
      anterior_centavos: antes,
      variacao_percentual: variacao(valor, antes),
      subcategorias,
    };
  });
  itens.sort((a, b) => b.valor_centavos - a.valor_centavos || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { itens, total_centavos: total, total_anterior_centavos: totalAnterior, variacao_percentual: variacao(total, totalAnterior) };
}

/** As `limite` maiores despesas realizadas, da maior para a menor (RF-24); empate fica na ordem mais recente. */
export function maioresDespesas(despesas, limite) {
  return [...despesas]
    .sort((a, b) => b.valor_centavos - a.valor_centavos || b.data.localeCompare(a.data))
    .slice(0, limite);
}
