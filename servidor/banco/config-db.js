/** Configuração do usuário do escopo (fuso, preferências). Cada usuário tem a sua. */
export async function lerConfig(esc, chave) {
  const linha = await esc.um('SELECT valor FROM config WHERE usuario_id = :u AND chave = ?', [chave]);
  return linha?.valor ?? null;
}

export async function gravarConfig(esc, chave, valor) {
  await esc.rodar(
    `INSERT INTO config (usuario_id, chave, valor) VALUES (:u, ?, ?)
     ON CONFLICT (usuario_id, chave) DO UPDATE SET valor = excluded.valor`,
    [chave, valor],
  );
}
