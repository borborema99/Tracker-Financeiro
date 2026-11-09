import { z } from 'zod';
import { dataIso } from './comum.js';

export const AGRUPAMENTOS = /** @type {const} */ (['dia', 'semana', 'mes', 'ano']);
export const ROTULOS_AGRUPAMENTO = { dia: 'Diário', semana: 'Semanal', mes: 'Mensal', ano: 'Anual' };
export const HORIZONTES = /** @type {const} */ ([7, 15, 30, 60, 90]);

export const esquemaFluxo = z
  .object({
    de: dataIso,
    ate: dataIso,
    agrupar: z.enum(AGRUPAMENTOS).default('mes'),
  })
  .refine((f) => f.de <= f.ate, { path: ['ate'], message: 'A data final não pode ser antes da inicial.' });

export const esquemaProjecao = z.object({
  dias: z.coerce
    .number()
    .int()
    .refine((d) => HORIZONTES.includes(d), 'Use 7, 15, 30, 60 ou 90 dias.')
    .default(30),
});
