import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { migrar } from '../servidor/banco/migrar.js';
import { semearPadroes } from '../servidor/banco/padroes.js';
import { RAIZ, carregarEnv, lerAmbiente } from '../servidor/config.js';
import { definirSenha, senhaDefinida } from '../servidor/seguranca/senha.js';
import { pedirSenhaNova } from './lib/senha-nova.js';

const arquivoEnv = join(RAIZ, '.env');

function prepararEnv() {
  const modelo = readFileSync(join(RAIZ, '.env.example'), 'utf8');
  const segredo = randomBytes(32).toString('hex');
  if (!existsSync(arquivoEnv)) {
    writeFileSync(arquivoEnv, modelo.replace(/^SEGREDO_SESSAO=.*$/m, `SEGREDO_SESSAO=${segredo}`));
    console.log('Criado .env com segredo gerado.');
    return;
  }
  const atual = readFileSync(arquivoEnv, 'utf8');
  if (/^SEGREDO_SESSAO=\S+/m.test(atual)) return;
  const texto = /^SEGREDO_SESSAO=.*$/m.test(atual)
    ? atual.replace(/^SEGREDO_SESSAO=.*$/m, `SEGREDO_SESSAO=${segredo}`)
    : `${atual.trimEnd()}\nSEGREDO_SESSAO=${segredo}\n`;
  writeFileSync(arquivoEnv, texto);
  console.log('SEGREDO_SESSAO gerado no .env existente.');
}

prepararEnv();
carregarEnv();
const config = lerAmbiente();
mkdirSync(join(RAIZ, 'data'), { recursive: true });

const db = abrirBanco(config.caminhoBanco);
const aplicadas = migrar(db);
console.log(aplicadas.length ? `Migrations aplicadas: ${aplicadas.join(', ')}` : 'Banco já está atualizado.');
if (semearPadroes(db)) console.log('Categorias padrão criadas (você pode editá-las no app).');

if (senhaDefinida(db)) {
  console.log('A senha já está definida. Para trocar: npm run redefinir-senha');
} else {
  await definirSenha(db, await pedirSenhaNova());
  console.log('Senha definida.');
}
db.close();
console.log('\nPronto. Próximos passos: npm run build  e  npm start');
