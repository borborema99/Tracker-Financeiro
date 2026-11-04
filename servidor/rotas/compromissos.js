import { esquemaBaixaParcial, esquemaFiltrosCompromissos, esquemaReagendar } from '../../contratos/compromissos.js';
import { esquemaRecorrencia } from '../../contratos/recorrencias.js';
import { listarCompromissos } from '../banco/repositorios/compromissos.js';
import { baixarParcial, reagendar } from '../banco/repositorios/movimentacoes.js';
import {
  atualizarRecorrencia,
  criarRecorrencia,
  excluirRecorrencia,
  listarRecorrencias,
  obterRecorrencia,
} from '../banco/repositorios/recorrencias.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, garantirOcorrencias, idDe } from './util.js';

export async function rotasCompromissos(app) {
  const { db } = app;

  // Contas a pagar (despesas) e a receber (receitas) pendentes. Liquidar e reabrir seguem em /api/movimentacoes.
  app.get('/api/compromissos', async (request) => {
    const ctx = garantirOcorrencias(db);
    return listarCompromissos(db, esquemaFiltrosCompromissos.parse(request.query), ctx.hoje);
  });

  app.post('/api/compromissos/:id/baixa-parcial', async (request) =>
    baixarParcial(db, idDe(request), esquemaBaixaParcial.parse(request.body), contextoDeEscrita(db)),
  );

  app.post('/api/compromissos/:id/reagendar', async (request) =>
    reagendar(db, idDe(request), esquemaReagendar.parse(request.body), contextoDeEscrita(db)),
  );

  app.get('/api/recorrencias', async () => {
    garantirOcorrencias(db);
    return { itens: listarRecorrencias(db) };
  });

  app.get('/api/recorrencias/:id', async (request) => {
    const r = obterRecorrencia(db, idDe(request));
    if (!r) throw naoEncontrado('Recorrência');
    return r;
  });

  app.post('/api/recorrencias', async (request, reply) =>
    reply.code(201).send(criarRecorrencia(db, esquemaRecorrencia.parse(request.body), contextoDeEscrita(db))),
  );

  app.put('/api/recorrencias/:id', async (request) =>
    atualizarRecorrencia(db, idDe(request), esquemaRecorrencia.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/recorrencias/:id', async (request, reply) => {
    excluirRecorrencia(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });
}
