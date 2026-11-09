import { z } from 'zod';
import { centavosPositivos, dataIso } from './comum.js';

const mesIso = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).');

/** Limite mensal de uma categoria, valendo de `mes_inicio` em diante. Zero tira o orçamento a partir daquele mês. */
export const esquemaLimiteOrcamento = z.object({
  mes_inicio: mesIso,
  limite_centavos: z
    .number('Informe um valor.')
    .int('O valor deve ser em centavos inteiros.')
    .min(0, 'O limite não pode ser negativo.')
    .max(Number.MAX_SAFE_INTEGER, 'Valor grande demais.'),
});

export const esquemaMeta = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da meta.').max(120, 'Nome longo demais (máx. 120).'),
  valor_alvo_centavos: centavosPositivos,
  prazo: dataIso.nullable().optional(),
  observacao: z.string().trim().max(1000, 'Observação longa demais (máx. 1000).').default(''),
});

export const TIPOS_DE_APORTE = /** @type {const} */ (['aporte', 'resgate']);

export const esquemaAporte = z.object({
  tipo: z.enum(TIPOS_DE_APORTE, 'Escolha aporte ou resgate.'),
  valor_centavos: centavosPositivos,
  data: dataIso,
  observacao: z.string().trim().max(500, 'Observação longa demais (máx. 500).').default(''),
});
