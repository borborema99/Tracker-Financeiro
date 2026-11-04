import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { RAIZ, carregarEnv } from '../servidor/config.js';

carregarEnv();
if (!process.env.SEGREDO_SESSAO) {
  console.error('Rode primeiro: npm run setup');
  process.exit(1);
}

const vite = join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js');
const filhos = [
  spawn(process.execPath, ['--watch', join(RAIZ, 'servidor', 'index.js')], { stdio: 'inherit', cwd: RAIZ }),
  spawn(process.execPath, [vite, '--config', join(RAIZ, 'web', 'vite.config.js')], { stdio: 'inherit', cwd: RAIZ }),
];

const parar = () => {
  for (const f of filhos) f.kill();
  process.exit(0);
};
for (const f of filhos) f.on('exit', (codigo) => codigo && parar());
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
