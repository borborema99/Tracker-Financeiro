import { z } from 'zod';
import './mensagens.js';

export const FUSO_PADRAO = 'America/Sao_Paulo';

export function fusoValido(fuso) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

export const esquemaConfig = z.object({
  fuso: z.string().refine(fusoValido, 'Fuso horário inválido.'),
});
