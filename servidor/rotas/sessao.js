import {
  esquemaCadastro,
  esquemaExclusaoConta,
  esquemaLogin,
  esquemaTrocaSenha,
} from '../../contratos/sessao.js';
import { buscarPorId, buscarPorNome, criarUsuario, definirSenhaDoUsuario, excluirUsuario } from '../banco/repositorios/usuarios.js';
import { criarEscopo } from '../banco/pg/escopo.js';
import { conferirContraFalso, hashSenha, verificarSenha } from '../seguranca/senha.js';
import {
  DURACAO_SESSAO_MS,
  criarSessao,
  encerrarOutrasSessoes,
  encerrarSessao,
  limparSessoesExpiradas,
  tokenCsrf,
} from '../seguranca/sessao.js';
import {
  BLOQUEIO_MS,
  chaveDoIp,
  chaveDoUsuario,
  limparTentativas,
  registrarErro,
  verificarBloqueio,
} from '../seguranca/tentativas.js';
import { fusoDe, garantirOcorrencias } from './util.js';

// Mesma mensagem para usuário que não existe e senha errada: a resposta não revela quais nomes existem.
const MENSAGEM_CREDENCIAIS = 'Usuário ou senha incorretos.';

export async function rotasSessao(app) {
  const { db: banco, cfg } = app;

  const opcoesCookie = (request) => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: request.protocol === 'https',
    path: '/',
  });

  const abrirSessao = async (request, reply, usuarioId) => {
    await limparSessoesExpiradas(banco);
    const token = await criarSessao(banco, usuarioId);
    reply.setCookie(app.cookieDaSessao(request), token, {
      ...opcoesCookie(request),
      maxAge: DURACAO_SESSAO_MS / 1000,
    });
  };

  const chavesDeTentativa = (request, nome) => [chaveDoUsuario(nome), chaveDoIp(request.ip, cfg.chaveIp)];

  /** 429 se alguma das chaves (usuário ou IP) está bloqueada; senão null. */
  const respostaDeBloqueio = async (request, reply, chaves) => {
    const { bloqueado, segundos } = await verificarBloqueio(banco, chaves);
    if (!bloqueado) return null;
    reply.header('Retry-After', String(segundos));
    return reply.code(429).send({ erro: `Muitas tentativas. Tente de novo em ${Math.ceil(segundos / 60)} min.` });
  };

  const erroDeSenha = async (request, reply, chaves, mensagem) => {
    const { bloqueado } = await registrarErro(banco, chaves);
    if (bloqueado) reply.header('Retry-After', String(BLOQUEIO_MS / 1000));
    return reply.code(bloqueado ? 429 : 401).send({
      erro: bloqueado ? 'Muitas tentativas. Tente de novo em 15 min.' : mensagem,
    });
  };

  app.get('/api/sessao', { config: { publica: true } }, async (request) => {
    const { token, sessao } = await app.lerSessao(request);
    const base = { cadastroAberto: cfg.cadastroAberto };
    if (!sessao) return { autenticado: false, demo: false, ...base };
    const esc = criarEscopo(banco, sessao.usuarioId);
    await garantirOcorrencias(esc); // abrir o app põe as recorrências em dia
    return {
      autenticado: true,
      demo: sessao.demo,
      ...base,
      usuario: sessao.nome,
      csrf: tokenCsrf(token, cfg.segredo),
      fuso: await fusoDe(esc),
    };
  });

  app.post('/api/login', { config: { publica: true } }, async (request, reply) => {
    const { usuario, senha } = esquemaLogin.parse(request.body);
    const chaves = chavesDeTentativa(request, usuario);
    const bloqueio = await respostaDeBloqueio(request, reply, chaves);
    if (bloqueio) return bloqueio;

    const encontrado = await buscarPorNome(banco, usuario);
    const confere = encontrado
      ? await verificarSenha(senha, encontrado.senhaHash, cfg.pepper)
      : await conferirContraFalso(senha, cfg.pepper);
    if (!confere) return erroDeSenha(request, reply, chaves, MENSAGEM_CREDENCIAIS);

    // Só a contagem do usuário zera. A do IP continua: quem erra senha de outras contas a partir do mesmo
    // lugar não ganha tentativas novas por acertar a própria.
    await limparTentativas(banco, chaves[0]);
    await abrirSessao(request, reply, encontrado.id);
    return { ok: true };
  });

  // Cadastro público: só existe com CADASTRO_ABERTO=1. Fechado, a rota responde 404 como se não existisse;
  // contas novas nascem por `npm run criar-usuario`.
  app.post('/api/cadastro', { config: { publica: true } }, async (request, reply) => {
    if (!cfg.cadastroAberto) return reply.code(404).send({ erro: 'Não encontrado.' });
    const { usuario, senha } = esquemaCadastro.parse(request.body);
    const id = await criarUsuario(banco, { nome: usuario, senhaHash: await hashSenha(senha, cfg.pepper) });
    await abrirSessao(request, reply, id);
    return reply.code(201).send({ ok: true });
  });

  app.post('/api/logout', async (request, reply) => {
    await encerrarSessao(banco, request.tokenSessao);
    reply.clearCookie(app.cookieDaSessao(request), opcoesCookie(request));
    return { ok: true };
  });

  // Trocar a senha encerra as sessões dos outros aparelhos. Errar a senha atual conta como erro de login:
  // quem roubou uma sessão aberta não ganha tentativas ilimitadas para descobrir a senha.
  app.post('/api/senha', async (request, reply) => {
    const { senha_atual: atual, senha_nova: nova } = esquemaTrocaSenha.parse(request.body);
    const usuario = await buscarPorId(banco, request.usuarioId);
    const chaves = chavesDeTentativa(request, usuario.nome);
    const bloqueio = await respostaDeBloqueio(request, reply, chaves);
    if (bloqueio) return bloqueio;
    if (!(await verificarSenha(atual, usuario.senhaHash, cfg.pepper))) {
      return erroDeSenha(request, reply, chaves, 'Senha atual incorreta.');
    }
    await definirSenhaDoUsuario(banco, usuario.id, await hashSenha(nova, cfg.pepper));
    await encerrarOutrasSessoes(banco, usuario.id, request.tokenSessao);
    return { ok: true };
  });

  app.post('/api/sessoes/encerrar-outras', async (request) => ({
    encerradas: await encerrarOutrasSessoes(banco, request.usuarioId, request.tokenSessao),
  }));

  // Apagar a conta leva junto todos os dados do usuário (e só os dele). Exige o nome de usuário digitado e a
  // senha: ter a sessão aberta não basta para uma ação sem volta.
  app.delete('/api/conta', async (request, reply) => {
    const { confirmacao, senha } = esquemaExclusaoConta.parse(request.body);
    const usuario = await buscarPorId(banco, request.usuarioId);
    if (confirmacao.trim().toLowerCase() !== usuario.nome.toLowerCase()) {
      return reply.code(400).send({ erro: 'Dados inválidos.', campos: { confirmacao: 'O nome de usuário não confere.' } });
    }
    const chaves = chavesDeTentativa(request, usuario.nome);
    const bloqueio = await respostaDeBloqueio(request, reply, chaves);
    if (bloqueio) return bloqueio;
    if (!(await verificarSenha(senha, usuario.senhaHash, cfg.pepper))) {
      return erroDeSenha(request, reply, chaves, 'Senha incorreta.');
    }
    await excluirUsuario(banco, app.armazenamento, usuario.id);
    reply.clearCookie(app.cookieDaSessao(request), opcoesCookie(request));
    return reply.code(204).send();
  });
}
