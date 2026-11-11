import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { criarEscopo } from './banco/pg/escopo.js';
import { aplicarCabecalhos } from './seguranca/cabecalhos.js';
import { hostPermitido, origemValida } from './seguranca/origem.js';
import { buscarSessao, csrfConfere, nomeDoCookie } from './seguranca/sessao.js';
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
import { rotasMoedas } from './rotas/moedas.js';
import { rotasRelatorios } from './rotas/relatorios.js';
import { rotasAnexos } from './rotas/anexos.js';
import { rotasImportacao } from './rotas/importacao.js';

const METODOS_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Monta o servidor (ADR 013). `banco` e `armazenamento` vêm de fora: a função do Netlify, o `npm run dev` e os
 * testes montam o mesmo app com bancos diferentes. Rotas públicas declaram `config: { publica: true }`.
 *
 * Toda escrita exige Origin válida; escrita autenticada exige também o token CSRF. Depois da sessão validada,
 * `request.esc` é o escopo do usuário: o único caminho das rotas até os dados.
 *
 * `trustProxy`: no desenvolvimento só o loopback é confiável. Na função do Netlify é `true`, e a função remove o
 * `x-forwarded-for` de entrada e entrega o IP real como `remoteAddress` (netlify/functions/api.mjs).
 * `servirFront: false` na função: o Netlify serve os arquivos estáticos.
 */
export async function criarApp({
  config,
  banco,
  armazenamento,
  logger = false,
  trustProxy = ['127.0.0.1', '::1'],
  servirFront = true,
}) {
  const app = Fastify({ logger, trustProxy });

  app.decorate('db', banco);
  app.decorate('armazenamento', armazenamento);
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

  /** Em https o cookie é `__Host-sessao`; em http (só desenvolvimento local), `sessao`. Lê só o do protocolo atual. */
  app.decorate('cookieDaSessao', (request) => nomeDoCookie(request.protocol === 'https'));
  app.decorate('lerSessao', async (request) => {
    const token = request.cookies[app.cookieDaSessao(request)];
    const sessao = token ? await buscarSessao(banco, token) : null;
    return { token, sessao };
  });

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

    const { token, sessao } = await app.lerSessao(request);
    if (!sessao) return reply.code(401).send({ erro: 'Sessão expirada. Entre de novo.' });
    request.tokenSessao = token;
    request.usuarioId = sessao.usuarioId;
    request.nomeUsuario = sessao.nome;
    request.esc = criarEscopo(banco, sessao.usuarioId);

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
    // Rede de segurança do isolamento: chave estrangeira composta recusa referência a recurso de outra conta
    // (conta_id, categoria_id... de outro usuário). Para quem pediu, o recurso simplesmente não existe.
    if (erro.code === '23503') return reply.code(404).send({ erro: 'Registro não encontrado.' });
    if (erro.code === '23505') return reply.code(409).send({ erro: 'Já existe um registro igual.' });
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
  await app.register(rotasMoedas);
  await app.register(rotasRelatorios);
  await app.register(rotasAnexos);
  await app.register(rotasImportacao);

  const temFront = servirFront && existsSync(config.pastaWeb);
  if (temFront) {
    // Import dinâmico: a função do Netlify nunca serve o front e o runtime dela não aceita require() de pacote só
    // ESM (o @fastify/static puxa o content-disposition). Só o servidor local carrega o pacote.
    const { default: fastifyStatic } = await import('@fastify/static');
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
    if (request.method === 'GET' && servirFront) {
      return reply
        .code(503)
        .type('text/plain; charset=utf-8')
        .send('O front ainda não foi gerado. Rode: npm run build');
    }
    return reply.code(404).send({ erro: 'Não encontrado.' });
  });

  return app;
}
