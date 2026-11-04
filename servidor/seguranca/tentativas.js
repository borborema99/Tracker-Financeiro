export const MAX_ERROS = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;

/** Devolve { bloqueado, segundos }. Zera o contador se o bloqueio já expirou. */
export function verificarBloqueio(db, chave, agora = new Date()) {
  const linha = db.prepare('SELECT bloqueado_ate FROM tentativas_login WHERE chave = ?').get(chave);
  if (!linha?.bloqueado_ate) return { bloqueado: false, segundos: 0 };
  const fim = new Date(linha.bloqueado_ate).getTime();
  if (fim > agora.getTime()) {
    return { bloqueado: true, segundos: Math.ceil((fim - agora.getTime()) / 1000) };
  }
  limparTentativas(db, chave);
  return { bloqueado: false, segundos: 0 };
}

export function registrarErro(db, chave, agora = new Date()) {
  const atual = db.prepare('SELECT erros FROM tentativas_login WHERE chave = ?').get(chave)?.erros ?? 0;
  const erros = atual + 1;
  const bloqueadoAte = erros >= MAX_ERROS ? new Date(agora.getTime() + BLOQUEIO_MS).toISOString() : null;
  db.prepare(
    `INSERT INTO tentativas_login (chave, erros, bloqueado_ate, atualizado_em) VALUES (?, ?, ?, ?)
     ON CONFLICT(chave) DO UPDATE SET erros = excluded.erros, bloqueado_ate = excluded.bloqueado_ate,
       atualizado_em = excluded.atualizado_em`,
  ).run(chave, erros, bloqueadoAte, agora.toISOString());
  return { erros, bloqueado: bloqueadoAte !== null };
}

export function limparTentativas(db, chave) {
  db.prepare('DELETE FROM tentativas_login WHERE chave = ?').run(chave);
}
