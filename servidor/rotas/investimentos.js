import { esquemaAvaliacao, esquemaInvestimento, esquemaOperacaoInvestimento } from '../../contratos/investimentos.js';
import {
  atualizarInvestimento,
  criarInvestimento,
  excluirAvaliacao,
  excluirInvestimento,
  excluirOperacao,
  listarInvestimentos,
  obterInvestimento,
  registrarAvaliacao,
  registrarOperacao,
} from '../banco/repositorios/investimentos.js';
import { calcularPatrimonioAtual } from '../banco/repositorios/patrimonio.js';
import { naoEncontrado } from '../erros.js';
import { contextoDeEscrita, hojeDe, idDe } from './util.js';

function subId(request, campo, objeto) {
  const n = Number(request.params[campo]);
  if (!Number.isInteger(n) || n <= 0) throw naoEncontrado(objeto);
  return n;
}

export async function rotasInvestimentos(app) {
  const { db } = app;

  app.get('/api/investimentos', async () => {
    const itens = listarInvestimentos(db);
    return { itens, totais: calcularPatrimonioAtual(db, hojeDe(db)).carteira };
  });

  app.get('/api/investimentos/:id', async (request) => {
    const investimento = obterInvestimento(db, idDe(request));
    if (!investimento) throw naoEncontrado('Investimento');
    return investimento;
  });

  app.post('/api/investimentos', async (request, reply) =>
    reply.code(201).send(criarInvestimento(db, esquemaInvestimento.parse(request.body), contextoDeEscrita(db))),
  );

  app.put('/api/investimentos/:id', async (request) =>
    atualizarInvestimento(db, idDe(request), esquemaInvestimento.parse(request.body), contextoDeEscrita(db)),
  );

  app.delete('/api/investimentos/:id', async (request, reply) => {
    excluirInvestimento(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });

  app.post('/api/investimentos/:id/operacoes', async (request, reply) =>
    reply
      .code(201)
      .send(registrarOperacao(db, idDe(request), esquemaOperacaoInvestimento.parse(request.body), contextoDeEscrita(db))),
  );

  app.delete('/api/investimentos/:id/operacoes/:operacaoId', async (request) =>
    excluirOperacao(db, idDe(request), subId(request, 'operacaoId', 'Operação'), contextoDeEscrita(db)),
  );

  app.post('/api/investimentos/:id/avaliacoes', async (request, reply) =>
    reply.code(201).send(registrarAvaliacao(db, idDe(request), esquemaAvaliacao.parse(request.body), contextoDeEscrita(db))),
  );

  app.delete('/api/investimentos/:id/avaliacoes/:avaliacaoId', async (request) =>
    excluirAvaliacao(db, idDe(request), subId(request, 'avaliacaoId', 'Avaliação'), contextoDeEscrita(db)),
  );

  // Patrimônio líquido: ativos (contas e investimentos) menos passivos (cartão e dívidas).
  app.get('/api/patrimonio', async () => calcularPatrimonioAtual(db, hojeDe(db)).patrimonio);
}
