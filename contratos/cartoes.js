import { z } from 'zod';
import { centavos, centavosPositivos, dataIso, idPositivo } from './comum.js';

export const ROTULOS_STATUS_FATURA = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  parcial: 'Paga em parte',
  paga: 'Paga',
  atrasada: 'Atrasada',
};

export const MAX_PARCELAS = 48;

const diaDoMes = (rotulo) =>
  z
    .number(`Informe o dia de ${rotulo}.`)
    .int(`O dia de ${rotulo} deve ser inteiro.`)
    .min(1, `O dia de ${rotulo} vai de 1 a 28.`)
    .max(28, `O dia de ${rotulo} vai de 1 a 28.`);

export const esquemaCartao = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(60, 'Nome longo demais (máx. 60).'),
  limite_centavos: centavos.min(0, 'O limite não pode ser negativo.'),
  dia_fechamento: diaDoMes('fechamento'),
  dia_vencimento: diaDoMes('vencimento'),
  conta_pagamento_id: idPositivo.nullable().optional(),
  arquivado: z.boolean().default(false),
});

export const esquemaCompra = z
  .object({
    cartao_id: idPositivo,
    descricao: z.string().trim().max(200, 'Descrição longa demais (máx. 200).').default(''),
    valor_total_centavos: centavosPositivos,
    categoria_id: idPositivo.nullable().optional(),
    data_compra: dataIso,
    parcelas_total: z
      .number()
      .int('Parcelas deve ser um número inteiro.')
      .min(1, 'Pelo menos 1 parcela.')
      .max(MAX_PARCELAS, `No máximo ${MAX_PARCELAS} parcelas.`)
      .default(1),
    observacao: z.string().trim().max(1000, 'Observação longa demais (máx. 1000).').default(''),
  })
  .refine((c) => c.valor_total_centavos >= c.parcelas_total, {
    path: ['parcelas_total'],
    message: 'O valor é pequeno demais para tantas parcelas (mínimo 1 centavo cada).',
  });

export const esquemaPagamentoFatura = z.object({
  valor_centavos: centavosPositivos,
  conta_id: idPositivo,
  data_pagamento: dataIso.nullable().optional(),
});

export const esquemaEstorno = z.object({
  valor_centavos: centavosPositivos,
  data_estorno: dataIso.nullable().optional(),
  descricao: z.string().trim().max(200, 'Descrição longa demais (máx. 200).').default(''),
});

export const esquemaAntecipacao = z.object({
  parcelas: z
    .array(z.number().int().min(1))
    .min(1, 'Escolha pelo menos uma parcela.')
    .max(MAX_PARCELAS),
});

const inteiroDaUrl = z.coerce.number().int();

export const esquemaListaCompras = z.object({
  pagina: inteiroDaUrl.min(1).default(1),
  por_pagina: inteiroDaUrl.min(1).max(100).default(25),
});
