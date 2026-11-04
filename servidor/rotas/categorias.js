import { esquemaCategoria } from '../../contratos/categorias.js';
import {
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  listarCategorias,
} from '../banco/repositorios/categorias.js';
import { idDe } from './util.js';

export async function rotasCategorias(app) {
  const { db } = app;

  app.get('/api/categorias', async () => ({ itens: listarCategorias(db) }));

  app.post('/api/categorias', async (request, reply) => {
    const categoria = criarCategoria(db, esquemaCategoria.parse(request.body));
    return reply.code(201).send(categoria);
  });

  app.put('/api/categorias/:id', async (request) =>
    atualizarCategoria(db, idDe(request), esquemaCategoria.parse(request.body)),
  );

  app.delete('/api/categorias/:id', async (request, reply) => {
    excluirCategoria(db, idDe(request));
    return reply.code(204).send();
  });
}
