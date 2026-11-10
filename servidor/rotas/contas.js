import { esquemaConta } from '../../contratos/contas.js';
import { atualizarConta, criarConta, excluirConta, listarContas } from '../banco/repositorios/contas.js';
import { idDe } from './util.js';

export async function rotasContas(app) {
  app.get('/api/contas', async (request) => ({ itens: await listarContas(request.esc) }));

  app.post('/api/contas', async (request, reply) => {
    const conta = await criarConta(request.esc, esquemaConta.parse(request.body));
    return reply.code(201).send(conta);
  });

  app.put('/api/contas/:id', async (request) =>
    atualizarConta(request.esc, idDe(request), esquemaConta.parse(request.body)),
  );

  app.delete('/api/contas/:id', async (request, reply) => {
    await excluirConta(request.esc, idDe(request));
    return reply.code(204).send();
  });
}
