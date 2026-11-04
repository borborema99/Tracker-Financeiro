import { networkInterfaces } from 'node:os';
import qrcode from 'qrcode-terminal';
import { criarApp } from './app.js';
import { abrirBanco } from './banco/conexao.js';
import { migrar } from './banco/migrar.js';
import { semearPadroes } from './banco/padroes.js';
import { carregarEnv, lerAmbiente } from './config.js';
import { senhaDefinida } from './seguranca/senha.js';

carregarEnv();
const config = lerAmbiente();

function sair(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!config.segredo) sair('SEGREDO_SESSAO não definido. Rode primeiro: npm run setup');

const db = abrirBanco(config.caminhoBanco);
migrar(db);
semearPadroes(db);

if (config.exporNaRede && !senhaDefinida(db)) {
  sair('Para abrir na rede é preciso ter senha. Rode primeiro: npm run setup');
}
if ((config.httpsCert === null) !== (config.httpsKey === null)) {
  sair('Defina HTTPS_CERT e HTTPS_KEY juntos, ou nenhum dos dois.');
}

const app = await criarApp({ config, db, logger: { level: 'warn' } });
const esquema = config.httpsCert ? 'https' : 'http';

try {
  await app.listen({ host: config.exporNaRede ? '0.0.0.0' : '127.0.0.1', port: config.porta });
} catch (erro) {
  if (erro.code === 'EADDRINUSE') sair(`A porta ${config.porta} já está em uso. Mude PORT no .env.`);
  throw erro;
}

console.log(`\nTracker Financeiro${config.demo ? ' (DEMONSTRAÇÃO)' : ''}`);
console.log(`  Neste computador: ${esquema}://localhost:${config.porta}`);
if (config.exporNaRede) {
  // Wi-Fi/Ethernet doméstico (192.168.x, 10.x) primeiro: adaptadores virtuais (WSL, Docker) ficam por último.
  const prioridade = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  const enderecos = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .sort((a, b) => prioridade(a.address) - prioridade(b.address))
    .map((i) => `${esquema}://${i.address}:${config.porta}`);
  for (const e of enderecos) console.log(`  Na rede local:    ${e}`);
  if (enderecos[0]) {
    console.log('\nAbra no celular (mesmo Wi-Fi) lendo o QR code:\n');
    qrcode.generate(enderecos[0], { small: true });
  }
}
console.log('\nCtrl+C para parar.\n');

const encerrar = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
