import { esquemaDivida, esquemaEdicaoDivida } from '../../contratos/dividas.js';
import { alternarAssinatura, listarAssinaturas } from '../banco/repositorios/assinaturas.js';
import { atualizarDivida, criarDivida, excluirDivida, listarDividas, obterDivida } from '../banco/repositorios/dividas.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, garantirOcorrencias, hojeDe, idDe } from './util.js';

export async function rotasDividas(app) {
  app.get('/api/dividas', async (request) => ({ itens: await listarDividas(request.esc, await hojeDe(request.esc)) }));

  app.get('/api/dividas/:id', async (request) => {
    const d = await obterDivida(request.esc, idDe(request), await hojeDe(request.esc));
    if (!d) throw naoEncontrado('Dívida');
    return d;
  });

  // Cria a dívida e as parcelas como despesas pendentes. Pagar, reagendar e baixa parcial seguem em /api/compromissos.
  app.post('/api/dividas', async (request, reply) =>
    reply
      .code(201)
      .send(await criarDivida(request.esc, esquemaDivida.parse(request.body), await contextoDeEscrita(request.esc))),
  );

  app.put('/api/dividas/:id', async (request) =>
    atualizarDivida(
      request.esc,
      idDe(request),
      esquemaEdicaoDivida.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.delete('/api/dividas/:id', async (request, reply) => {
    await excluirDivida(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });

  // Assinaturas são recorrências de despesa marcadas; criar e editar seguem em /api/recorrencias.
  app.get('/api/assinaturas', async (request) => {
    await garantirOcorrencias(request.esc);
    return listarAssinaturas(request.esc);
  });

  app.post('/api/assinaturas/:id/pausar', async (request) =>
    alternarAssinatura(request.esc, idDe(request), false, await contextoDeEscrita(request.esc)),
  );

  app.post('/api/assinaturas/:id/reativar', async (request) =>
    alternarAssinatura(request.esc, idDe(request), true, await contextoDeEscrita(request.esc)),
  );
}
