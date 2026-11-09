// RF-28 a RF-30: contas em outra moeda. O saldo é calculado das operações, na própria moeda, e só vira reais com uma
// cotação que a pessoa informou; sem cotação não há valor em reais (nada de zero falso). Funções puras.
// Nunca somamos moedas diferentes: cada saldo fica na sua moeda até ser convertido, conta a conta.

const SINAL = { deposito: 1, compra: 1, saque: -1, venda: -1 };
const MILHAO = 1_000_000n;

/** Divide arredondando para o inteiro mais próximo (metade se afasta do zero). */
function dividirArredondando(numerador, denominador) {
  const negativo = numerador < 0n;
  const abs = negativo ? -numerador : numerador;
  const q = (abs + denominador / 2n) / denominador;
  return Number(negativo ? -q : q);
}

/** Valor em centavos da moeda × cotação (reais por unidade, em milionésimos) = centavos de real. Sem float. */
export function converterParaBrl(valorCentavos, taxaMicros) {
  return dividirArredondando(BigInt(valorCentavos) * BigInt(taxaMicros), MILHAO);
}

/** Cotação que a compra ou venda embute: reais pagos ÷ unidades recebidas, em milionésimos. */
export function taxaImplicita(valorCentavos, valorBrlCentavos) {
  return dividirArredondando(BigInt(valorBrlCentavos) * MILHAO, BigInt(valorCentavos));
}

/** Saldo na moeda = saldo inicial + depósitos e compras − saques e vendas (RF-28). */
export function saldoNaMoeda(saldoInicialCentavos, operacoes) {
  return operacoes.reduce((s, o) => s + SINAL[o.tipo] * o.valor_centavos, saldoInicialCentavos);
}

/** Cotação mais recente da moeda até `hoje`; no mesmo dia vale a última informada. Null se não houver. */
export function cotacaoVigente(cotacoes, moeda, hoje) {
  let melhor = null;
  for (const c of cotacoes) {
    if (c.moeda !== moeda || c.data > hoje) continue;
    if (!melhor || c.data > melhor.data || (c.data === melhor.data && c.id > melhor.id)) melhor = c;
  }
  return melhor;
}

/**
 * Situação de uma conta em moeda estrangeira. `conta`: { moeda, saldo_inicial_centavos }; `operacoes`: as não
 * excluídas; `cotacoes`: todas as não excluídas (de qualquer moeda).
 */
export function situacaoDaContaMoeda(conta, operacoes, cotacoes, hoje) {
  const saldo = saldoNaMoeda(conta.saldo_inicial_centavos, operacoes);
  const cotacao = cotacaoVigente(cotacoes, conta.moeda, hoje);
  return {
    saldo_centavos: saldo,
    encerrada: saldo === 0 && operacoes.length > 0,
    cotacao: cotacao ? { taxa_micros: cotacao.taxa_micros, data: cotacao.data } : null,
    valor_brl_centavos: cotacao ? converterParaBrl(saldo, cotacao.taxa_micros) : null,
  };
}

/**
 * Totais para o início e o patrimônio. `contas`: situações já calculadas. Só existe com saldo em alguma conta
 * (RF-10). Conta com saldo e sem cotação fica de fora da soma e é contada em `sem_cotacao`.
 */
export function totaisDeMoedas(contas) {
  const abertas = contas.filter((c) => c.saldo_centavos > 0);
  if (abertas.length === 0) return null;
  const convertidas = abertas.filter((c) => c.valor_brl_centavos != null);
  return {
    quantidade: abertas.length,
    com_cotacao: convertidas.length,
    sem_cotacao: abertas.length - convertidas.length,
    valor_brl_centavos: convertidas.reduce((s, c) => s + c.valor_brl_centavos, 0),
  };
}
