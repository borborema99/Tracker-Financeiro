import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { abrirBancoDaConfig, criarArmazenamentoDaConfig } from '../servidor/banco/abrir.js';
import { migrar } from '../servidor/banco/pg/migrar.js';
import { buscarPorNome } from '../servidor/banco/repositorios/usuarios.js';
import { carregarEnv, lerAmbiente } from '../servidor/config.js';
import { gravarBackup } from './backup.js';
import { montarBackup, restaurarBackup } from './lib/copia.js';
import { perguntar } from './lib/terminal.js';

// npm run restaurar -- <usuario> <arquivo.json> [--sim]
// Substitui TODOS os dados do usuário pelos do arquivo. Antes, guarda uma cópia do estado atual em backups/.
carregarEnv();
const args = process.argv.slice(2);
const confirmado = args.includes('--sim');
const [nome, arquivo] = args.filter((a) => !a.startsWith('--'));
if (!nome || !arquivo) {
  console.error('Uso: npm run restaurar -- <usuario> <arquivo.json> [--sim]');
  process.exit(1);
}
if (!existsSync(arquivo)) {
  console.error(`Arquivo não encontrado: ${arquivo}`);
  process.exit(1);
}

let backup;
try {
  backup = JSON.parse(readFileSync(resolve(arquivo), 'utf8'));
} catch {
  console.error('O arquivo não é um JSON válido.');
  process.exit(1);
}

const config = lerAmbiente();
const banco = await abrirBancoDaConfig(config);
try {
  await migrar(banco);
  const usuario = await buscarPorNome(banco, nome);
  if (!usuario) {
    console.error(`Usuário "${nome}" não existe. Crie antes: npm run criar-usuario -- ${nome}`);
    process.exit(1);
  }
  if (!confirmado) {
    console.log(`Isto substitui todos os dados de "${usuario.nome}" pelos do arquivo. Uma cópia dos dados atuais será guardada.`);
    if (!process.stdin.isTTY || (await perguntar('Digite SIM para continuar: ')) !== 'SIM') {
      console.error('Cancelado.');
      process.exit(1);
    }
  }
  const armazenamento = criarArmazenamentoDaConfig(config);
  const guardada = gravarBackup(await montarBackup(banco, armazenamento, usuario.id), 'antes-de-restaurar');
  console.log(`Dados atuais guardados em ${guardada}`);
  try {
    const r = await restaurarBackup(banco, armazenamento, usuario.id, backup);
    console.log(`Restaurado: ${r.tabelas} tabelas, ${r.comprovantes} comprovante(s).`);
    if (r.semArquivo) console.log(`Atenção: ${r.semArquivo} comprovante(s) não tinham arquivo no backup e foram marcados como removidos.`);
  } catch (erro) {
    console.error(`Não foi possível restaurar (nada foi alterado): ${erro.message}`);
    process.exitCode = 1;
  }
} finally {
  await banco.fechar();
}
