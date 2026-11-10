import { criarApp } from './app.js';
import { abrirBancoDaConfig, criarArmazenamentoDaConfig } from './banco/abrir.js';
import { migrar } from './banco/pg/migrar.js';
import { carregarEnv, lerAmbiente, variaveisFaltando } from './config.js';

// Servidor local (npm start / npm run dev). Em produção quem responde é a função do Netlify
// (netlify/functions/api.mjs); aqui o mesmo app roda num processo só, escutando apenas em localhost.

carregarEnv();
const config = lerAmbiente();

function sair(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

const faltando = variaveisFaltando(config);
if (faltando.length) sair(`Variáveis ausentes: ${faltando.join(', ')}. Rode primeiro: npm run setup`);

const banco = await abrirBancoDaConfig(config);
const aplicadas = await migrar(banco);
if (aplicadas.length) console.log(`Migrations aplicadas: ${aplicadas.join(', ')}`);

const app = await criarApp({
  config,
  banco,
  armazenamento: criarArmazenamentoDaConfig(config),
  logger: { level: 'warn' },
});

try {
  await app.listen({ host: '127.0.0.1', port: config.porta });
} catch (erro) {
  if (erro.code === 'EADDRINUSE') sair(`A porta ${config.porta} já está em uso. Mude PORT no .env.`);
  throw erro;
}

console.log('\nTracker Financeiro');
console.log(`  Neste computador: http://localhost:${config.porta}`);
console.log(`  Banco: ${config.bancoUrl ? 'Postgres (DATABASE_URL)' : 'PGlite local (data/pglite)'}`);
console.log('\nCtrl+C para parar.\n');

const encerrar = async () => {
  await app.close();
  await banco.fechar();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
