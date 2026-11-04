import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { RAIZ, carregarEnv, lerAmbiente } from '../servidor/config.js';

/** Copia o banco com a API de backup do SQLite (segura com o servidor ligado). */
export async function fazerBackup(db, prefixo = 'tracker') {
  const pasta = join(RAIZ, 'backups');
  mkdirSync(pasta, { recursive: true });
  const agora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nome =
    `${prefixo}-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}` +
    `_${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}.db`;
  const destino = join(pasta, nome);
  await db.backup(destino);
  return destino;
}

if (process.argv[1]?.endsWith('backup.js')) {
  carregarEnv();
  const db = abrirBanco(lerAmbiente().caminhoBanco);
  const destino = await fazerBackup(db);
  db.close();
  console.log(`Backup criado: ${destino}`);
  console.log('Guarde uma cópia da pasta backups/ fora do computador.');
}
