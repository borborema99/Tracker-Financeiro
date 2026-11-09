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
  if (!Number.isInteger(n) || n <= 0) throw naoEncontrado(objeto);
  return n;
}

export async function rotasMoedas(app) {
  const { db } = app;

  // Contas em moeda estrangeira, cotações informadas e totais em reais (só das contas com cotação).
  app.get('/api/moedas', async () => {
    const hoje = hojeDe(db);
    return { itens: listarContasMoeda(db, hoje), cotacoes: listarCotacoes(db), totais: resumoDeMoedas(db, hoje) };
  });

  app.get('/api/moedas/contas/:id', async (request) => {
    const conta = obterContaMoeda(db, idDe(request), hojeDe(db));
    if (!conta) throw naoEncontrado('Conta em moeda estrangeira');
    return conta;
  });

  app.post('/api/moedas/contas', async (request, reply) =>
    reply.code(201).send(criarContaMoeda(db, esquemaContaMoeda.parse(request.body), contextoDeEscrita(db))),
  );

  app.put('/api/moedas/contas/:id', async (request) =>
    atualizarContaMoeda(db, idDe(request), esquemaEdicaoContaMoeda.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/moedas/contas/:id', async (request, reply) => {
    excluirContaMoeda(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });

  app.post('/api/moedas/contas/:id/operacoes', async (request, reply) =>
    reply
      .code(201)
      .send(registrarOperacaoMoeda(db, idDe(request), esquemaOperacaoMoeda.parse(request.body), contextoDeEscrita(db))),
  );

  app.delete('/api/moedas/contas/:id/operacoes/:operacaoId', async (request) =>
    excluirOperacaoMoeda(db, idDe(request), subId(request, 'operacaoId', 'Operação'), contextoDeEscrita(db)),
  );

  app.post('/api/moedas/cotacoes', async (request, reply) =>
    reply.code(201).send(registrarCotacao(db, esquemaCotacao.parse(request.body), contextoDeEscrita(db))),
  );

  app.delete('/api/moedas/cotacoes/:id', async (request) => excluirCotacao(db, idDe(request), contextoDeEscrita(db)));
}
