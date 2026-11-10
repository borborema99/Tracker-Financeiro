import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBancoDaConfig } from '../servidor/banco/abrir.js';
import { migrar } from '../servidor/banco/pg/migrar.js';
import { RAIZ, carregarEnv, lerAmbiente } from '../servidor/config.js';

// Gera só os segredos que faltam (nunca troca um que já existe: trocar SENHA_PEPPER invalida todas as senhas) e
// aplica as migrations no banco configurado: DATABASE_URL, ou PGlite local se ela estiver vazia. Usuários nascem
// por `npm run criar-usuario`.

const arquivoEnv = join(RAIZ, '.env');
const SEGREDOS = ['SEGREDO_SESSAO', 'SENHA_PEPPER', 'HMAC_CHAVE_IP'];

function prepararEnv() {
  let texto = existsSync(arquivoEnv) ? readFileSync(arquivoEnv, 'utf8') : readFileSync(join(RAIZ, '.env.example'), 'utf8');
  const gerados = [];
  for (const nome of SEGREDOS) {
    if (new RegExp(`^${nome}=\\S+`, 'm').test(texto)) continue;
    const valor = randomBytes(32).toString('hex');
    texto = new RegExp(`^${nome}=.*$`, 'm').test(texto)
      ? texto.replace(new RegExp(`^${nome}=.*$`, 'm'), `${nome}=${valor}`)
      : `${texto.trimEnd()}\n${nome}=${valor}\n`;
    gerados.push(nome);
  }
  if (gerados.length || !existsSync(arquivoEnv)) writeFileSync(arquivoEnv, texto);
  if (gerados.length) console.log(`Segredos gerados no .env: ${gerados.join(', ')}.`);
  if (gerados.includes('SENHA_PEPPER')) {
    console.log('Guarde uma cópia do SENHA_PEPPER: sem ele, nenhuma senha cadastrada volta a funcionar.');
  }
}

prepararEnv();
carregarEnv();
const config = lerAmbiente();

const banco = await abrirBancoDaConfig(config);
try {
  const aplicadas = await migrar(banco);
  console.log(aplicadas.length ? `Migrations aplicadas: ${aplicadas.join(', ')}` : 'Banco já está atualizado.');
} finally {
  await banco.fechar();
}
console.log(`Banco: ${config.bancoUrl ? 'Postgres (DATABASE_URL)' : 'PGlite local (data/pglite)'}`);
console.log('\nPronto. Crie seu usuário com: npm run criar-usuario -- <usuario>');
