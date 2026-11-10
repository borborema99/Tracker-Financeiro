import { abrirBancoDaConfig } from '../servidor/banco/abrir.js';
import { migrar } from '../servidor/banco/pg/migrar.js';
import { buscarPorNome, definirSenhaDoUsuario } from '../servidor/banco/repositorios/usuarios.js';
import { carregarEnv, lerAmbiente, variaveisFaltando } from '../servidor/config.js';
import { hashSenha } from '../servidor/seguranca/senha.js';
import { encerrarTodasSessoes } from '../servidor/seguranca/sessao.js';
import { chaveDoUsuario, limparTentativas } from '../servidor/seguranca/tentativas.js';
import { pedirSenhaNova } from './lib/senha-nova.js';

// npm run redefinir-senha -- <usuario>   (a senha nova é pedida no terminal, sem eco)
carregarEnv();
const config = lerAmbiente();
const faltando = variaveisFaltando(config);
if (faltando.length) {
  console.error(`Variáveis ausentes: ${faltando.join(', ')}. Rode primeiro: npm run setup`);
  process.exit(1);
}
const nome = (process.argv[2] ?? '').trim();
if (!nome) {
  console.error('Informe o usuário: npm run redefinir-senha -- <usuario>');
  process.exit(1);
}

const banco = await abrirBancoDaConfig(config);
try {
  await migrar(banco);
  const usuario = await buscarPorNome(banco, nome);
  if (!usuario) {
    console.error(`Usuário "${nome}" não existe.`);
    process.exitCode = 1;
  } else {
    const senha = await pedirSenhaNova();
    await definirSenhaDoUsuario(banco, usuario.id, await hashSenha(senha, config.pepper));
    await encerrarTodasSessoes(banco, usuario.id);
    await limparTentativas(banco, chaveDoUsuario(usuario.nome));
    console.log(`Senha de "${usuario.nome}" redefinida. Todas as sessões abertas dele foram encerradas.`);
  }
} finally {
  await banco.fechar();
}
