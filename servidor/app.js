import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { ZodError } from 'zod';
import { aplicarCabecalhos } from './seguranca/cabecalhos.js';
import { hostPermitido, origemValida } from './seguranca/origem.js';
import { COOKIE_SESSAO, csrfConfere, sessaoValida } from './seguranca/sessao.js';
import { rotasSaude } from './rotas/saude.js';
import { rotasSessao } from './rotas/sessao.js';
import { rotasConfig } from './rotas/config.js';
import { rotasContas } from './rotas/contas.js';
import { rotasCategorias } from './rotas/categorias.js';
import { rotasMovimentacoes } from './rotas/movimentacoes.js';
import { rotasResumo } from './rotas/resumo.js';
import { rotasCartoes } from './rotas/cartoes.js';
import { rotasCompromissos } from './rotas/compromissos.js';
import { rotasFluxo } from './rotas/fluxo.js';
import { rotasExportar } from './rotas/exportar.js';
import { rotasPlanejamento } from './rotas/planejamento.js';
import { rotasDividas } from './rotas/dividas.js';
import { rotasInvestimentos } from './rotas/investimentos.js';

const METODOS_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Monta o servidor. Rotas públicas declaram `config: { publica: true }`.
 * Toda escrita exige Origin válida; escrita autenticada exige também o token CSRF.
 */
export async function criarApp({ config, db, logger = false }) {
  const https =
    config.httpsCert && config.httpsKey
      ? { cert: readFileSync(config.httpsCert), key: readFileSync(config.httpsKey) }
      : null;

  const app = Fastify({
    logger,
    trustProxy: ['127.0.0.1', '::1'],
    ...(https ? { https } : {}),
  });

  app.decorate('db', db);
  app.decorate('cfg', config);

  // Registro das rotas de /api: o teste de segurança confere que cada uma exige sessão (ou declara ser pública).
  const rotas = [];
  app.addHook('onRoute', (rota) => {
    if (!rota.url.startsWith('/api/')) return;
    for (const metodo of [rota.method].flat().filter((m) => m !== 'HEAD')) {
      rotas.push({ metodo, url: rota.url, publica: Boolean(rota.config?.publica) });
    }
  });
  app.decorate('rotas', rotas);
  await app.register(cookie);

  app.addHook('onRequest', async (request, reply) => {
    if (!hostPermitido(request.headers.host, config.origensPermitidas)) {
      return reply.code(421).send({ erro: 'Host não permitido.' });
    }
    if (!request.url.startsWith('/api/')) return;

    if (METODOS_ESCRITA.has(request.method)) {
      if (!origemValida(request.headers.origin, request.headers.host, config.origensPermitidas)) {
        return reply.code(403).send({ erro: 'Origem não permitida.' });
      }
    }
    if (request.routeOptions.config?.publica) return;

    const token = request.cookies[COOKIE_SESSAO];
    if (!sessaoValida(db, token)) return reply.code(401).send({ erro: 'Sessão expirada. Entre de novo.' });
    request.tokenSessao = token;

    if (METODOS_ESCRITA.has(request.method)) {
      if (!csrfConfere(request.headers['x-csrf-token'], token, config.segredo)) {
        return reply.code(403).send({ erro: 'Token CSRF inválido.' });
      }
    }
  });

  app.addHook('onSend', async (request, reply) => aplicarCabecalhos(request, reply));

  app.setErrorHandler((erro, request, reply) => {
    if (erro instanceof ZodError) {
      const campos = Object.fromEntries(erro.issues.map((i) => [i.path.join('.') || '_', i.message]));
      return reply.code(400).send({ erro: 'Dados inválidos.', campos });
    }
    if (erro.statusCode && erro.statusCode < 500) {
      return reply
        .code(erro.statusCode)
        .send({ erro: erro.message, ...(erro.campos ? { campos: erro.campos } : {}) });
    }
    request.log.error(erro);
    return reply.code(500).send({ erro: 'Erro interno.' });
  });

  await app.register(rotasSaude);
  await app.register(rotasSessao);
  await app.register(rotasConfig);
  await app.register(rotasContas);
  await app.register(rotasCategorias);
  await app.register(rotasMovimentacoes);
  await app.register(rotasResumo);
  await app.register(rotasCartoes);
  await app.register(rotasCompromissos);
  await app.register(rotasFluxo);
  await app.register(rotasExportar);
  await app.register(rotasPlanejamento);
  await app.register(rotasDividas);
  await app.register(rotasInvestimentos);

  const temFront = existsSync(config.pastaWeb);
  if (temFront) {
    await app.register(fastifyStatic, {
      root: config.pastaWeb,
      setHeaders(reply, caminho) {
        const imutavel = /[\\/]assets[\\/]/.test(caminho);
        reply.header('Cache-Control', imutavel ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) return reply.code(404).send({ erro: 'Não encontrado.' });
    if (request.method === 'GET' && temFront) return reply.sendFile('index.html');
    if (request.method === 'GET') {
      return reply
        .code(503)
        .type('text/plain; charset=utf-8')
        .send('O front ainda não foi gerado. Rode: npm run build');
    }
    return reply.code(404).send({ erro: 'Não encontrado.' });
  });

  return app;
}
