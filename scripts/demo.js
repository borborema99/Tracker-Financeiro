import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { criarApp } from '../servidor/app.js';
import { criarArmazenamentoMemoria } from '../servidor/armazenamento/index.js';
import { abrirBancoLocal } from '../servidor/banco/pg/pglite.js';
import { migrar } from '../servidor/banco/pg/migrar.js';
import { RAIZ, carregarEnv, lerAmbiente } from '../servidor/config.js';
import { NOME_DEMO, SENHA_DEMO, semearDemo } from '../servidor/demo/semear.js';

// Demonstração: sempre num PGlite próprio em data/pglite-demo, NUNCA no DATABASE_URL (dados fictícios não vão
// para o banco de verdade). Usuário "demo": só ele vê a faixa de dados de demonstração. Só localhost.
carregarEnv();
const config = {
  ...lerAmbiente(),
  porta: Number(process.env.PORT_DEMO) || 3100,
  bancoUrl: '',
  cadastroAberto: false,
  segredo: process.env.SEGREDO_SESSAO || randomBytes(32).toString('hex'),
  pepper: process.env.SENHA_PEPPER || randomBytes(32).toString('hex'),
  chaveIp: process.env.HMAC_CHAVE_IP || randomBytes(32).toString('hex'),
};

const banco = await abrirBancoLocal(join(RAIZ, 'data', 'pglite-demo'));
await migrar(banco);
await semearDemo(banco, { pepper: config.pepper });

const app = await criarApp({
  config,
  banco,
  armazenamento: criarArmazenamentoMemoria(), // a demonstração não guarda comprovantes de verdade
  logger: { level: 'warn' },
});
await app.listen({ host: '127.0.0.1', port: config.porta });

console.log(`\nModo demonstração: http://localhost:${config.porta}`);
console.log(`  Usuário: ${NOME_DEMO}   Senha: ${SENHA_DEMO}`);
console.log('\nCtrl+C para parar.\n');

const encerrar = async () => {
  await app.close();
  await banco.fechar();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
