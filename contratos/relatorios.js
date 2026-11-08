import { z } from 'zod';
import { ehDataValida } from './comum.js';

const data = (rotulo) => z.string().refine(ehDataValida, `${rotulo} inválida (use AAAA-MM-DD).`);

/** Evolução dos últimos N meses (o mês atual conta como o último). */
export const esquemaEvolucao = z.object({
  meses: z.coerce.number('Informe a quantidade de meses.').int().min(1, 'Mínimo 1 mês.').max(24, 'Máximo 24 meses.').default(6),
});

export const DIAS_MAXIMOS_DO_PERIODO = 731;

/** Período dos relatórios. Sem datas, vale o mês atual (o servidor completa). */
export const esquemaPeriodo = z
  .object({
    de: data('Data inicial').optional(),
    ate: data('Data final').optional(),
    tipo: z.enum(['despesa', 'receita'], 'Escolha despesa ou receita.').default('despesa'),
    limite: z.coerce.number().int().min(1, 'Mínimo 1.').max(50, 'Máximo 50.').default(10),
  })
  .refine((p) => (p.de == null) === (p.ate == null), { message: 'Informe as duas datas ou nenhuma.', path: ['ate'] })
  .refine((p) => p.de == null || p.de <= p.ate, { message: 'A data final não pode ser anterior à inicial.', path: ['ate'] })
  .refine(
    (p) => p.de == null || (Date.parse(`${p.ate}T00:00:00Z`) - Date.parse(`${p.de}T00:00:00Z`)) / 86400000 < DIAS_MAXIMOS_DO_PERIODO,
    { message: 'O período pode ter no máximo 2 anos.', path: ['ate'] },
  );
