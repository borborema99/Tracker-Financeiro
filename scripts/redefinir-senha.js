import { abrirBanco } from '../servidor/banco/conexao.js';
import { auditar } from '../servidor/banco/auditoria.js';
import { migrar } from '../servidor/banco/migrar.js';
import { carregarEnv, lerAmbiente } from '../servidor/config.js';
import { definirSenha } from '../servidor/seguranca/senha.js';
import { encerrarTodasSessoes } from '../servidor/seguranca/sessao.js';
import { pedirSenhaNova } from './lib/senha-nova.js';

carregarEnv();
const db = abrirBanco(lerAmbiente().caminhoBanco);
migrar(db);

const senha = await pedirSenhaNova();
await definirSenha(db, senha);
db.transaction(() => {
  encerrarTodasSessoes(db);
  db.prepare('DELETE FROM tentativas_login').run();
  auditar(db, { entidade: 'config', id: 'senha', acao: 'editar' });
})();
db.close();
console.log('Senha redefinida. Todas as sessões abertas foram encerradas.');
