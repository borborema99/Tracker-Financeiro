import { TAMANHO_MAXIMO_OFX, esquemaConfirmarOfx, esquemaPreviaOfx } from '../../contratos/importacao.js';
import { confirmarOfx, previaOfx } from '../banco/repositorios/importacao.js';
import { invalido } from '../erros.js';
import { contextoDeEscrita } from './util.js';

export async function rotasImportacao(app) {
  // O extrato vai cru no corpo (o servidor escolhe a codificação pelo cabeçalho do próprio OFX).
  app.addContentTypeParser(['application/x-ofx', 'application/octet-stream'], { parseAs: 'buffer' }, (request, corpo, pronto) =>
    pronto(null, corpo),
  );

  // Prévia: lê e marca cada transação (nova, já importada, possível duplicidade). Não grava nada.
  app.post('/api/importacao/ofx/previa', { bodyLimit: TAMANHO_MAXIMO_OFX }, async (request) => {
    const { conta_id: contaId } = esquemaPreviaOfx.parse(request.query);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw invalido({ arquivo: 'Envie o arquivo do extrato.' });
    return previaOfx(request.esc, contaId, request.body);
  });

  app.post('/api/importacao/ofx/confirmar', async (request) =>
    confirmarOfx(request.esc, esquemaConfirmarOfx.parse(request.body), await contextoDeEscrita(request.esc)),
  );
}
