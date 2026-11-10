// Ponte entre a Netlify Function v2 (Request/Response da Web) e o Fastify (ADR 013). O Fastify roda por
// `app.inject`, sem abrir porta. A instância é criada uma vez, fora do handler, e reaproveitada entre invocações
// quentes (`obterApp` devolve sempre a mesma promessa).
//
// IP do cliente: o Netlify entrega o IP real em `context.ip`. O `x-forwarded-for` que chega na requisição pode ter
// sido forjado por quem chama, então é descartado e o IP real vai como `remoteAddress`; é ele que alimenta o
// bloqueio de login por IP. O app roda com `trustProxy: true` só para ler `x-forwarded-proto` (cookie Secure).

const SEM_CORPO = new Set(['GET', 'HEAD']);
// Cabeçalhos que o `inject` calcula sozinho ou que não fazem sentido numa resposta montada em memória.
const IGNORAR_NA_RESPOSTA = new Set(['connection', 'transfer-encoding', 'keep-alive']);

export function criarManipulador(obterApp) {
  return async function manipular(req, context) {
    let app;
    try {
      app = await obterApp();
    } catch (erro) {
      console.error('Falha ao iniciar a API:', erro?.message ?? erro);
      return Response.json({ erro: 'Serviço indisponível.' }, { status: 503 });
    }

    const url = new URL(req.url);
    const cabecalhos = Object.fromEntries(req.headers);
    delete cabecalhos['x-forwarded-for'];
    delete cabecalhos['content-length'];
    cabecalhos['x-forwarded-proto'] = url.protocol.replace(':', '');
    cabecalhos.host = url.host;

    const resposta = await app.inject({
      method: req.method,
      url: url.pathname + url.search,
      headers: cabecalhos,
      payload: SEM_CORPO.has(req.method) ? undefined : Buffer.from(await req.arrayBuffer()),
      remoteAddress: context?.ip,
    });

    const saida = new Headers();
    for (const [nome, valor] of Object.entries(resposta.headers)) {
      if (IGNORAR_NA_RESPOSTA.has(nome) || valor === undefined) continue;
      // Set-Cookie pode vir em lista: cada cookie precisa ir como cabeçalho próprio.
      for (const item of Array.isArray(valor) ? valor : [valor]) saida.append(nome, String(item));
    }
    const semCorpo = resposta.statusCode === 204 || resposta.statusCode === 304 || req.method === 'HEAD';
    return new Response(semCorpo ? null : resposta.rawPayload, { status: resposta.statusCode, headers: saida });
  };
}
