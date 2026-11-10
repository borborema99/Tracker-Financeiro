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
  if (!Number.isSafeInteger(n) || n <= 0) throw naoEncontrado(objeto);
  return n;
}

export async function rotasInvestimentos(app) {
  app.get('/api/investimentos', async (request) => {
    const itens = await listarInvestimentos(request.esc);
    return { itens, totais: (await calcularPatrimonioAtual(request.esc, await hojeDe(request.esc))).carteira };
  });

  app.get('/api/investimentos/:id', async (request) => {
    const investimento = await obterInvestimento(request.esc, idDe(request));
    if (!investimento) throw naoEncontrado('Investimento');
    return investimento;
  });

  app.post('/api/investimentos', async (request, reply) =>
    reply
      .code(201)
      .send(
        await criarInvestimento(
          request.esc,
          esquemaInvestimento.parse(request.body),
          await contextoDeEscrita(request.esc),
        ),
      ),
  );

  app.put('/api/investimentos/:id', async (request) =>
    atualizarInvestimento(
      request.esc,
      idDe(request),
      esquemaInvestimento.parse(request.body),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.delete('/api/investimentos/:id', async (request, reply) => {
    await excluirInvestimento(request.esc, idDe(request), await contextoDeEscrita(request.esc));
    return reply.code(204).send();
  });

  app.post('/api/investimentos/:id/operacoes', async (request, reply) =>
    reply
      .code(201)
      .send(
        await registrarOperacao(
          request.esc,
          idDe(request),
          esquemaOperacaoInvestimento.parse(request.body),
          await contextoDeEscrita(request.esc),
        ),
      ),
  );

  app.delete('/api/investimentos/:id/operacoes/:operacaoId', async (request) =>
    excluirOperacao(
      request.esc,
      idDe(request),
      subId(request, 'operacaoId', 'Operação'),
      await contextoDeEscrita(request.esc),
    ),
  );

  app.post('/api/investimentos/:id/avaliacoes', async (request, reply) =>
    reply
      .code(201)
      .send(
        await registrarAvaliacao(
          request.esc,
          idDe(request),
          esquemaAvaliacao.parse(request.body),
          await contextoDeEscrita(request.esc),
        ),
      ),
  );

  app.delete('/api/investimentos/:id/avaliacoes/:avaliacaoId', async (request) =>
    excluirAvaliacao(
      request.esc,
      idDe(request),
      subId(request, 'avaliacaoId', 'Avaliação'),
      await contextoDeEscrita(request.esc),
    ),
  );

  // Patrimônio líquido: ativos (contas e investimentos) menos passivos (cartão e dívidas).
  app.get('/api/patrimonio', async (request) => (await calcularPatrimonioAtual(request.esc, await hojeDe(request.esc))).patrimonio);
}
