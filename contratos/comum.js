import { z } from 'zod';
import './mensagens.js';

const MAX = Number.MAX_SAFE_INTEGER;

export function ehDataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** Data sem hora, AAAA-MM-DD. */
export const dataIso = z.string().refine(ehDataValida, 'Data inválida.');

/** Valor monetário positivo, em centavos inteiros. */
export const centavosPositivos = z
  .number('Informe um valor.')
  .int('O valor deve ser em centavos inteiros.')
  .positive('Informe um valor maior que zero.')
  .max(MAX, 'Valor grande demais.');

/** Valor em centavos que pode ser zero ou negativo (ex.: saldo inicial). */
export const centavos = z
  .number('Informe um valor.')
  .int('O valor deve ser em centavos inteiros.')
  .min(-MAX)
  .max(MAX, 'Valor grande demais.');

export const idPositivo = z.number().int().positive();
