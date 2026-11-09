import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
// Número fixo do advisory lock: dois `npm run setup` ao mesmo tempo (ou um deploy e um script) não migram juntos.
const TRAVA = 8_201_301;

/**
 * Aplica as migrations SQL numeradas que ainda não rodaram, na ordem. Cada arquivo roda em uma transação
 * (o DDL do Postgres é transacional: falhou, nada fica pela metade). O checksum impede editar uma migration
 * já aplicada. Quebras de linha são normalizadas antes do checksum para o mesmo arquivo dar o mesmo valor
 * em Windows e Linux.
 */
export async function migrar(banco, pasta = PASTA) {
  await banco.executar(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao text PRIMARY KEY,
      checksum text NOT NULL,
      aplicada_em timestamptz NOT NULL
    );
    ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
  `);

  const arquivos = readdirSync(pasta).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const novas = [];

  for (const arquivo of arquivos) {
    const bruto = readFileSync(join(pasta, arquivo), 'utf8');
    const sql = (bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto).replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(sql).digest('hex');

    const aplicou = await banco.transacao(async (tx) => {
      await tx.consultar('SELECT pg_advisory_xact_lock($1)', [TRAVA]);
      // Reconferido depois da trava: outro processo pode ter aplicado enquanto esperávamos.
      const [existente] = await tx.consultar('SELECT checksum FROM schema_migrations WHERE versao = $1', [arquivo]);
      if (existente) {
        if (existente.checksum !== checksum) {
          throw new Error(`A migration ${arquivo} foi alterada depois de aplicada. Crie uma nova.`);
        }
        return false;
      }
      await tx.executar(sql);
      await tx.consultar('INSERT INTO schema_migrations (versao, checksum, aplicada_em) VALUES ($1, $2, $3)', [
        arquivo,
        checksum,
        new Date().toISOString(),
      ]);
      return true;
    });
    if (aplicou) novas.push(arquivo);
  }
  return novas;
}
