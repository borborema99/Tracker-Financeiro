import { esquemaConfig } from '../../contratos/config.js';
import { auditar } from '../banco/auditoria.js';
import { gravarConfig } from '../banco/config-db.js';
import { fusoDe } from './util.js';

export async function rotasConfig(app) {
  app.get('/api/config', async (request) => ({ fuso: await fusoDe(request.esc) }));

  app.put('/api/config', async (request) => {
    const { fuso } = esquemaConfig.parse(request.body);
    await request.esc.transacao(async (tx) => {
      const antes = { fuso: await fusoDe(tx) };
      await gravarConfig(tx, 'fuso', fuso);
      await auditar(tx, { entidade: 'config', id: 'fuso', acao: 'editar', antes, depois: { fuso } });
    });
    return { fuso };
  });
}
