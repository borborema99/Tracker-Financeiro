import { esquemaConfig, FUSO_PADRAO } from '../../contratos/config.js';
import { auditar } from '../banco/auditoria.js';
import { gravarConfig, lerConfig } from '../banco/config-db.js';

export async function rotasConfig(app) {
  const { db } = app;

  app.get('/api/config', async () => ({ fuso: lerConfig(db, 'fuso') ?? FUSO_PADRAO }));

  app.put('/api/config', async (request) => {
    const { fuso } = esquemaConfig.parse(request.body);
    db.transaction(() => {
      const antes = { fuso: lerConfig(db, 'fuso') ?? FUSO_PADRAO };
      gravarConfig(db, 'fuso', fuso);
      auditar(db, { entidade: 'config', id: 'fuso', acao: 'editar', antes, depois: { fuso } });
    })();
    return { fuso };
  });
}
