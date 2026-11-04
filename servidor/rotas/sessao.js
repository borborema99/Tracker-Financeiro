import { esquemaLogin } from '../../contratos/sessao.js';
import { FUSO_PADRAO } from '../../contratos/config.js';
import { lerConfig } from '../banco/config-db.js';
import { conferirSenha, senhaDefinida } from '../seguranca/senha.js';
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_MS,
  criarSessao,
  encerrarSessao,
  limparSessoesExpiradas,
  sessaoValida,
  tokenCsrf,
} from '../seguranca/sessao.js';
import { limparTentativas, registrarErro, verificarBloqueio } from '../seguranca/tentativas.js';

export async function rotasSessao(app) {
  const { db, cfg } = app;

  const opcoesCookie = (request) => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: request.protocol === 'https',
    path: '/',
  });

  app.get('/api/sessao', { config: { publica: true } }, async (request) => {
    const token = request.cookies[COOKIE_SESSAO];
    const autenticado = sessaoValida(db, token);
    return {
      autenticado,
      senhaDefinida: senhaDefinida(db),
      demo: cfg.demo,
      ...(autenticado
        ? { csrf: tokenCsrf(token, cfg.segredo), fuso: lerConfig(db, 'fuso') ?? FUSO_PADRAO }
        : {}),
    };
  });

  app.post('/api/login', { config: { publica: true } }, async (request, reply) => {
    const { senha } = esquemaLogin.parse(request.body);
    if (!senhaDefinida(db)) {
      return reply.code(409).send({ erro: 'Nenhuma senha definida. Rode: npm run setup' });
    }
    const chave = request.ip;
    const bloqueio = verificarBloqueio(db, chave);
    if (bloqueio.bloqueado) {
      reply.header('Retry-After', String(bloqueio.segundos));
      return reply.code(429).send({
        erro: `Muitas tentativas. Tente de novo em ${Math.ceil(bloqueio.segundos / 60)} min.`,
      });
    }
    if (!(await conferirSenha(db, senha))) {
      const { bloqueado } = registrarErro(db, chave);
      return reply.code(bloqueado ? 429 : 401).send({
        erro: bloqueado ? 'Muitas tentativas. Tente de novo em 15 min.' : 'Senha incorreta.',
      });
    }
    limparTentativas(db, chave);
    limparSessoesExpiradas(db);
    const token = criarSessao(db);
    reply.setCookie(COOKIE_SESSAO, token, {
      ...opcoesCookie(request),
      maxAge: DURACAO_SESSAO_MS / 1000,
    });
    return { ok: true };
  });

  app.post('/api/logout', async (request, reply) => {
    encerrarSessao(db, request.tokenSessao);
    reply.clearCookie(COOKIE_SESSAO, opcoesCookie(request));
    return { ok: true };
  });
}
