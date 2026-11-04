import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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

function caminho(valor, padrao) {
  const c = valor || padrao;
  return isAbsolute(c) ? c : join(RAIZ, c);
}

export function lerAmbiente(env = process.env) {
  return {
    porta: Number(env.PORT) || 3000,
    exporNaRede: env.EXPOR_NA_REDE === '1',
    httpsCert: env.HTTPS_CERT ? caminho(env.HTTPS_CERT) : null,
    httpsKey: env.HTTPS_KEY ? caminho(env.HTTPS_KEY) : null,
    origensPermitidas: lista(env.ORIGENS_PERMITIDAS),
    segredo: env.SEGREDO_SESSAO ?? '',
    caminhoBanco: caminho(env.DB_PATH, 'data/tracker.db'),
    demo: env.DEMO === '1',
    pastaWeb: join(RAIZ, 'web', 'dist'),
  };
}
