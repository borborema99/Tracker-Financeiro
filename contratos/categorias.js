import { z } from 'zod';
import { idPositivo } from './comum.js';

export const TIPOS_CATEGORIA = ['despesa', 'receita'];

export const esquemaCategoria = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(60, 'Nome longo demais (máx. 60).'),
  tipo: z.enum(TIPOS_CATEGORIA, 'Escolha despesa ou receita.'),
  pai_id: idPositivo.nullable().optional(),
  arquivada: z.boolean().default(false),
});
