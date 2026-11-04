// RF-09. Possível duplicidade: mesmo valor, data, conta e descrição. Só avisa; nunca bloqueia.

export function normalizarDescricao(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mesmaMovimentacao(a, b) {
  return (
    a.tipo === b.tipo &&
    a.valor_centavos === b.valor_centavos &&
    a.data_competencia === b.data_competencia &&
    a.conta_id === b.conta_id &&
    (a.conta_destino_id ?? null) === (b.conta_destino_id ?? null) &&
    normalizarDescricao(a.descricao) === normalizarDescricao(b.descricao)
  );
}

/** Compras no cartão que parecem repetidas: mesmo cartão, valor, data e descrição. */
export function encontrarComprasDuplicadas(candidata, existentes) {
  return existentes.filter(
    (e) =>
      e.id !== candidata.id &&
      !e.excluida_em &&
      e.cartao_id === candidata.cartao_id &&
      e.valor_total_centavos === candidata.valor_total_centavos &&
      e.data_compra === candidata.data_compra &&
      normalizarDescricao(e.descricao) === normalizarDescricao(candidata.descricao),
  );
}

/** Existentes que parecem ser a mesma movimentação da candidata (ignora ela mesma, excluídas e tarifas geradas). */
export function encontrarDuplicadas(candidata, existentes) {
  return existentes.filter(
    (e) =>
      e.id !== candidata.id &&
      !e.excluida_em &&
      e.transferencia_id == null &&
      candidata.transferencia_id == null &&
      mesmaMovimentacao(candidata, e),
  );
}
