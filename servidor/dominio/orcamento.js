// RF-11 e RF-12: orçamento mensal por categoria principal. Funções puras; a tela só formata.
// Realizado, previsto e projetado ficam em campos separados (RF-02); a situação olha só o realizado.

export const LIMITE_DE_ATENCAO_PERCENTUAL = 80;

/**
 * Limite em vigor num mês: vale o registro de `mes_inicio` mais recente que não passa do mês.
 * Limite 0 num registro significa "sem orçamento daquele mês em diante". Devolve null se não houver limite.
 * `registros`: { categoria_id, mes_inicio, limite_centavos }.
 */
export function limiteVigente(registros, categoriaId, mes) {
  let vigente = null;
  for (const r of registros) {
    if (r.categoria_id !== categoriaId || r.mes_inicio > mes) continue;
    if (vigente === null || r.mes_inicio > vigente.mes_inicio) vigente = r;
  }
  return vigente && vigente.limite_centavos > 0 ? vigente.limite_centavos : null;
}

/** Categoria principal de uma categoria (ela mesma, se já for principal). `categorias`: { id, pai_id }. */
export function categoriaPrincipal(categorias, id) {
  if (id == null) return null;
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const c = porId.get(id);
  if (!c) return null;
  return c.pai_id ?? c.id;
}

/** Soma `linhas` ({ categoria_id, valor_centavos }) por categoria principal; sem categoria fica na chave null. */
export function somarPorCategoriaPrincipal(linhas, categorias) {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const total = new Map();
  for (const l of linhas) {
    const c = l.categoria_id == null ? null : porId.get(l.categoria_id);
    const chave = c ? (c.pai_id ?? c.id) : null;
    total.set(chave, (total.get(chave) ?? 0) + l.valor_centavos);
  }
  return total;
}

/** Percentual consumido, arredondado para baixo (130 = estourou em 30%). */
export const percentualConsumido = (realizado, limite) => Math.floor((Math.max(realizado, 0) * 100) / limite);

/**
 * Situação calculada, nunca digitada: `estourado` (passou do limite), `atencao` (80% ou mais, inclusive
 * o limite exato) e `ok`. Compara em centavos inteiros, sem arredondar percentual.
 */
export function situacaoDoOrcamento(realizado, limite) {
  if (realizado > limite) return 'estourado';
  if (realizado * 100 >= limite * LIMITE_DE_ATENCAO_PERCENTUAL) return 'atencao';
  return 'ok';
}

/**
 * Orçamento de um mês.
 * - `categorias`: { id, nome, tipo, pai_id } (todas as não excluídas);
 * - `registros`: vigências de limite;
 * - `realizado` e `previsto`: { categoria_id, valor_centavos } (despesas, já líquidas de estorno).
 * Só categorias principais de despesa têm orçamento; subcategorias somam na principal (RF-12: nada é
 * contado em duas categorias, e o que não tem orçamento aparece em `sem_orcamento`, nunca some).
 */
export function montarOrcamento({ mes, categorias, registros, realizado, previsto }) {
  const principais = categorias.filter((c) => c.tipo === 'despesa' && c.pai_id == null);
  const gasto = somarPorCategoriaPrincipal(realizado, categorias);
  const aVencer = somarPorCategoriaPrincipal(previsto, categorias);

  const itens = [];
  for (const c of principais) {
    const limite = limiteVigente(registros, c.id, mes);
    if (limite === null) continue;
    const real = gasto.get(c.id) ?? 0;
    const prev = aVencer.get(c.id) ?? 0;
    const situacao = situacaoDoOrcamento(real, limite);
    itens.push({
      categoria_id: c.id,
      nome: c.nome,
      limite_centavos: limite,
      realizado_centavos: real,
      previsto_centavos: prev,
      projetado_centavos: real + prev,
      restante_centavos: limite - real,
      percentual: percentualConsumido(real, limite),
      situacao,
      vai_estourar: situacao !== 'estourado' && real + prev > limite,
    });
  }
  itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const comOrcamento = new Set(itens.map((i) => i.categoria_id));
  const nomes = new Map(principais.map((c) => [c.id, c.nome]));
  const semOrcamento = [];
  for (const chave of new Set([...gasto.keys(), ...aVencer.keys()])) {
    if (chave !== null && comOrcamento.has(chave)) continue;
    semOrcamento.push({
      categoria_id: chave,
      nome: chave === null ? 'Sem categoria' : (nomes.get(chave) ?? 'Outras'),
      realizado_centavos: gasto.get(chave) ?? 0,
      previsto_centavos: aVencer.get(chave) ?? 0,
    });
  }
  semOrcamento.sort((a, b) => b.realizado_centavos - a.realizado_centavos || a.nome.localeCompare(b.nome, 'pt-BR'));

  const soma = (lista, campo) => lista.reduce((t, i) => t + i[campo], 0);
  return {
    mes,
    itens,
    // Totais só das categorias com orçamento: comparar o limite com gasto de categoria sem limite seria enganoso.
    totais: {
      limite_centavos: soma(itens, 'limite_centavos'),
      realizado_centavos: soma(itens, 'realizado_centavos'),
      previsto_centavos: soma(itens, 'previsto_centavos'),
      restante_centavos: soma(itens, 'limite_centavos') - soma(itens, 'realizado_centavos'),
      estourados: itens.filter((i) => i.situacao === 'estourado').length,
      em_atencao: itens.filter((i) => i.situacao === 'atencao').length,
    },
    sem_orcamento: semOrcamento,
  };
}
