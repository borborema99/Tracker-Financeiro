// RF-01, RF-02 e RF-03. Realizado e previsto são visões separadas e nunca se somam num mesmo número.
// Transferência não é receita nem despesa em nenhuma das visões.

const naoExcluida = (m) => !m.excluida_em;
const ehReceitaOuDespesa = (m) => m.tipo === 'receita' || m.tipo === 'despesa';
const dentro = (data, de, ate) => data != null && (de == null || data >= de) && (ate == null || data <= ate);

function somar(movs) {
  let receitas = 0;
  let despesas = 0;
  for (const m of movs) {
    if (m.tipo === 'receita') receitas += m.valor_efetivo ?? m.valor_centavos;
    else despesas += m.valor_efetivo ?? m.valor_centavos;
  }
  return { receitas, despesas };
}

/** Visão REALIZADA: só o que foi liquidado, pela data de liquidação. */
export function resumoRealizado(movs, de, ate) {
  const { receitas, despesas } = somar(
    movs.filter(
      (m) =>
        naoExcluida(m) &&
        ehReceitaOuDespesa(m) &&
        m.status === 'liquidada' &&
        dentro(m.data_liquidacao, de, ate),
    ),
  );
  return { receitas, despesas, resultado: receitas - despesas };
}

/** Visão PREVISTA: só o que está pendente, pelo vencimento (ou competência, se não houver). */
export function resumoPrevisto(movs, de, ate) {
  return somar(
    movs.filter(
      (m) =>
        naoExcluida(m) &&
        ehReceitaOuDespesa(m) &&
        m.status === 'pendente' &&
        dentro(m.data_vencimento ?? m.data_competencia, de, ate),
    ),
  );
}

/** As duas visões lado a lado, em objetos distintos. Não existe total que as misture. */
export function resumoDoPeriodo(movs, { de, ate }) {
  return { realizado: resumoRealizado(movs, de, ate), previsto: resumoPrevisto(movs, de, ate) };
}

/** Totais de uma listagem filtrada: mesmas duas visões, sem período. */
export function totaisDaListagem(movs) {
  return {
    realizado: resumoRealizado(movs, null, null),
    previsto: resumoPrevisto(movs, null, null),
  };
}
