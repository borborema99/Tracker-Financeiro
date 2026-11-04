import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_SESSAO = 'sessao';
export const DURACAO_SESSAO_MS = 14 * 24 * 60 * 60 * 1000;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function criarSessao(db, agora = new Date()) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessoes (id_hash, criada_em, expira_em) VALUES (?, ?, ?)').run(
    hashToken(token),
    agora.toISOString(),
    new Date(agora.getTime() + DURACAO_SESSAO_MS).toISOString(),
  );
  return token;
}

export function sessaoValida(db, token, agora = new Date()) {
  if (!token) return false;
  const linha = db.prepare('SELECT expira_em FROM sessoes WHERE id_hash = ?').get(hashToken(token));
  if (!linha) return false;
  if (linha.expira_em <= agora.toISOString()) {
    encerrarSessao(db, token);
    return false;
  }
  return true;
}

export function encerrarSessao(db, token) {
  db.prepare('DELETE FROM sessoes WHERE id_hash = ?').run(hashToken(token));
}

export function limparSessoesExpiradas(db, agora = new Date()) {
  db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(agora.toISOString());
}

export function encerrarTodasSessoes(db) {
  db.prepare('DELETE FROM sessoes').run();
}

/** Token CSRF derivado da sessão: só quem tem a sessão e o segredo do servidor o calcula. */
export function tokenCsrf(token, segredo) {
  return createHmac('sha256', segredo).update(token).digest('base64url');
}

export function csrfConfere(recebido, token, segredo) {
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(tokenCsrf(token, segredo));
  return a.length === b.length && timingSafeEqual(a, b);
}
