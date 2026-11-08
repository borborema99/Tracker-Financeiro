// RF-19 e RF-20: investimentos. Carteira manual. Valor atual, resultado e rentabilidade são calculados,
// nunca digitados; sem avaliação não existe resultado (nada de zero falso, RF-10). Funções puras.

const soma = (ops, tipo) => ops.filter((o) => o.tipo === tipo).reduce((s, o) => s + o.valor_centavos, 0);

/** A avaliação mais recente (por data), ou null. */
export function ultimaAvaliacao(avaliacoes) {
  return avaliacoes.reduce((a, b) => (a == null || b.data > a.data ? b : a), null);
}

/**
 * Valor atual = última avaliação + aportes − resgates registrados DEPOIS dela. Operações até a data da avaliação
 * já estão dentro do valor informado. Sem avaliação, o valor é o custo (aportado − resgatado), e `avaliado` é false.
 */
export function valorAtual(operacoes, avaliacoes) {
  const ultima = ultimaAvaliacao(avaliacoes);
  if (!ultima) {
    return { valor_centavos: soma(operacoes, 'aporte') - soma(operacoes, 'resgate'), avaliado: false, avaliado_em: null };
  }
  const depois = operacoes.filter((o) => o.data > ultima.data);
  return {
    valor_centavos: ultima.valor_centavos + soma(depois, 'aporte') - soma(depois, 'resgate'),
    avaliado: true,
    avaliado_em: ultima.data,
  };
}

/**
 * Situação do investimento: aportado, resgatado, valor atual, resultado (valor atual + resgatado − aportado; o que
 * já foi tirado conta como ganho) e rentabilidade em % sobre o aportado. Resultado e rentabilidade são null
 * quando não há avaliação ou nada foi aportado. `encerrado`: já teve operação e o valor atual é zero.
 */
export function situacaoDoInvestimento(operacoes, avaliacoes) {
  const aportado = soma(operacoes, 'aporte');
  const resgatado = soma(operacoes, 'resgate');
  const valor = valorAtual(operacoes, avaliacoes);
  const resultado = valor.avaliado ? valor.valor_centavos + resgatado - aportado : null;
  return {
    aportado_centavos: aportado,
    resgatado_centavos: resgatado,
    valor_atual_centavos: valor.valor_centavos,
    avaliado: valor.avaliado,
    avaliado_em: valor.avaliado_em,
    resultado_centavos: resultado,
    rentabilidade_percentual: resultado != null && aportado > 0 ? Math.round((resultado * 10000) / aportado) / 100 : null,
    encerrado: operacoes.length > 0 && valor.valor_centavos === 0,
  };
}

/** Totais da carteira. Só os avaliados entram no resultado, para não misturar custo com valor de mercado. */
export function totaisDaCarteira(investimentos) {
  const avaliados = investimentos.filter((i) => i.avaliado);
  return {
    quantidade: investimentos.filter((i) => i.valor_atual_centavos > 0).length,
    aportado_centavos: investimentos.reduce((s, i) => s + i.aportado_centavos, 0),
    valor_atual_centavos: investimentos.reduce((s, i) => s + i.valor_atual_centavos, 0),
    resultado_centavos: avaliados.length > 0 ? avaliados.reduce((s, i) => s + i.resultado_centavos, 0) : null,
    sem_avaliacao: investimentos.length - avaliados.length,
  };
}
