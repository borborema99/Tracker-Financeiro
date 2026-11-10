import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Carrega o .env da raiz sem sobrescrever variáveis já definidas no ambiente. */
export function carregarEnv() {
  const arquivo = join(RAIZ, '.env');
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
}

function lista(valor) {
  return (valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Tudo vem de variável de ambiente do servidor (ADR 013). Nenhuma delas vai para o navegador nem para variável
 * `VITE_`. `bancoUrl` vazio significa desenvolvimento local, com PGlite em `data/pglite`.
 */
export function lerAmbiente(env = process.env) {
  const siteUrl = (env.SITE_URL ?? '').replace(/\/+$/, '');
  return {
    porta: Number(env.PORT) || 3000,
    bancoUrl: env.DATABASE_URL ?? '',
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabaseChave: env.SUPABASE_SERVICE_KEY ?? '',
    segredo: env.SEGREDO_SESSAO ?? '',
    pepper: env.SENHA_PEPPER ?? '',
    chaveIp: env.HMAC_CHAVE_IP ?? '',
    cadastroAberto: env.CADASTRO_ABERTO === '1',
    siteUrl,
    // O host do site entra sozinho; ORIGENS_PERMITIDAS serve a domínios extras (domínio próprio, previews).
    origensPermitidas: [...(siteUrl ? [siteUrl] : []), ...lista(env.ORIGENS_PERMITIDAS)],
    pastaLocal: join(RAIZ, 'data', 'pglite'),
    pastaWeb: join(RAIZ, 'frontend', 'dist'),
  };
}

/** Segredos que o servidor não funciona sem. Devolve os nomes das variáveis que faltam. */
export function variaveisFaltando(config) {
  const exigidas = [
    ['SEGREDO_SESSAO', config.segredo],
    ['SENHA_PEPPER', config.pepper],
    ['HMAC_CHAVE_IP', config.chaveIp],
  ];
  return exigidas.filter(([, valor]) => !valor).map(([nome]) => nome);
}
