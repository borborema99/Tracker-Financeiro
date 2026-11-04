import { esquemaFiltros, esquemaLiquidar, esquemaMovimentacao } from '../../contratos/movimentacoes.js';
import {
  atualizarMovimentacao,
  criarMovimentacao,
  excluirMovimentacao,
  historicoDaMovimentacao,
  liquidarMovimentacao,
  listarMovimentacoes,
  obterMovimentacao,
  reabrirMovimentacao,
} from '../banco/repositorios/movimentacoes.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, idDe } from './util.js';

export async function rotasMovimentacoes(app) {
  const { db } = app;

  app.get('/api/movimentacoes', async (request) => listarMovimentacoes(db, esquemaFiltros.parse(request.query)));

  app.get('/api/movimentacoes/:id', async (request) => {
    const m = obterMovimentacao(db, idDe(request));
    if (!m) throw naoEncontrado('Lançamento');
    return m;
  });

  app.get('/api/movimentacoes/:id/historico', async (request) => ({
    itens: historicoDaMovimentacao(db, idDe(request)),
  }));

  app.post('/api/movimentacoes', async (request, reply) => {
    const resultado = criarMovimentacao(db, esquemaMovimentacao.parse(request.body), contextoDeEscrita(db));
    return reply.code(201).send(resultado);
  });

  app.put('/api/movimentacoes/:id', async (request) =>
    atualizarMovimentacao(db, idDe(request), esquemaMovimentacao.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/movimentacoes/:id', async (request, reply) => {
    excluirMovimentacao(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });

  app.post('/api/movimentacoes/:id/liquidar', async (request) => {
    const { data_liquidacao: data } = esquemaLiquidar.parse(request.body ?? {});
    return liquidarMovimentacao(db, idDe(request), data, contextoDeEscrita(db));
  });

  app.post('/api/movimentacoes/:id/reabrir', async (request) =>
    reabrirMovimentacao(db, idDe(request), contextoDeEscrita(db)),
  );
}
