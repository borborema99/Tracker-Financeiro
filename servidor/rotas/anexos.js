import { TAMANHO_MAXIMO_ANEXO, TIPOS_DE_ANEXO, esquemaNomeDoArquivo } from '../../contratos/anexos.js';
import { anexarArquivo, listarAnexos, obterArquivo, removerAnexo } from '../banco/repositorios/anexos.js';
import { abreNaTela } from '../dominio/anexo.js';
import { invalido, naoEncontrado } from '../erros.js';
import { contextoDeEscrita, idDe } from './util.js';

/** O nome vem codificado (encodeURIComponent) num cabeçalho; cabeçalho ausente ou ilegível vira erro de campo. */
function nomeDoCabecalho(request) {
  const bruto = request.headers['x-nome-arquivo'];
  let nome = '';
  try {
    nome = typeof bruto === 'string' ? decodeURIComponent(bruto) : '';
  } catch {
    nome = '';
  }
  const lido = esquemaNomeDoArquivo.safeParse(nome);
  if (!lido.success) throw invalido({ arquivo: lido.error.issues[0].message });
  return lido.data;
}

export async function rotasAnexos(app) {
  const { db } = app;

  // O arquivo vai cru no corpo. O Content-Type declarado só escolhe o parser; o tipo real sai dos bytes.
  app.addContentTypeParser([...TIPOS_DE_ANEXO, 'application/octet-stream'], { parseAs: 'buffer' }, (request, corpo, pronto) =>
    pronto(null, corpo),
  );

  app.get('/api/movimentacoes/:id/anexos', async (request) => {
    const itens = listarAnexos(db, idDe(request));
    if (!itens) throw naoEncontrado('Lançamento');
    return { itens };
  });

  app.post('/api/movimentacoes/:id/anexos', { bodyLimit: TAMANHO_MAXIMO_ANEXO + 1024 }, async (request, reply) => {
    const id = idDe(request);
    const nome = nomeDoCabecalho(request);
    return reply.code(201).send(anexarArquivo(db, id, { nome, conteudo: request.body }, contextoDeEscrita(db)));
  });

  // Imagens abrem na tela; PDF baixa. `nosniff` já vai em todas as respostas.
  app.get('/api/anexos/:id/arquivo', async (request, reply) => {
    const arquivo = obterArquivo(db, idDe(request));
    if (!arquivo) throw naoEncontrado('Anexo');
    const nomeCodificado = encodeURIComponent(arquivo.nome);
    return reply
      .header('Content-Type', arquivo.tipo_mime)
      .header(
        'Content-Disposition',
        `${abreNaTela(arquivo.tipo_mime) ? 'inline' : 'attachment'}; filename="comprovante"; filename*=UTF-8''${nomeCodificado}`,
      )
      .send(arquivo.conteudo);
  });

  app.delete('/api/anexos/:id', async (request, reply) => {
    removerAnexo(db, idDe(request), contextoDeEscrita(db));
    return reply.code(204).send();
  });
}
