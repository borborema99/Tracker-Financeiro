import { esquemaFluxo, esquemaProjecao } from '../../contratos/fluxo.js';
import { esquemaMes } from '../../contratos/movimentacoes.js';
import { alertasDoApp, calendarioDoMes, fluxoDeCaixa, projecaoDeSaldo } from '../banco/repositorios/fluxo.js';
import { garantirOcorrencias } from './util.js';

export async function rotasFluxo(app) {
  const { db } = app;

  // Realizado (o que entrou e saiu das contas), agrupado por dia, semana, mês ou ano.
  app.get('/api/fluxo', async (request) => {
    garantirOcorrencias(db);
    return fluxoDeCaixa(db, esquemaFluxo.parse(request.query));
  });

  // Previsto: saldo dia a dia daqui para frente.
  app.get('/api/fluxo/projecao', async (request) => {
    const ctx = garantirOcorrencias(db);
    const { dias } = esquemaProjecao.parse(request.query);
    return { dias, ...projecaoDeSaldo(db, ctx.hoje, dias) };
  });

  app.get('/api/calendario', async (request) => {
    const ctx = garantirOcorrencias(db);
    const { mes } = esquemaMes.parse(request.query);
    return calendarioDoMes(db, mes ?? ctx.hoje.slice(0, 7), ctx.hoje);
  });

  app.get('/api/alertas', async () => {
    const ctx = garantirOcorrencias(db);
    return alertasDoApp(db, ctx.hoje);
  });
}
