import { z } from 'zod';
import { centavosPositivos, dataIso, idPositivo } from './comum.js';

export const TIPOS_MOVIMENTACAO = /** @type {const} */ (['receita', 'despesa', 'transferencia']);
export const STATUS_MOVIMENTACAO = /** @type {const} */ (['pendente', 'liquidada']);

export const ROTULOS_TIPO = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' };
export const ROTULOS_STATUS = { pendente: 'Pendente', liquidada: 'Liquidada' };

export const esquemaDivisao = z.object({
  categoria_id: idPositivo,
  valor_centavos: centavosPositivos,
});

export const esquemaMovimentacao = z.object({
  tipo: z.enum(TIPOS_MOVIMENTACAO, 'Escolha receita, despesa ou transferência.'),
  descricao: z.string().trim().max(200, 'Descrição longa demais (máx. 200).').default(''),
  valor_centavos: centavosPositivos,
  conta_id: idPositivo,
  conta_destino_id: idPositivo.nullable().optional(),
  categoria_id: idPositivo.nullable().optional(),
  divisoes: z.array(esquemaDivisao).max(20, 'No máximo 20 divisões.').default([]),
  data_competencia: dataIso,
  data_vencimento: dataIso.nullable().optional(),
  data_liquidacao: dataIso.nullable().optional(),
  status: z.enum(STATUS_MOVIMENTACAO).default('liquidada'),
  observacao: z.string().trim().max(1000, 'Observação longa demais (máx. 1000).').default(''),
  tarifa_centavos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  // Reembolso: receita ligada à despesa original (RF-05).
  reembolso_de_id: idPositivo.nullable().optional(),
});

export const esquemaLiquidar = z.object({ data_liquidacao: dataIso.nullable().optional() });

export const CAMPOS_ORDENACAO = /** @type {const} */ (['data', 'valor', 'descricao', 'criada']);
export const CAMPOS_DATA = /** @type {const} */ (['competencia', 'vencimento', 'liquidacao']);

const inteiroDaUrl = z.coerce.number().int();

/** Filtros da listagem (vêm da query string, por isso coerção). */
export const esquemaFiltros = z.object({
  q: z.string().trim().max(100).optional(),
  tipo: z.enum(TIPOS_MOVIMENTACAO).optional(),
  status: z.enum(STATUS_MOVIMENTACAO).optional(),
  conta_id: inteiroDaUrl.positive().optional(),
  categoria_id: inteiroDaUrl.positive().optional(),
  campo_data: z.enum(CAMPOS_DATA).default('competencia'),
  de: dataIso.optional(),
  ate: dataIso.optional(),
  valor_min: inteiroDaUrl.min(0).optional(),
  valor_max: inteiroDaUrl.min(0).optional(),
  ordenar: z.enum(CAMPOS_ORDENACAO).default('data'),
  direcao: z.enum(['asc', 'desc']).default('desc'),
  pagina: inteiroDaUrl.min(1).default(1),
  por_pagina: inteiroDaUrl.min(1).max(100).default(25),
});

export const esquemaMes = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).')
    .optional(),
});
