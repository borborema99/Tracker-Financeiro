import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Em HTTPS o cookie é `__Host-sessao` (HttpOnly, Secure, SameSite=Strict, Path=/, sem Domain: o navegador recusa
// o prefixo se faltar qualquer um). Só no desenvolvimento local, em http, vale o nome simples e sem Secure.
export const COOKIE_SESSAO = 'sessao';
export const COOKIE_SESSAO_SEGURO = '__Host-sessao';
export const DURACAO_SESSAO_MS = 14 * 24 * 60 * 60 * 1000;

export const nomeDoCookie = (seguro) => (seguro ? COOKIE_SESSAO_SEGURO : COOKIE_SESSAO);

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Só o SHA-256 do token vai para o banco; o token em si só existe no cookie. */
export async function criarSessao(banco, usuarioId, agora = new Date()) {
  const token = randomBytes(32).toString('base64url');
  await banco.consultar('INSERT INTO sessoes (id_hash, usuario_id, criada_em, expira_em) VALUES ($1, $2, $3, $4)', [
    hashToken(token),
    usuarioId,
    agora.toISOString(),
    new Date(agora.getTime() + DURACAO_SESSAO_MS).toISOString(),
  ]);
  return token;
}

/** Devolve `{ usuarioId, nome, demo }` da sessão válida, ou null (token ausente, desconhecido ou vencido). */
export async function buscarSessao(banco, token, agora = new Date()) {
  if (!token) return null;
  const [linha] = await banco.consultar(
    `SELECT s.expira_em, u.id AS usuario_id, u.nome_usuario, u.demo
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id_hash = $1`,
    [hashToken(token)],
  );
  if (!linha) return null;
  if (linha.expira_em <= agora.toISOString()) {
    await encerrarSessao(banco, token);
    return null;
  }
  return { usuarioId: linha.usuario_id, nome: linha.nome_usuario, demo: linha.demo };
}

export async function encerrarSessao(banco, token) {
  await banco.consultar('DELETE FROM sessoes WHERE id_hash = $1', [hashToken(token)]);
}

export async function limparSessoesExpiradas(banco, agora = new Date()) {
  await banco.consultar('DELETE FROM sessoes WHERE expira_em <= $1', [agora.toISOString()]);
}

/** "Sair dos outros aparelhos": mantém só a sessão atual. Devolve quantas foram encerradas. */
export async function encerrarOutrasSessoes(banco, usuarioId, tokenAtual) {
  const apagadas = await banco.consultar('DELETE FROM sessoes WHERE usuario_id = $1 AND id_hash <> $2 RETURNING id_hash', [
    usuarioId,
    hashToken(tokenAtual),
  ]);
  return apagadas.length;
}

export async function encerrarTodasSessoes(banco, usuarioId) {
  await banco.consultar('DELETE FROM sessoes WHERE usuario_id = $1', [usuarioId]);
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
