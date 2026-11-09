import { z } from 'zod';
import './mensagens.js';

export const SENHA_MINIMA = 8;

export const esquemaSenhaNova = z
  .string()
  .min(SENHA_MINIMA, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
  .max(200, 'A senha é longa demais.');

export const esquemaLogin = z.object({
  senha: z.string().min(1, 'Digite a senha.').max(200),
});

export const esquemaSessao = z.object({
  autenticado: z.boolean(),
  senhaDefinida: z.boolean(),
  demo: z.boolean(),
  csrf: z.string().optional(),
  fuso: z.string().optional(),
});
