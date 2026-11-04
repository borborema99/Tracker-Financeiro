// RF-01 e RF-03. Saldo = saldo inicial + efeito das movimentações LIQUIDADAS. Nunca é coluna editável.

function ativa(mov) {
  return mov.status === 'liquidada' && !mov.excluida_em;
}

/** Efeito (em centavos, com sinal) de uma movimentação sobre uma conta. Prevista não tem efeito. */
export function efeitoNaConta(mov, contaId) {
  if (!ativa(mov)) return 0;
  const v = mov.valor_centavos;
  if (mov.tipo === 'receita') return mov.conta_id === contaId ? v : 0;
  // Pagar fatura de cartão debita a conta, mas não é despesa (RF-04): só `saldo` enxerga este tipo.
  if (mov.tipo === 'despesa' || mov.tipo === 'pagamento_fatura') return mov.conta_id === contaId ? -v : 0;
  if (mov.tipo === 'transferencia') {
    return (mov.conta_id === contaId ? -v : 0) + (mov.conta_destino_id === contaId ? v : 0);
  }
  return 0;
}

/** { [contaId]: saldo } para as contas dadas, a partir das movimentações. */
export function calcularSaldos(contas, movimentacoes) {
  const saldos = Object.fromEntries(contas.map((c) => [c.id, c.saldo_inicial_centavos]));
  for (const mov of movimentacoes) {
    if (!ativa(mov)) continue;
    for (const id of new Set([mov.conta_id, mov.conta_destino_id])) {
      if (id != null && id in saldos) saldos[id] += efeitoNaConta(mov, id);
    }
  }
  return saldos;
}
