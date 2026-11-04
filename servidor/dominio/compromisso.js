// RF-07. Conta a pagar/receber é uma movimentação pendente. "Atrasada" é estado calculado:
// pendente com vencimento passado. Nunca é digitado nem gravado.
import { diasEntre, somarDias } from './datas.js';

/** O vencimento que vale: a data de vencimento ou, se não houver, a de competência. */
export const vencimentoEfetivo = (m) => m.data_vencimento ?? m.data_competencia;

const ehCompromisso = (m) => (m.tipo === 'receita' || m.tipo === 'despesa') && !m.excluida_em;

export function estaAtrasada(m, hoje) {
  return ehCompromisso(m) && m.status === 'pendente' && vencimentoEfetivo(m) < hoje;
}

export function diasDeAtraso(m, hoje) {
  return estaAtrasada(m, hoje) ? diasEntre(vencimentoEfetivo(m), hoje) : 0;
}

/** 'liquidada' | 'atrasada' | 'vence_hoje' | 'a_vencer' */
export function situacaoDoCompromisso(m, hoje) {
  if (m.status === 'liquidada') return 'liquidada';
  const vencimento = vencimentoEfetivo(m);
  if (vencimento < hoje) return 'atrasada';
  return vencimento === hoje ? 'vence_hoje' : 'a_vencer';
}

/**
 * Totais de uma lista de compromissos pendentes, em visões separadas: o que já está atrasado, o que vence
 * nos próximos `diasProximos` dias (hoje incluído) e o restante. A soma das três é o total pendente.
 */
export function totaisDeCompromissos(itens, hoje, diasProximos = 7) {
  const limite = somarDias(hoje, diasProximos);
  let atrasado = 0;
  let proximos = 0;
  let depois = 0;
  for (const m of itens) {
    const v = vencimentoEfetivo(m);
    if (v < hoje) atrasado += m.valor_centavos;
    else if (v <= limite) proximos += m.valor_centavos;
    else depois += m.valor_centavos;
  }
  return {
    atrasado_centavos: atrasado,
    vence_em_breve_centavos: proximos,
    depois_centavos: depois,
    total_centavos: atrasado + proximos + depois,
  };
}
