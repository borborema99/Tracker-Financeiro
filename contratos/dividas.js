import { z } from 'zod';
import { centavosPositivos, dataIso, idPositivo } from './comum.js';

const nome = z.string().trim().min(1, 'Informe o nome da dívida.').max(120, 'Nome longo demais (máx. 120).');
const credor = z.string().trim().max(120, 'Credor longo demais (máx. 120).').default('');
const observacao = z.string().trim().max(1000, 'Observação longa demais (máx. 1000).').default('');

/** Cria a dívida e gera as parcelas como despesas pendentes. */
export const esquemaDivida = z.object({
  nome,
  credor,
  valor_total_centavos: centavosPositivos,
  parcelas_total: z
    .number('Informe o número de parcelas.')
    .int('O número de parcelas deve ser inteiro.')
    .min(1, 'Mínimo de 1 parcela.')
    .max(360, 'Máximo de 360 parcelas.'),
  primeiro_vencimento: dataIso,
  conta_id: idPositivo,
  categoria_id: idPositivo.nullable().optional(),
  observacao,
});

/** Depois de criada, só os textos mudam: valor e parcelas se ajustam nos lançamentos de cada parcela. */
export const esquemaEdicaoDivida = z.object({ nome, credor, observacao });
