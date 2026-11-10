import { join } from 'node:path';
import { RAIZ } from '../config.js';
import { criarArmazenamentoPasta, criarArmazenamentoSupabase } from '../armazenamento/index.js';
import { abrirBanco } from './pg/conexao.js';
import { abrirBancoLocal } from './pg/pglite.js';

// Escolha do banco e do armazenamento fora do Netlify (servidor local e scripts): com DATABASE_URL usa o Postgres
// do Supabase; sem ela, PGlite em `data/pglite`, para desenvolver sem conta nenhuma. A função do Netlify NÃO passa
// por aqui: ela importa só o driver de produção, para o PGlite não entrar no pacote dela.

export const abrirBancoDaConfig = (config) =>
  config.bancoUrl ? abrirBanco(config.bancoUrl) : abrirBancoLocal(config.pastaLocal);

export function criarArmazenamentoDaConfig(config) {
  if (config.supabaseUrl && config.supabaseChave) {
    return criarArmazenamentoSupabase({ url: config.supabaseUrl, chave: config.supabaseChave });
  }
  return criarArmazenamentoPasta(join(RAIZ, 'data', 'anexos'));
}
