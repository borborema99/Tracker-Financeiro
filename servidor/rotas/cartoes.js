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
  app.get('/api/cartoes', async (request) => ({ itens: await listarCartoes(request.esc, await hojeDe(request.esc)) }));

  app.get('/api/cartoes/:id', async (request) => {
    const cartao = await obterCartao(request.esc, idDe(request), await hojeDe(request.esc));
    if (!cartao) throw naoEncontrado('Cartão');
    return cartao;
  });

  app.post('/api/cartoes', async (request, reply) =>
    reply
      .code(201)
      .send(await criarCartao(request.esc, esquemaCartao.parse(request.body), await contextoDeEscrita(request.esc))),
  );

  app.put('/api/cartoes/:id', async (request) =>
    atualizarCartao(request.esc, idDe(request), esquemaCartao.parse(request.body), await contextoDeEscrita(request.esc)),
  );

  app.delete('/api/cartoes/:id', async (request, reply) => {
    await excluirCartao(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });

  app.get('/api/cartoes/:id/faturas', async (request) => ({
    itens: await faturasDoCartao(request.esc, idDe(request), await hojeDe(request.esc)),
  }));

  app.get('/api/cartoes/:id/projecao', async (request) =>
    projecaoDoCartao(request.esc, idDe(request), await hojeDe(request.esc)),
  );

  app.get('/api/cartoes/:id/compras', async (request) =>
    listarComprasDoCartao(request.esc, idDe(request), esquemaListaCompras.parse(request.query)),
  );

  app.get('/api/faturas/:id', async (request) => obterFatura(request.esc, idDe(request), await hojeDe(request.esc)));

  app.post('/api/faturas/:id/pagamentos', async (request, reply) =>
    reply
      .code(201)
      .send(
        await pagarFatura(
          request.esc,
          idDe(request),
          esquemaPagamentoFatura.parse(request.body),
          await contextoDeEscrita(request.esc),
        ),
      ),
  );

  app.delete('/api/pagamentos-fatura/:id', async (request) =>
    excluirPagamento(request.esc, idDe(request), await contextoDeEscrita(request.esc)),
  );

  app.get('/api/compras-cartao/:id', async (request) => {
    const compra = await obterCompra(request.esc, idDe(request));
    if (!compra) throw naoEncontrado('Compra');
    return compra;
  });

  app.post('/api/compras-cartao', async (request, reply) =>
    reply
      .code(201)
      .send(await criarCompra(request.esc, esquemaCompra.parse(request.body), await contextoDeEscrita(request.esc))),
  );

  app.put('/api/compras-cartao/:id', async (request) =>
    atualizarCompra(request.esc, idDe(request), esquemaCompra.parse(request.body), await contextoDeEscrita(request.esc)),
  );

  app.delete('/api/compras-cartao/:id', async (request, reply) => {
    await excluirCompra(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });

  app.post('/api/compras-cartao/:id/estornos', async (request, reply) =>
    reply
      .code(201)
      .send(
        await estornarCompra(
          request.esc,
          idDe(request),
          esquemaEstorno.parse(request.body),
          await contextoDeEscrita(request.esc),
        ),
      ),
  );

  app.delete('/api/estornos-cartao/:id', async (request) =>
    excluirEstorno(request.esc, idDe(request), await contextoDeEscrita(request.esc)),
  );

  app.post('/api/compras-cartao/:id/antecipar', async (request) =>
    anteciparParcelas(
      request.esc,
      idDe(request),
      esquemaAntecipacao.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );
}
