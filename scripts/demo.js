import { randomBytes } from 'node:crypto';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { migrar } from '../servidor/banco/migrar.js';
import { carregarEnv, lerAmbiente } from '../servidor/config.js';
import { SENHA_DEMO, semearDemo } from '../servidor/demo/semear.js';

// Banco separado, só localhost, porta própria. Os dados reais não são tocados.
process.env.DEMO = '1';
process.env.DB_PATH = 'data/demo.db';
process.env.EXPOR_NA_REDE = '0';
process.env.PORT = process.env.PORT_DEMO || '3100';
carregarEnv();
process.env.SEGREDO_SESSAO ||= randomBytes(32).toString('hex');

const db = abrirBanco(lerAmbiente().caminhoBanco);
migrar(db);
await semearDemo(db);
db.close();

console.log(`\nModo demonstração. Senha: ${SENHA_DEMO}`);
await import('../servidor/index.js');
