import { esquemaNomeUsuario } from '../contratos/sessao.js';
import { abrirBancoDaConfig } from '../servidor/banco/abrir.js';
import { migrar } from '../servidor/banco/pg/migrar.js';
import { criarUsuario } from '../servidor/banco/repositorios/usuarios.js';
import { carregarEnv, lerAmbiente, variaveisFaltando } from '../servidor/config.js';
import { hashSenha } from '../servidor/seguranca/senha.js';
import { pedirSenhaNova } from './lib/senha-nova.js';

// npm run criar-usuario -- <usuario>   (a senha é pedida no terminal, sem eco)
carregarEnv();
const config = lerAmbiente();
const faltando = variaveisFaltando(config);
if (faltando.length) {
  console.error(`Variáveis ausentes: ${faltando.join(', ')}. Rode primeiro: npm run setup`);
  process.exit(1);
}

const nome = esquemaNomeUsuario.safeParse(process.argv[2] ?? '');
if (!nome.success) {
  console.error(`Informe o usuário: npm run criar-usuario -- <usuario>\n${nome.error.issues[0].message}`);
  process.exit(1);
}

const banco = await abrirBancoDaConfig(config);
try {
  await migrar(banco);
  const senha = await pedirSenhaNova();
  await criarUsuario(banco, { nome: nome.data, senhaHash: await hashSenha(senha, config.pepper) });
  console.log(`Usuário "${nome.data}" criado, com as categorias padrão.`);
} catch (erro) {
  console.error(erro.statusCode === 409 ? erro.message : `Não foi possível criar o usuário: ${erro.message}`);
  process.exitCode = 1;
} finally {
  await banco.fechar();
}
