import {
  esquemaContaMoeda,
  esquemaCotacao,
  esquemaEdicaoContaMoeda,
  esquemaOperacaoMoeda,
} from '../../contratos/moedas.js';
import {
  atualizarContaMoeda,
  criarContaMoeda,
  excluirContaMoeda,
  excluirCotacao,
  excluirOperacaoMoeda,
  listarContasMoeda,
  listarCotacoes,
  obterContaMoeda,
  registrarCotacao,
  registrarOperacaoMoeda,
  resumoDeMoedas,
} from '../banco/repositorios/moedas.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, hojeDe, idDe } from './util.js';

function subId(request, campo, objeto) {
  const n = Number(request.params[campo]);
  if (!Number.isSafeInteger(n) || n <= 0) throw naoEncontrado(objeto);
  return n;
}

export async function rotasMoedas(app) {
  // Contas em moeda estrangeira, cotações informadas e totais em reais (só das contas com cotação).
  app.get('/api/moedas', async (request) => {
    const esc = request.esc;
    const hoje = await hojeDe(esc);
    return { itens: await listarContasMoeda(esc, hoje), cotacoes: await listarCotacoes(esc), totais: await resumoDeMoedas(esc, hoje) };
  });

  app.get('/api/moedas/contas/:id', async (request) => {
    const conta = await obterContaMoeda(request.esc, idDe(request), await hojeDe(request.esc));
    if (!conta) throw naoEncontrado('Conta em moeda estrangeira');
    return conta;
  });

  app.post('/api/moedas/contas', async (request, reply) =>
    reply
      .code(201)
      .send(
        await criarContaMoeda(request.esc, esquemaContaMoeda.parse(request.body), await contextoDeEscrita(request.esc)),
      ),
  );

  app.put('/api/moedas/contas/:id', async (request) =>
    atualizarContaMoeda(
      request.esc,
      idDe(request),
      esquemaEdicaoContaMoeda.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.delete('/api/moedas/contas/:id', async (request, reply) => {
    await excluirContaMoeda(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });

  app.post('/api/moedas/contas/:id/operacoes', async (request, reply) =>
    reply
      .code(201)
      .send(
        await registrarOperacaoMoeda(
          request.esc,
          idDe(request),
          esquemaOperacaoMoeda.parse(request.body),
          await contextoDeEscrita(request.esc),
        ),
      ),
  );

  app.delete('/api/moedas/contas/:id/operacoes/:operacaoId', async (request) =>
    excluirOperacaoMoeda(
      request.esc,
      idDe(request),
      subId(request, 'operacaoId', 'Operação'),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.post('/api/moedas/cotacoes', async (request, reply) =>
    reply
      .code(201)
      .send(await registrarCotacao(request.esc, esquemaCotacao.parse(request.body), await contextoDeEscrita(request.esc))),
  );

  app.delete('/api/moedas/cotacoes/:id', async (request) =>
    excluirCotacao(request.esc, idDe(request), await contextoDeEscrita(request.esc)),
  );
}
