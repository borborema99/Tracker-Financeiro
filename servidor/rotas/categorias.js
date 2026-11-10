import { esquemaCategoria } from '../../contratos/categorias.js';
import {
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  listarCategorias,
} from '../banco/repositorios/categorias.js';
import { idDe } from './util.js';

export async function rotasCategorias(app) {
  app.get('/api/categorias', async (request) => ({ itens: await listarCategorias(request.esc) }));

  app.post('/api/categorias', async (request, reply) => {
    const categoria = await criarCategoria(request.esc, esquemaCategoria.parse(request.body));
    return reply.code(201).send(categoria);
  });

  app.put('/api/categorias/:id', async (request) =>
    atualizarCategoria(request.esc, idDe(request), esquemaCategoria.parse(request.body)),
  );

  app.delete('/api/categorias/:id', async (request, reply) => {
    await excluirCategoria(request.esc, idDe(request));
    return reply.code(204).send();
  });
}
