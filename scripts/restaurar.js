import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { RAIZ, carregarEnv, lerAmbiente } from '../servidor/config.js';
import { fazerBackup } from './backup.js';
import { perguntar } from './lib/terminal.js';

carregarEnv();
const { caminhoBanco } = lerAmbiente();
const pasta = join(RAIZ, 'backups');
const args = process.argv.slice(2);
const confirmado = args.includes('--sim');
let arquivo = args.find((a) => !a.startsWith('--'));

if (!arquivo) {
  const lista = existsSync(pasta) ? readdirSync(pasta).filter((f) => f.endsWith('.db')).sort().reverse() : [];
  if (lista.length === 0) {
    console.error('Nenhum backup encontrado em backups/.');
    process.exit(1);
  }
  if (!process.stdin.isTTY) {
    console.error('Informe o arquivo: npm run restaurar -- backups/ARQUIVO.db --sim');
    process.exit(1);
  }
  lista.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
  const n = Number(await perguntar('\nQual restaurar? (número) '));
  arquivo = lista[n - 1];
  if (!arquivo) {
    console.error('Opção inválida.');
    process.exit(1);
  }
}
const origem = existsSync(arquivo) ? resolve(arquivo) : join(pasta, arquivo);
if (!existsSync(origem)) {
  console.error(`Arquivo não encontrado: ${arquivo}`);
  process.exit(1);
}

// Confere se é mesmo um banco do sistema antes de tocar no atual.
const teste = abrirBanco(origem);
try {
  const ok = teste.prepare("SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations'").get();
  if (!ok) throw new Error('não é um backup deste sistema');
  if (teste.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('arquivo corrompido');
} catch (e) {
  console.error(`Backup inválido: ${e.message}.`);
  process.exit(1);
} finally {
  teste.close();
}

if (!confirmado) {
  console.log('Isto substitui o banco atual. Pare o servidor antes. Uma cópia do banco atual será guardada.');
  if (!process.stdin.isTTY || (await perguntar('Digite SIM para continuar: ')) !== 'SIM') {
    console.error('Cancelado.');
    process.exit(1);
  }
}

if (existsSync(caminhoBanco)) {
  const atual = abrirBanco(caminhoBanco);
  const guardada = await fazerBackup(atual, 'antes-de-restaurar');
  atual.close();
  console.log(`Banco atual guardado em ${guardada}`);
}
for (const sufixo of ['-wal', '-shm']) rmSync(caminhoBanco + sufixo, { force: true });
copyFileSync(origem, caminhoBanco);
console.log('Banco restaurado. Suba o sistema com: npm start');
