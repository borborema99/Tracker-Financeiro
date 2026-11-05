import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { abrirBanco } from '../../servidor/banco/conexao.js';
import { fazerBackup } from '../backup.js';

/** Confere que o arquivo é um banco deste sistema e está íntegro, sem alterá-lo. Lança Error com a causa. */
export function conferirBackup(caminho) {
  const banco = abrirBanco(caminho);
  try {
    const ok = banco.prepare("SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations'").get();
    if (!ok) throw new Error('não é um backup deste sistema');
    if (banco.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('arquivo corrompido');
  } finally {
    banco.close();
  }
}

/**
 * Troca o banco atual pelo backup. Antes, guarda uma cópia do atual em `pastaBackups` (prefixo "antes-de-restaurar").
 * O servidor precisa estar parado. Devolve o caminho da cópia guardada (ou null se não havia banco).
 */
export async function restaurarBanco({ origem, caminhoBanco, pastaBackups }) {
  conferirBackup(origem);
  let guardada = null;
  if (existsSync(caminhoBanco)) {
    const atual = abrirBanco(caminhoBanco);
    try {
      guardada = await fazerBackup(atual, 'antes-de-restaurar', pastaBackups);
    } finally {
      atual.close();
    }
  }
  mkdirSync(dirname(caminhoBanco), { recursive: true }); // instalação nova: a pasta data/ ainda pode não existir
  for (const sufixo of ['-wal', '-shm']) rmSync(caminhoBanco + sufixo, { force: true });
  copyFileSync(origem, caminhoBanco);
  return guardada;
}
