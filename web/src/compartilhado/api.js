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
