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
  // Contas a pagar (despesas) e a receber (receitas) pendentes. Liquidar e reabrir seguem em /api/movimentacoes.
  app.get('/api/compromissos', async (request) => {
    const ctx = await garantirOcorrencias(request.esc);
    return listarCompromissos(request.esc, esquemaFiltrosCompromissos.parse(request.query), ctx.hoje);
  });

  app.post('/api/compromissos/:id/baixa-parcial', async (request) =>
    baixarParcial(
      request.esc,
      idDe(request),
      esquemaBaixaParcial.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.post('/api/compromissos/:id/reagendar', async (request) =>
    reagendar(request.esc, idDe(request), esquemaReagendar.parse(request.body), await contextoDeEscrita(request.esc)),
  );

  app.get('/api/recorrencias', async (request) => {
    await garantirOcorrencias(request.esc);
    return { itens: await listarRecorrencias(request.esc) };
  });

  app.get('/api/recorrencias/:id', async (request) => {
    const r = await obterRecorrencia(request.esc, idDe(request));
    if (!r) throw naoEncontrado('Recorrência');
    return r;
  });

  app.post('/api/recorrencias', async (request, reply) =>
    reply
      .code(201)
      .send(
        await criarRecorrencia(request.esc, esquemaRecorrencia.parse(request.body), await contextoDeEscrita(request.esc)),
      ),
  );

  app.put('/api/recorrencias/:id', async (request) =>
    atualizarRecorrencia(
      request.esc,
      idDe(request),
      esquemaRecorrencia.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.delete('/api/recorrencias/:id', async (request, reply) => {
    await excluirRecorrencia(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });
}
