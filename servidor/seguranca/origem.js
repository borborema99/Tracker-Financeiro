import { isIP } from 'node:net';

/** "http://Meu-PC.ts.net:3000/x" | "meu-pc.ts.net:3000" | "[::1]:3000" -> hostname minúsculo sem porta. */
export function hostnameDe(texto) {
  if (typeof texto !== 'string' || texto === '') return null;
  const semEsquema = texto.replace(/^[a-z]+:\/\//i, '').split('/')[0];
  const m = semEsquema.match(/^\[([^\]]+)\](?::\d+)?$/) ?? semEsquema.match(/^([^:]+)(?::\d+)?$/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Aceita localhost, IP literal e os hosts listados em ORIGENS_PERMITIDAS.
 * Nomes de domínio fora da lista são recusados (proteção contra DNS rebinding).
 */
export function hostPermitido(hostHeader, permitidos = []) {
  const nome = hostnameDe(hostHeader);
  if (!nome) return false;
  if (nome === 'localhost' || isIP(nome) !== 0) return true;
  return permitidos.some((p) => hostnameDe(p) === nome);
}

/** A Origin precisa existir, ser do mesmo host da requisição e ter host permitido. */
export function origemValida(origin, hostHeader, permitidos = []) {
  if (typeof origin !== 'string' || origin === 'null') return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return url.host.toLowerCase() === String(hostHeader).toLowerCase() && hostPermitido(url.host, permitidos);
}
