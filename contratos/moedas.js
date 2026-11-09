import { z } from 'zod';
import { centavosPositivos, dataIso, idPositivo } from './comum.js';

/** Só moedas de 2 casas decimais: o dinheiro segue em "centavos" inteiros, como no resto do app. */
export const MOEDAS = {
  USD: 'Dólar americano',
  EUR: 'Euro',
  GBP: 'Libra esterlina',
  CAD: 'Dólar canadense',
  AUD: 'Dólar australiano',
  CHF: 'Franco suíço',
  ARS: 'Peso argentino',
  UYU: 'Peso uruguaio',
  MXN: 'Peso mexicano',
};
export const CODIGOS_DE_MOEDA = Object.keys(MOEDAS);

/** Limites que mantêm saldo × cotação dentro de um inteiro seguro (1e12 × 1e9 / 1e6 = 1e15). */
export const VALOR_MAXIMO_MOEDA = 1_000_000_000_000;
export const TAXA_MAXIMA_MICROS = 1_000_000_000;

const formatadores = new Map();

/** 123456, 'USD' -> "US$ 1.234,56". Só formata. */
export function formatarMoeda(centavos, moeda) {
  if (!Number.isSafeInteger(centavos)) throw new TypeError('centavos deve ser um inteiro seguro');
  if (!formatadores.has(moeda)) {
    formatadores.set(moeda, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }));
  }
  return formatadores.get(moeda).format(centavos / 100);
}

/** 5432100 -> "5,4321"; 5430000 -> "5,43". Sempre com 2 a 6 casas. */
export function formatarTaxa(micros) {
  if (!Number.isSafeInteger(micros) || micros < 0) throw new TypeError('micros deve ser um inteiro seguro');
  const inteira = Math.trunc(micros / 1_000_000);
  const fracao = String(micros % 1_000_000).padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${inteira},${fracao}`;
}

/** "5,43" | "5.4321" | "R$ 5,4321" -> 5432100. Null se não for uma cotação válida (até 6 casas). */
export function parseTaxa(texto) {
  if (typeof texto !== 'string') return null;
  let s = texto.replace(/\s/g, '').replace(/^R\$/i, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  const micros = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0') || '0');
  return Number.isSafeInteger(micros) && micros > 0 && micros <= TAXA_MAXIMA_MICROS ? micros : null;
}

const valorNaMoeda = z
  .number('Informe um valor.')
  .int('O valor deve ser em centavos inteiros.')
  .positive('Informe um valor maior que zero.')
  .max(VALOR_MAXIMO_MOEDA, 'Valor grande demais.');

const nome = z.string().trim().min(1, 'Informe o nome da conta.').max(120, 'Nome longo demais (máx. 120).');
const observacao = z.string().trim().max(1000, 'Observação longa demais (máx. 1000).').default('');

export const esquemaContaMoeda = z.object({
  nome,
  moeda: z.enum(CODIGOS_DE_MOEDA, 'Escolha a moeda.'),
  saldo_inicial_centavos: z
    .number('Informe um valor.')
    .int('O valor deve ser em centavos inteiros.')
    .min(0, 'O saldo inicial não pode ser negativo.')
    .max(VALOR_MAXIMO_MOEDA, 'Valor grande demais.')
    .default(0),
  observacao,
});

/** Depois de criada, a moeda e o saldo inicial não mudam (o saldo se ajusta com depósito e saque). */
export const esquemaEdicaoContaMoeda = z.object({ nome, observacao });

export const TIPOS_DE_OPERACAO_MOEDA = /** @type {const} */ (['deposito', 'saque', 'compra', 'venda']);
export const ROTULOS_DE_OPERACAO_MOEDA = { deposito: 'Depósito', saque: 'Saque', compra: 'Compra', venda: 'Venda' };
export const OPERACOES_COM_CONTA = /** @type {const} */ (['compra', 'venda']);

/**
 * Compra e venda trocam moeda por reais de uma conta (valor em reais e conta obrigatórios); depósito e saque só
 * mexem na conta em moeda estrangeira (sem reais, sem conta).
 */
export const esquemaOperacaoMoeda = z
  .object({
    tipo: z.enum(TIPOS_DE_OPERACAO_MOEDA, 'Escolha o tipo da operação.'),
    valor_centavos: valorNaMoeda,
    valor_brl_centavos: centavosPositivos.nullable().optional(),
    data: dataIso,
    conta_id: idPositivo.nullable().optional(),
    observacao: z.string().trim().max(500, 'Observação longa demais (máx. 500).').default(''),
  })
  .refine((o) => !OPERACOES_COM_CONTA.includes(o.tipo) || o.valor_brl_centavos != null, {
    path: ['valor_brl_centavos'],
    message: 'Informe quanto foi em reais.',
  })
  .refine((o) => !OPERACOES_COM_CONTA.includes(o.tipo) || o.conta_id != null, {
    path: ['conta_id'],
    message: 'Escolha a conta em reais.',
  })
  .refine((o) => OPERACOES_COM_CONTA.includes(o.tipo) || (o.valor_brl_centavos == null && o.conta_id == null), {
    path: ['tipo'],
    message: 'Depósito e saque não usam conta em reais. Use compra ou venda.',
  });

export const esquemaCotacao = z.object({
  moeda: z.enum(CODIGOS_DE_MOEDA, 'Escolha a moeda.'),
  data: dataIso,
  taxa_micros: z
    .number('Informe a cotação.')
    .int('A cotação deve ser inteira em milionésimos.')
    .positive('A cotação deve ser maior que zero.')
    .max(TAXA_MAXIMA_MICROS, 'Cotação grande demais.'),
});
