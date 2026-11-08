import { z } from 'zod';
import { centavosPositivos, dataIso } from './comum.js';

export const TIPOS_DE_INVESTIMENTO = ['renda_fixa', 'tesouro', 'acoes', 'fii', 'fundo', 'cripto', 'previdencia', 'outro'];

export const ROTULOS_DE_INVESTIMENTO = {
  renda_fixa: 'Renda fixa',
  tesouro: 'Tesouro Direto',
  acoes: 'Ações',
  fii: 'Fundos imobiliários',
  fundo: 'Fundos',
  cripto: 'Criptomoedas',
  previdencia: 'Previdência',
  outro: 'Outro',
};

export const esquemaInvestimento = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do investimento.').max(120, 'Nome longo demais (máx. 120).'),
  tipo: z.enum(TIPOS_DE_INVESTIMENTO, 'Escolha o tipo.'),
  instituicao: z.string().trim().max(120, 'Instituição longa demais (máx. 120).').default(''),
  observacao: z.string().trim().max(1000, 'Observação longa demais (máx. 1000).').default(''),
});

export const TIPOS_DE_OPERACAO = ['aporte', 'resgate'];

/** `conta_id` é opcional: com ele o dinheiro sai (aporte) ou volta (resgate) da conta; sem ele, só o investimento muda. */
export const esquemaOperacaoInvestimento = z.object({
  tipo: z.enum(TIPOS_DE_OPERACAO, 'Escolha aporte ou resgate.'),
  valor_centavos: centavosPositivos,
  data: dataIso,
  conta_id: z.number().int().positive().nullable().optional(),
  observacao: z.string().trim().max(500, 'Observação longa demais (máx. 500).').default(''),
});

/** Valor do investimento numa data. Pode ser zero (perda total). */
export const esquemaAvaliacao = z.object({
  data: dataIso,
  valor_centavos: z
    .number('Informe um valor.')
    .int('O valor deve ser em centavos inteiros.')
    .min(0, 'O valor não pode ser negativo.')
    .max(Number.MAX_SAFE_INTEGER, 'Valor grande demais.'),
});
