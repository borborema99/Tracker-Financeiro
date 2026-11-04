import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Aplica as migrations SQL numeradas que ainda não rodaram.
 * Cada arquivo roda em transação. O checksum impede editar uma migration já aplicada.
 */
export function migrar(db, pasta = PASTA) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    versao TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    aplicada_em TEXT NOT NULL
  )`);

  const aplicadas = new Map(
    db.prepare('SELECT versao, checksum FROM schema_migrations').all().map((r) => [r.versao, r.checksum]),
  );
  const arquivos = readdirSync(pasta).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const novas = [];

  for (const arquivo of arquivos) {
    const sql = readFileSync(join(pasta, arquivo), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (aplicadas.has(arquivo)) {
      if (aplicadas.get(arquivo) !== checksum) {
        throw new Error(`A migration ${arquivo} foi alterada depois de aplicada. Crie uma nova.`);
      }
      continue;
    }
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (versao, checksum, aplicada_em) VALUES (?, ?, ?)').run(
        arquivo,
        checksum,
        new Date().toISOString(),
      );
    })();
    novas.push(arquivo);
  }
  return novas;
}
