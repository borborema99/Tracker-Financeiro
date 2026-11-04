import { z } from 'zod';
import { centavosPositivos, dataIso } from './comum.js';

export const SITUACOES_COMPROMISSO = ['atrasada', 'a_vencer'];
export const ROTULOS_SITUACAO = {
  atrasada: 'Atrasada',
  vence_hoje: 'Vence hoje',
  a_vencer: 'A vencer',
  liquidada: 'Liquidada',
};

const inteiroDaUrl = z.coerce.number().int();

export const esquemaFiltrosCompromissos = z.object({
  tipo: z.enum(['receita', 'despesa']).default('despesa'),
  situacao: z.enum(SITUACOES_COMPROMISSO).optional(),
  pagina: inteiroDaUrl.min(1).default(1),
  por_pagina: inteiroDaUrl.min(1).max(100).default(50),
});

export const esquemaBaixaParcial = z.object({
  valor_centavos: centavosPositivos,
  data_liquidacao: dataIso.nullable().optional(),
});

export const esquemaReagendar = z.object({ data_vencimento: dataIso });
