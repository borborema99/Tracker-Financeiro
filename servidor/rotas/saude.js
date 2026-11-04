import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../../package.json');

export async function rotasSaude(app) {
  app.get('/api/saude', { config: { publica: true } }, async (_request, reply) => {
    try {
      app.db.prepare('SELECT 1').get();
    } catch {
      return reply.code(503).send({ ok: false });
    }
    return { ok: true, versao: version };
  });
}
