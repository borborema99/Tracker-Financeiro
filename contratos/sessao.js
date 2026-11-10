import { z } from 'zod';
import './mensagens.js';

export const SENHA_MINIMA = 8;

export const esquemaSenhaNova = z
  .string()
  .min(SENHA_MINIMA, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
  .max(200, 'A senha é longa demais.');

/** Mesma regra da coluna `usuarios.nome_usuario` (migration 001). */
export const REGEX_NOME_USUARIO = /^[A-Za-z0-9._-]{3,32}$/;

export const esquemaNomeUsuario = z
  .string()
  .trim()
  .regex(REGEX_NOME_USUARIO, 'Use de 3 a 32 letras, números, ponto, hífen ou sublinhado.');

export const esquemaLogin = z.object({
  usuario: z.string().trim().min(1, 'Digite o usuário.').max(64),
  senha: z.string().min(1, 'Digite a senha.').max(200),
});

export const esquemaCadastro = z.object({
  usuario: esquemaNomeUsuario,
  senha: esquemaSenhaNova,
});

export const esquemaTrocaSenha = z.object({
  senha_atual: z.string().min(1, 'Digite a senha atual.').max(200),
  senha_nova: esquemaSenhaNova,
});

/** Apagar a conta exige digitar o nome de usuário e a senha: não basta ter a sessão aberta. */
export const esquemaExclusaoConta = z.object({
  confirmacao: z.string().min(1, 'Digite seu nome de usuário para confirmar.').max(64),
  senha: z.string().min(1, 'Digite a senha.').max(200),
});

export const esquemaSessao = z.object({
  autenticado: z.boolean(),
  /** O cadastro público só existe com CADASTRO_ABERTO=1; o front esconde o link quando é false. */
  cadastroAberto: z.boolean(),
  demo: z.boolean(),
  usuario: z.string().optional(),
  csrf: z.string().optional(),
  fuso: z.string().optional(),
});
