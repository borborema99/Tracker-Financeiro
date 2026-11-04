import {
  esquemaAntecipacao,
  esquemaCartao,
  esquemaCompra,
  esquemaEstorno,
  esquemaListaCompras,
  esquemaPagamentoFatura,
} from '../../contratos/cartoes.js';
import {
  anteciparParcelas,
  atualizarCartao,
  atualizarCompra,
  criarCartao,
  criarCompra,
  estornarCompra,
  excluirCartao,
  excluirCompra,
  excluirEstorno,
  excluirPagamento,
  faturasDoCartao,
  listarCartoes,
  listarComprasDoCartao,
  obterCartao,
  obterCompra,
  obterFatura,
  pagarFatura,
  projecaoDoCartao,
} from '../banco/repositorios/cartoes.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, hojeDe, idDe } from './util.js';

export async function rotasCartoes(app) {
  const { db } = app;

  app.get('/api/cartoes', async () => ({ itens: listarCartoes(db, hojeDe(db)) }));

  app.get('/api/cartoes/:id', async (request) => {
    const cartao = obterCartao(db, idDe(request), hojeDe(db));
    if (!cartao) throw naoEncontrado('Cartão');
    return cartao;
  });

  app.post('/api/cartoes', async (request, reply) =>
    reply.code(201).send(criarCartao(db, esquemaCartao.parse(request.body), contextoDeEscrita(db))),
  );

  app.put('/api/cartoes/:id', async (request) =>
    atualizarCartao(db, idDe(request), esquemaCartao.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/cartoes/:id', async (request, reply) => {
    excluirCartao(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });

  app.get('/api/cartoes/:id/faturas', async (request) => ({
    itens: faturasDoCartao(db, idDe(request), hojeDe(db)),
  }));

  app.get('/api/cartoes/:id/projecao', async (request) => projecaoDoCartao(db, idDe(request), hojeDe(db)));

  app.get('/api/cartoes/:id/compras', async (request) =>
    listarComprasDoCartao(db, idDe(request), esquemaListaCompras.parse(request.query)),
  );

  app.get('/api/faturas/:id', async (request) => obterFatura(db, idDe(request), hojeDe(db)));

  app.post('/api/faturas/:id/pagamentos', async (request, reply) =>
    reply
      .code(201)
      .send(pagarFatura(db, idDe(request), esquemaPagamentoFatura.parse(request.body), contextoDeEscrita(db))),
  );

  app.delete('/api/pagamentos-fatura/:id', async (request) =>
    excluirPagamento(db, idDe(request), contextoDeEscrita(db)),
  );

  app.get('/api/compras-cartao/:id', async (request) => {
    const compra = obterCompra(db, idDe(request));
    if (!compra) throw naoEncontrado('Compra');
    return compra;
  });

  app.post('/api/compras-cartao', async (request, reply) =>
    reply.code(201).send(criarCompra(db, esquemaCompra.parse(request.body), contextoDeEscrita(db))),
  );

  app.put('/api/compras-cartao/:id', async (request) =>
    atualizarCompra(db, idDe(request), esquemaCompra.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/compras-cartao/:id', async (request, reply) => {
    excluirCompra(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });

  app.post('/api/compras-cartao/:id/estornos', async (request, reply) =>
    reply
      .code(201)
      .send(estornarCompra(db, idDe(request), esquemaEstorno.parse(request.body), contextoDeEscrita(db))),
  );

  app.delete('/api/estornos-cartao/:id', async (request) =>
    excluirEstorno(db, idDe(request), contextoDeEscrita(db)),
  );

  app.post('/api/compras-cartao/:id/antecipar', async (request) =>
    anteciparParcelas(db, idDe(request), esquemaAntecipacao.parse(request.body), contextoDeEscrita(db)),
  );
}
