let csrf = null;

export function definirCsrf(token) {
  csrf = token ?? null;
}

export class ErroApi extends Error {
  constructor(status, mensagem, campos) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
  }
}

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const headers = {};
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  if (metodo !== 'GET' && csrf) headers['x-csrf-token'] = csrf;

  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers,
      credentials: 'same-origin',
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Ele está ligado?');
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroApi(resposta.status, dados.erro ?? 'Algo deu errado.', dados.campos);
  return dados;
}

/** Envia o arquivo cru no corpo (anexos e extratos). `cabecalhos` leva o nome do arquivo, por exemplo. */
export async function enviarArquivo(caminho, arquivo, cabecalhos = {}) {
  const headers = { 'content-type': 'application/octet-stream', ...cabecalhos };
  if (csrf) headers['x-csrf-token'] = csrf;

  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, { method: 'POST', headers, credentials: 'same-origin', body: arquivo });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Ele está ligado?');
  }
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 413) throw new ErroApi(413, 'Arquivo grande demais.');
  if (!resposta.ok) throw new ErroApi(resposta.status, dados.erro ?? 'Algo deu errado.', dados.campos);
  return dados;
}
