import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBancoDaConfig, criarArmazenamentoDaConfig } from '../servidor/banco/abrir.js';
import { buscarPorNome } from '../servidor/banco/repositorios/usuarios.js';
import { RAIZ, carregarEnv, lerAmbiente } from '../servidor/config.js';
import { montarBackup } from './lib/copia.js';

/** AAAA-MM-DD_HHMMSS no horário local, para o nome do arquivo. */
export function carimbo(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}` +
    `_${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}`
  );
}

export function gravarBackup(backup, prefixo, pasta = join(RAIZ, 'backups')) {
  mkdirSync(pasta, { recursive: true });
  const destino = join(pasta, `${prefixo}-${carimbo()}.json`);
  writeFileSync(destino, JSON.stringify(backup), { mode: 0o600 });
  return destino;
}

// npm run backup -- <usuario>
if (process.argv[1]?.endsWith('backup.js')) {
  carregarEnv();
  const nome = (process.argv[2] ?? '').trim();
  if (!nome) {
    console.error('Informe o usuário: npm run backup -- <usuario>');
    process.exit(1);
  }
  const config = lerAmbiente();
  const banco = await abrirBancoDaConfig(config);
  try {
    const usuario = await buscarPorNome(banco, nome);
    if (!usuario) {
      console.error(`Usuário "${nome}" não existe.`);
      process.exitCode = 1;
    } else {
      const backup = await montarBackup(banco, criarArmazenamentoDaConfig(config), usuario.id);
      console.log(`Backup criado: ${gravarBackup(backup, usuario.nome)}`);
      if (backup.anexos_sem_arquivo.length) {
        console.log(`Atenção: ${backup.anexos_sem_arquivo.length} comprovante(s) estavam sem arquivo e ficaram de fora.`);
      }
      console.log('O arquivo tem os dados financeiros e os comprovantes. Guarde-o fora do computador e não o compartilhe.');
    }
  } finally {
    await banco.fechar();
  }
}
