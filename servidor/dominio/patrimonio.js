// RF-21: patrimônio líquido = ativos − passivos, com cada parte vinda de um módulo que existe.
// Ativos: saldo das contas e valor atual dos investimentos. Passivos: faturas não pagas e parcelas futuras
// do cartão, e o restante das dívidas. Contas a pagar comuns não entram (não são dívida contraída). Função pura.

/**
 * `contas`: [{ saldo_centavos }]; `investimentos`: totaisDaCarteira ou null; `cartoes`: resumo dos cartões ou null;
 * `dividas`: resumo das dívidas ou null. Parte que não existe fica fora do resultado (nada de zero falso).
 */
export function calcularPatrimonio({ contas, investimentos, cartoes, dividas }) {
  const ativos = { contas_centavos: contas.reduce((s, c) => s + c.saldo_centavos, 0) };
  if (investimentos) ativos.investimentos_centavos = investimentos.valor_atual_centavos;
  ativos.total_centavos = Object.values(ativos).reduce((s, v) => s + v, 0);

  const passivos = {};
  if (cartoes) passivos.cartoes_centavos = cartoes.faturas_nao_pagas_centavos + cartoes.parcelas_futuras_centavos;
  if (dividas) passivos.dividas_centavos = dividas.restante_centavos;
  passivos.total_centavos = Object.values(passivos).reduce((s, v) => s + v, 0);

  return { ativos, passivos, patrimonio_liquido_centavos: ativos.total_centavos - passivos.total_centavos };
}
