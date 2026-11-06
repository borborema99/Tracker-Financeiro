import { esquemaMes } from '../../contratos/movimentacoes.js';
import { esquemaAporte, esquemaLimiteOrcamento, esquemaMeta } from '../../contratos/planejamento.js';
import {
  atualizarMeta,
  criarMeta,
  excluirAporte,
  excluirMeta,
  listarMetas,
  obterMeta,
  registrarAporte,
} from '../banco/repositorios/metas.js';
import { definirLimite, orcamentoDoMes } from '../banco/repositorios/orcamentos.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, hojeDe, idDe } from './util.js';

export async function rotasPlanejamento(app) {
  const { db } = app;

  // Orçamento do mês (padrão: mês atual): limites, realizado, previsto e o que ficou sem orçamento.
  app.get('/api/orcamento', async (request) => {
    const { mes } = esquemaMes.parse(request.query);
    return orcamentoDoMes(db, mes ?? hojeDe(db).slice(0, 7));
  });

  // O id é o da categoria principal. Limite 0 tira o orçamento daquele mês em diante.
  app.put('/api/orcamento/:id', async (request) =>
    definirLimite(db, idDe(request), esquemaLimiteOrcamento.parse(request.body), contextoDeEscrita(db)),
  );

  app.get('/api/metas', async () => ({ itens: listarMetas(db, hojeDe(db)) }));

  app.get('/api/metas/:id', async (request) => {
    const meta = obterMeta(db, idDe(request), hojeDe(db));
    if (!meta) throw naoEncontrado('Meta');
    return meta;
  });

  app.post('/api/metas', async (request, reply) =>
    reply.code(201).send(criarMeta(db, esquemaMeta.parse(request.body), contextoDeEscrita(db))),
  );

  app.put('/api/metas/:id', async (request) =>
    atualizarMeta(db, idDe(request), esquemaMeta.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/metas/:id', async (request, reply) => {
    excluirMeta(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });

  app.post('/api/metas/:id/aportes', async (request, reply) =>
    reply.code(201).send(registrarAporte(db, idDe(request), esquemaAporte.parse(request.body), contextoDeEscrita(db))),
  );

  app.delete('/api/metas/:id/aportes/:aporteId', async (request) => {
    const aporteId = Number(request.params.aporteId);
    if (!Number.isInteger(aporteId) || aporteId <= 0) throw naoEncontrado('Aporte');
    return excluirAporte(db, idDe(request), aporteId, contextoDeEscrita(db));
  });
}
