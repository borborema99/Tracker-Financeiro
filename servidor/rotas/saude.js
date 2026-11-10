import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../../package.json');

export async function rotasSaude(app) {
  app.get('/api/saude', { config: { publica: true } }, async (_request, reply) => {
    try {
      await app.db.consultar('SELECT 1');
    } catch {
      return reply.code(503).send({ ok: false });
    }
    return { ok: true, versao: version };
  });
}
