// RF-13 e RF-14: metas. Uma meta é uma reserva virtual: aportes e resgates NÃO mexem em saldo de conta
// nem viram receita ou despesa. Funções puras; a tela só formata.

/** Saldo da meta: aportes − resgates. `aportes`: { tipo: 'aporte' | 'resgate', valor_centavos }. */
export function acumuladoDaMeta(aportes) {
  return aportes.reduce((s, a) => s + (a.tipo === 'aporte' ? a.valor_centavos : -a.valor_centavos), 0);
}

/**
 * Meses que restam até o prazo, contando o mês de hoje e o do prazo (hoje 05/11, prazo 15/12 = 2).
 * Zero se não há prazo ou se ele já passou.
 */
export function mesesRestantes(hoje, prazo) {
  if (!prazo || prazo < hoje) return 0;
  const [ah, mh] = hoje.split('-').map(Number);
  const [ap, mp] = prazo.split('-').map(Number);
  return (ap - ah) * 12 + (mp - mh) + 1;
}

/**
 * Situação calculada, nunca digitada (como o atraso, RF-07):
 * `concluida` (acumulado alcançou o alvo), `atrasada` (prazo passou sem alcançar), `em_andamento`.
 */
export function situacaoDaMeta({ valor_alvo_centavos, prazo }, acumulado, hoje) {
  if (acumulado >= valor_alvo_centavos) return 'concluida';
  if (prazo && prazo < hoje) return 'atrasada';
  return 'em_andamento';
}

/**
 * Progresso de uma meta. `necessario_por_mes_centavos` é o que falta dividido pelos meses restantes, arredondado
 * para cima (para a soma das parcelas nunca ficar abaixo do que falta); null quando não faz sentido
 * (sem prazo, prazo vencido ou meta concluída).
 */
export function progressoDaMeta(meta, aportes, hoje) {
  const acumulado = acumuladoDaMeta(aportes);
  const falta = Math.max(0, meta.valor_alvo_centavos - acumulado);
  const situacao = situacaoDaMeta(meta, acumulado, hoje);
  const meses = mesesRestantes(hoje, meta.prazo);
  return {
    acumulado_centavos: acumulado,
    falta_centavos: falta,
    percentual: Math.floor((Math.max(acumulado, 0) * 100) / meta.valor_alvo_centavos),
    situacao,
    meses_restantes: situacao === 'em_andamento' && meses > 0 ? meses : null,
    necessario_por_mes_centavos: situacao === 'em_andamento' && meses > 0 ? Math.ceil(falta / meses) : null,
  };
}
