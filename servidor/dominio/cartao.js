// RF-04, RF-05 e RF-06. Funções puras do cartão de crédito: em qual fatura cai cada compra, parcelas,
// total e situação da fatura, limite disponível e projeção. Nada aqui lê banco nem relógio.
import { dividirEmParcelas } from '../../contratos/dinheiro.js';

const dois = (n) => String(n).padStart(2, '0');

/** 'AAAA-MM' + n meses -> 'AAAA-MM'. */
export function somarMeses(referencia, n) {
  const [ano, mes] = referencia.split('-').map(Number);
  const indice = ano * 12 + (mes - 1) + n;
  return `${Math.floor(indice / 12)}-${dois((indice % 12) + 1)}`;
}

/**
 * RF-04: a compra entra na fatura que fecha no mês da compra se o dia for até o dia de fechamento
 * (inclusive); depois disso, entra na fatura do mês seguinte.
 */
export function referenciaDaCompra(dataCompra, diaFechamento) {
  const referencia = dataCompra.slice(0, 7);
  return Number(dataCompra.slice(8, 10)) <= diaFechamento ? referencia : somarMeses(referencia, 1);
}

/** Fechamento no mês da referência; vencimento no mesmo mês se o dia for depois do fechamento, senão no seguinte. */
export function datasDaFatura(referencia, diaFechamento, diaVencimento) {
  const mesVencimento = diaVencimento > diaFechamento ? referencia : somarMeses(referencia, 1);
  return {
    data_fechamento: `${referencia}-${dois(diaFechamento)}`,
    data_vencimento: `${mesVencimento}-${dois(diaVencimento)}`,
  };
}

/**
 * RF-05: uma parcela por fatura, cada uma com seu vencimento. A soma fecha com o total e o resto de
 * centavos vai para a primeira parcela. Devolve [{ numero, valor_centavos, referencia }].
 */
export function gerarParcelas(valorTotalCentavos, quantidade, dataCompra, diaFechamento) {
  const primeira = referenciaDaCompra(dataCompra, diaFechamento);
  return dividirEmParcelas(valorTotalCentavos, quantidade).map((valor, i) => ({
    numero: i + 1,
    valor_centavos: valor,
    referencia: somarMeses(primeira, i),
  }));
}

/**
 * Totais de cada fatura. `faturas`: [{ id, cartao_id, referencia, data_fechamento, data_vencimento }];
 * `parcelas`, `estornos` e `pagamentos`: linhas com { fatura_id, valor_centavos }.
 *
 * Estorno é crédito: abate a fatura em que caiu e, se sobrar, o resto passa para a fatura seguinte do
 * mesmo cartão (nada se perde). `total_centavos` já tem os créditos aplicados; `saldo_centavos` é o que
 * falta pagar (nunca negativo).
 */
export function consolidarFaturas({ faturas, parcelas = [], estornos = [], pagamentos = [] }) {
  const soma = (linhas) => {
    const mapa = new Map();
    for (const l of linhas) mapa.set(l.fatura_id, (mapa.get(l.fatura_id) ?? 0) + l.valor_centavos);
    return mapa;
  };
  const brutos = soma(parcelas);
  const creditos = soma(estornos);
  const pagos = soma(pagamentos);

  const ordenadas = [...faturas].sort(
    (a, b) => a.cartao_id - b.cartao_id || a.referencia.localeCompare(b.referencia),
  );
  const transporte = new Map(); // cartao_id -> crédito que sobrou da fatura anterior
  return ordenadas.map((f) => {
    const bruto = brutos.get(f.id) ?? 0;
    const creditoDaFatura = creditos.get(f.id) ?? 0;
    const disponivel = creditoDaFatura + (transporte.get(f.cartao_id) ?? 0);
    const abatido = Math.min(bruto, disponivel);
    transporte.set(f.cartao_id, disponivel - abatido);
    const total = bruto - abatido;
    const pago = pagos.get(f.id) ?? 0;
    return {
      ...f,
      bruto_centavos: bruto,
      credito_centavos: abatido,
      total_centavos: total,
      pago_centavos: pago,
      saldo_centavos: Math.max(0, total - pago),
      credito_a_transportar_centavos: disponivel - abatido,
    };
  });
}

/** Situação calculada da fatura (nunca digitada): paga > atrasada > parcial > fechada > aberta. */
export function statusDaFatura(fatura, hoje) {
  const { total_centavos: total, pago_centavos: pago } = fatura;
  if (total === 0) return hoje > fatura.data_fechamento ? 'paga' : 'aberta';
  if (pago >= total) return 'paga';
  if (hoje > fatura.data_vencimento) return 'atrasada';
  if (pago > 0) return 'parcial';
  return hoje > fatura.data_fechamento ? 'fechada' : 'aberta';
}

/** Referência da fatura aberta hoje (a que ainda recebe compras feitas hoje). */
export const referenciaAtual = (hoje, diaFechamento) => referenciaDaCompra(hoje, diaFechamento);

/**
 * RF-06: limite do cartão e saldo bancário são separados. Limite disponível = limite total − faturas não
 * pagas (da atual para trás) − parcelas futuras ainda não pagas (faturas depois da atual).
 * Pagar a fatura libera o limite; o saldo da conta não entra nesta conta.
 */
export function limiteDoCartao({ limite_centavos: limite, faturas, hoje, dia_fechamento: diaFechamento }) {
  const atual = referenciaAtual(hoje, diaFechamento);
  let emFaturas = 0;
  let futuras = 0;
  for (const f of faturas) {
    if (f.referencia <= atual) emFaturas += f.saldo_centavos;
    else futuras += f.saldo_centavos;
  }
  return {
    limite_centavos: limite,
    faturas_nao_pagas_centavos: emFaturas,
    parcelas_futuras_centavos: futuras,
    usado_centavos: emFaturas + futuras,
    disponivel_centavos: limite - emFaturas - futuras,
  };
}

/** Projeção das próximas faturas (da atual em diante, até `meses` meses): é uma visão projetada, separada do realizado. */
export function projetarFaturas({ faturas, hoje, dia_fechamento: diaFechamento, meses = 12 }) {
  const atual = referenciaAtual(hoje, diaFechamento);
  const ultima = somarMeses(atual, meses - 1);
  const itens = faturas
    .filter((f) => f.referencia >= atual && f.referencia <= ultima && f.total_centavos > 0)
    .map((f) => ({
      fatura_id: f.id,
      referencia: f.referencia,
      data_fechamento: f.data_fechamento,
      data_vencimento: f.data_vencimento,
      total_centavos: f.total_centavos,
      saldo_centavos: f.saldo_centavos,
    }));
  return { itens, total_centavos: itens.reduce((s, i) => s + i.saldo_centavos, 0) };
}

/**
 * RF-04: a compra no cartão é despesa UMA vez, na data da compra, pelo valor total (as parcelas só
 * distribuem o pagamento pelas faturas). O estorno reduz a despesa na data do estorno. Pagar fatura não
 * aparece aqui: não é despesa. Devolve linhas no formato que `resumo.js` já entende.
 */
export function movimentosDeCartao(compras, estornos) {
  const comoDespesa = (valor, data) => ({
    tipo: 'despesa',
    valor_centavos: valor,
    status: 'liquidada',
    data_competencia: data,
    data_vencimento: null,
    data_liquidacao: data,
  });
  return [
    ...compras.map((c) => comoDespesa(c.valor_total_centavos, c.data_compra)),
    ...estornos.map((e) => comoDespesa(-e.valor_centavos, e.data_estorno)),
  ];
}
