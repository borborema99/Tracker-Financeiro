import { esquemaConta } from '../../contratos/contas.js';
import { atualizarConta, criarConta, excluirConta, listarContas } from '../banco/repositorios/contas.js';
import { idDe } from './util.js';

export async function rotasContas(app) {
  const { db } = app;

  app.get('/api/contas', async () => ({ itens: listarContas(db) }));

  app.post('/api/contas', async (request, reply) => {
    const conta = criarConta(db, esquemaConta.parse(request.body));
    return reply.code(201).send(conta);
  });

  app.put('/api/contas/:id', async (request) =>
    atualizarConta(db, idDe(request), esquemaConta.parse(request.body)),
  );

  app.delete('/api/contas/:id', async (request, reply) => {
    excluirConta(db, idDe(request));
    return reply.code(204).send();
  });
}
