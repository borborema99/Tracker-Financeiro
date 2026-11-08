import { esquemaDivida, esquemaEdicaoDivida } from '../../contratos/dividas.js';
import { alternarAssinatura, listarAssinaturas } from '../banco/repositorios/assinaturas.js';
import { atualizarDivida, criarDivida, excluirDivida, listarDividas, obterDivida } from '../banco/repositorios/dividas.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, garantirOcorrencias, hojeDe, idDe } from './util.js';

export async function rotasDividas(app) {
  const { db } = app;

  app.get('/api/dividas', async () => ({ itens: listarDividas(db, hojeDe(db)) }));

  app.get('/api/dividas/:id', async (request) => {
    const d = obterDivida(db, idDe(request), hojeDe(db));
    if (!d) throw naoEncontrado('Dívida');
    return d;
  });

  // Cria a dívida e as parcelas como despesas pendentes. Pagar, reagendar e baixa parcial seguem em /api/compromissos.
  app.post('/api/dividas', async (request, reply) =>
    reply.code(201).send(criarDivida(db, esquemaDivida.parse(request.body), contextoDeEscrita(db))),
  );

  app.put('/api/dividas/:id', async (request) =>
    atualizarDivida(db, idDe(request), esquemaEdicaoDivida.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/dividas/:id', async (request, reply) => {
    excluirDivida(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });

  // Assinaturas são recorrências de despesa marcadas; criar e editar seguem em /api/recorrencias.
  app.get('/api/assinaturas', async () => {
    garantirOcorrencias(db);
    return listarAssinaturas(db);
  });

  app.post('/api/assinaturas/:id/pausar', async (request) => alternarAssinatura(db, idDe(request), false, contextoDeEscrita(db)));

  app.post('/api/assinaturas/:id/reativar', async (request) => alternarAssinatura(db, idDe(request), true, contextoDeEscrita(db)));
}
