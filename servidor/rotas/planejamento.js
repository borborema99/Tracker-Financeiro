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
  // Orçamento do mês (padrão: mês atual): limites, realizado, previsto e o que ficou sem orçamento.
  app.get('/api/orcamento', async (request) => {
    const { mes } = esquemaMes.parse(request.query);
    return orcamentoDoMes(request.esc, mes ?? (await hojeDe(request.esc)).slice(0, 7));
  });

  // O id é o da categoria principal. Limite 0 tira o orçamento daquele mês em diante.
  app.put('/api/orcamento/:id', async (request) =>
    definirLimite(
      request.esc,
      idDe(request),
      esquemaLimiteOrcamento.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.get('/api/metas', async (request) => ({ itens: await listarMetas(request.esc, await hojeDe(request.esc)) }));

  app.get('/api/metas/:id', async (request) => {
    const meta = await obterMeta(request.esc, idDe(request), await hojeDe(request.esc));
    if (!meta) throw naoEncontrado('Meta');
    return meta;
  });

  app.post('/api/metas', async (request, reply) =>
    reply
      .code(201)
      .send(await criarMeta(request.esc, esquemaMeta.parse(request.body), await contextoDeEscrita(request.esc))),
  );

  app.put('/api/metas/:id', async (request) =>
    atualizarMeta(request.esc, idDe(request), esquemaMeta.parse(request.body), await contextoDeEscrita(request.esc)),
  );

  app.delete('/api/metas/:id', async (request, reply) => {
    await excluirMeta(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });

  app.post('/api/metas/:id/aportes', async (request, reply) =>
    reply
      .code(201)
      .send(
        await registrarAporte(
          request.esc,
          idDe(request),
          esquemaAporte.parse(request.body),
          await contextoDeEscrita(request.esc),
        ),
      ),
  );

  app.delete('/api/metas/:id/aportes/:aporteId', async (request) => {
    const aporteId = Number(request.params.aporteId);
    if (!Number.isSafeInteger(aporteId) || aporteId <= 0) throw naoEncontrado('Aporte');
    return excluirAporte(request.esc, idDe(request), aporteId, await contextoDeEscrita(request.esc));
  });
}
