import { z } from 'zod';
import { centavosPositivos, dataIso, idPositivo } from './comum.js';

export const FREQUENCIAS = /** @type {const} */ (['semanal', 'quinzenal', 'mensal', 'anual']);
export const ROTULOS_FREQUENCIA = {
  semanal: 'Toda semana',
  quinzenal: 'A cada 15 dias',
  mensal: 'Todo mês',
  anual: 'Todo ano',
};

export const esquemaRecorrencia = z
  .object({
    tipo: z.enum(['receita', 'despesa'], 'Escolha receita ou despesa.'),
    descricao: z.string().trim().min(1, 'Informe a descrição.').max(200, 'Descrição longa demais (máx. 200).'),
    valor_centavos: centavosPositivos,
    conta_id: idPositivo,
    categoria_id: idPositivo.nullable().optional(),
    frequencia: z.enum(FREQUENCIAS, 'Escolha a frequência.'),
    data_inicio: dataIso,
    data_fim: dataIso.nullable().optional(),
    ativa: z.boolean().default(true),
    assinatura: z.boolean().default(false),
    observacao: z.string().trim().max(1000, 'Observação longa demais (máx. 1000).').default(''),
  })
  .refine((r) => !r.assinatura || r.tipo === 'despesa', {
    path: ['assinatura'],
    message: 'Só uma despesa pode ser assinatura.',
  })
  .refine((r) => !r.data_fim || r.data_fim >= r.data_inicio, {
    path: ['data_fim'],
    message: 'A data final não pode ser antes da inicial.',
  });
