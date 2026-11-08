// RF-15 e RF-16: dívidas parceladas. Funções puras; a tela só formata.
// A dívida vira parcelas (despesas pendentes). Pago, restante e situação saem dos lançamentos, nunca de colunas.
import { dividirEmParcelas } from '../../contratos/dinheiro.js';
import { vencimentoEfetivo } from './compromisso.js';
import { dataDaOcorrencia } from './recorrencia.js';

/**
 * Parcelas de uma dívida: a soma fecha com o total (o resto de centavos vai para a primeira, como no cartão)
 * e o vencimento é mensal a partir do primeiro (dia 31 vira o último dia do mês quando ele não existe).
 */
export function gerarParcelas({ valor_total_centavos: total, parcelas_total: n, primeiro_vencimento: primeiro }) {
  return dividirEmParcelas(total, n).map((valor, i) => ({
    numero: i + 1,
    valor_centavos: valor,
    data_vencimento: dataDaOcorrencia(primeiro, 'mensal', i),
  }));
}

/** Texto do lançamento de uma parcela, ex.: "Financiamento (3/12)". */
export const descricaoDaParcela = (nome, numero, total) => `${nome} (${numero}/${total})`.slice(0, 200);

/**
 * Situação de uma dívida a partir dos lançamentos ligados a ela.
 * `linhas`: { divida_parcela, status, valor_centavos, data_vencimento, data_competencia } (não excluídos).
 * Baixa parcial divide a parcela em duas linhas com o mesmo número: a parcela só conta como paga quando nenhuma
 * linha dela está pendente.
 */
export function resumoDaDivida(linhas, hoje) {
  let pago = 0;
  let restante = 0;
  let vencido = 0;
  const abertas = new Set();
  const quitadas = new Set();
  const atrasadas = new Set();
  let proxima = null;

  for (const l of linhas) {
    if (l.status === 'liquidada') {
      pago += l.valor_centavos;
      quitadas.add(l.divida_parcela);
      continue;
    }
    restante += l.valor_centavos;
    abertas.add(l.divida_parcela);
    const venc = vencimentoEfetivo(l);
    if (venc < hoje) {
      vencido += l.valor_centavos;
      atrasadas.add(l.divida_parcela);
    }
    if (!proxima || venc < proxima.data_vencimento || (venc === proxima.data_vencimento && l.divida_parcela < proxima.numero)) {
      proxima = { numero: l.divida_parcela, data_vencimento: venc, valor_centavos: l.valor_centavos };
    }
  }
  const pagas = [...quitadas].filter((n) => !abertas.has(n)).length;
  const base = pago + restante;
  const situacao = linhas.length === 0 ? 'sem_parcelas' : restante === 0 ? 'quitada' : atrasadas.size > 0 ? 'atrasada' : 'em_dia';
  return {
    pago_centavos: pago,
    restante_centavos: restante,
    atrasado_centavos: vencido,
    parcelas_pagas: pagas,
    parcelas_em_aberto: abertas.size,
    parcelas_atrasadas: atrasadas.size,
    percentual_pago: base === 0 ? 0 : Math.floor((pago * 100) / base),
    proxima,
    situacao,
  };
}
