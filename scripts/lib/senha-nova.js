import { esquemaSenhaNova } from '../../contratos/sessao.js';
import { perguntarSenha } from './terminal.js';

/** Pede a senha duas vezes (sem eco) até valer. Sem terminal, só uma linha é lida. */
export async function pedirSenhaNova() {
  for (;;) {
    const senha = await perguntarSenha('Nova senha (mín. 8 caracteres): ');
    const valida = esquemaSenhaNova.safeParse(senha);
    if (!valida.success) {
      console.error(valida.error.issues[0].message);
      if (!process.stdin.isTTY) process.exit(1);
      continue;
    }
    if (process.stdin.isTTY) {
      const confirmacao = await perguntarSenha('Repita a senha: ');
      if (confirmacao !== senha) {
        console.error('As senhas não conferem. Tente de novo.');
        continue;
      }
    }
    return senha;
  }
}
