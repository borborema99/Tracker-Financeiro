import { esquemaFluxo, esquemaProjecao } from '../../contratos/fluxo.js';
import { esquemaMes } from '../../contratos/movimentacoes.js';
import { alertasDoApp, calendarioDoMes, fluxoDeCaixa, projecaoDeSaldo } from '../banco/repositorios/fluxo.js';
import { garantirOcorrencias } from './util.js';

export async function rotasFluxo(app) {
  // Realizado (o que entrou e saiu das contas), agrupado por dia, semana, mês ou ano.
  app.get('/api/fluxo', async (request) => {
    await garantirOcorrencias(request.esc);
    return fluxoDeCaixa(request.esc, esquemaFluxo.parse(request.query));
  });

  // Previsto: saldo dia a dia daqui para frente.
  app.get('/api/fluxo/projecao', async (request) => {
    const ctx = await garantirOcorrencias(request.esc);
    const { dias } = esquemaProjecao.parse(request.query);
    return { dias, ...(await projecaoDeSaldo(request.esc, ctx.hoje, dias)) };
  });

  app.get('/api/calendario', async (request) => {
    const ctx = await garantirOcorrencias(request.esc);
    const { mes } = esquemaMes.parse(request.query);
    return calendarioDoMes(request.esc, mes ?? ctx.hoje.slice(0, 7), ctx.hoje);
  });

  app.get('/api/alertas', async (request) => {
    const ctx = await garantirOcorrencias(request.esc);
    return alertasDoApp(request.esc, ctx.hoje);
  });
}
