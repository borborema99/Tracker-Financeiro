import { z } from 'zod';
import { dataIso, idPositivo } from './comum.js';

export const TAMANHO_MAXIMO_OFX = 2 * 1024 * 1024;
export const MAXIMO_DE_TRANSACOES_OFX = 2000;

/** Prévia: só a conta que vai receber as transações (o arquivo vai no corpo). */
export const esquemaPreviaOfx = z.object({ conta_id: z.coerce.number('Escolha a conta.').int().positive('Escolha a conta.') });

export const esquemaTransacaoImportada = z.object({
  fitid: z.string().trim().min(1).max(160),
  data: dataIso,
  // Com sinal: positivo é receita, negativo é despesa. Nunca zero.
  valor_centavos: z
    .number('Informe um valor.')
    .int('O valor deve ser em centavos inteiros.')
    .refine((v) => v !== 0, 'O valor não pode ser zero.')
    .refine((v) => Math.abs(v) <= Number.MAX_SAFE_INTEGER, 'Valor grande demais.'),
  descricao: z.string().trim().max(200, 'Descrição longa demais (máx. 200).').default(''),
  categoria_id: idPositivo.nullable().optional(),
});

export const esquemaConfirmarOfx = z.object({
  conta_id: idPositivo,
  itens: z
    .array(esquemaTransacaoImportada)
    .min(1, 'Escolha ao menos uma transação.')
    .max(MAXIMO_DE_TRANSACOES_OFX, `No máximo ${MAXIMO_DE_TRANSACOES_OFX} transações por vez.`),
});
