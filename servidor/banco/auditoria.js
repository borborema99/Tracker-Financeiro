/**
 * Grava uma linha em audit_log com o valor antes e depois, no escopo do usuário. Deve rodar na mesma
 * transação da escrita. jsonb entra como texto: `$n::text::jsonb` (ver ADR 013).
 */
export async function auditar(esc, { entidade, id, acao, antes = null, depois = null }) {
  await esc.rodar(
    `INSERT INTO audit_log (usuario_id, entidade, entidade_id, acao, antes, depois, criado_em)
     VALUES (:u, ?, ?, ?, ?::text::jsonb, ?::text::jsonb, ?)`,
    [
      entidade,
      String(id),
      acao,
      antes === null ? null : JSON.stringify(antes),
      depois === null ? null : JSON.stringify(depois),
      new Date().toISOString(),
    ],
  );
}
