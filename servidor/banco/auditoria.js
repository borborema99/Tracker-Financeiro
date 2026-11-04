/** Grava uma linha em audit_log com o valor antes e depois. Deve rodar na mesma transação da escrita. */
export function auditar(db, { entidade, id, acao, antes = null, depois = null }) {
  db.prepare(
    'INSERT INTO audit_log (entidade, entidade_id, acao, antes, depois, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    entidade,
    String(id),
    acao,
    antes === null ? null : JSON.stringify(antes),
    depois === null ? null : JSON.stringify(depois),
    new Date().toISOString(),
  );
}
