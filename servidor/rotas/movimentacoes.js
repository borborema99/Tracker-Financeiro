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
import { contextoDeEscrita, garantirOcorrencias, idDe } from './util.js';

export async function rotasMovimentacoes(app) {
  app.get('/api/movimentacoes', async (request) => {
    const { hoje } = await garantirOcorrencias(request.esc);
    return listarMovimentacoes(request.esc, esquemaFiltros.parse(request.query), hoje);
  });

  app.get('/api/movimentacoes/:id', async (request) => {
    const m = await obterMovimentacao(request.esc, idDe(request));
    if (!m) throw naoEncontrado('Lançamento');
    return m;
  });

  app.get('/api/movimentacoes/:id/historico', async (request) => {
    const id = idDe(request);
    // Histórico de lançamento que não é seu (ou não existe) é 404, não lista vazia. Excluído conta: o histórico
    // dele continua visível a quem o criou.
    if (!(await request.esc.um('SELECT 1 FROM movimentacoes WHERE id = ? AND usuario_id = :u', [id]))) {
      throw naoEncontrado('Lançamento');
    }
    return { itens: await historicoDaMovimentacao(request.esc, id) };
  });

  app.post('/api/movimentacoes', async (request, reply) => {
    const resultado = await criarMovimentacao(
      request.esc,
      esquemaMovimentacao.parse(request.body),
      await contextoDeEscrita(request.esc),
    );
    return reply.code(201).send(resultado);
  });

  app.put('/api/movimentacoes/:id', async (request) =>
    atualizarMovimentacao(
      request.esc,
      idDe(request),
      esquemaMovimentacao.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.delete('/api/movimentacoes/:id', async (request, reply) => {
    await excluirMovimentacao(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });

  app.post('/api/movimentacoes/:id/liquidar', async (request) => {
    const { data_liquidacao: data } = esquemaLiquidar.parse(request.body ?? {});
    return liquidarMovimentacao(request.esc, idDe(request), data, await contextoDeEscrita(request.esc));
  });

  app.post('/api/movimentacoes/:id/reabrir', async (request) =>
    reabrirMovimentacao(request.esc, idDe(request), await contextoDeEscrita(request.esc)),
  );
}
