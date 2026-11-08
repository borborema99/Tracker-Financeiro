// RF-17: custo equivalente das assinaturas. Funções puras; a tela só formata.
// A conta parte do custo ANUAL, que é exato em centavos; o mensal é o anual dividido por 12, arredondado uma vez.

const COBRANCAS_POR_ANO = { semanal: 52, quinzenal: 26, mensal: 12, anual: 1 };

/** Quanto a assinatura custa em um ano (valor × cobranças por ano). */
export function custoAnualCentavos(valorCentavos, frequencia) {
  const n = COBRANCAS_POR_ANO[frequencia];
  if (n === undefined) throw new RangeError(`frequência desconhecida: ${frequencia}`);
  return valorCentavos * n;
}

/** Custo mensal equivalente: anual ÷ 12, arredondado para o centavo mais próximo. */
export const custoMensalEquivalenteCentavos = (valorCentavos, frequencia) =>
  Math.round(custoAnualCentavos(valorCentavos, frequencia) / 12);

/**
 * Totais das assinaturas ATIVAS (pausada não gera cobrança, então não pesa). O total mensal sai da soma dos
 * custos anuais dividida por 12, para a soma de arredondamentos individuais não desviar do total.
 */
export function totaisDeAssinaturas(assinaturas) {
  const ativas = assinaturas.filter((a) => a.ativa);
  const anual = ativas.reduce((s, a) => s + custoAnualCentavos(a.valor_centavos, a.frequencia), 0);
  return { ativas: ativas.length, pausadas: assinaturas.length - ativas.length, anual_centavos: anual, mensal_centavos: Math.round(anual / 12) };
}
