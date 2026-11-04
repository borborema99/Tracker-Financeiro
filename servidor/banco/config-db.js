export function lerConfig(db, chave) {
  return db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor ?? null;
}

export function gravarConfig(db, chave, valor) {
  db.prepare(
    'INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
  ).run(chave, valor);
}
