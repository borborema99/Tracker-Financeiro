// Cliente da API. O servidor é a autoridade: o front só envia e recebe. Escrita leva o token CSRF; o cookie de
// sessão é HttpOnly e o navegador o manda sozinho (credentials: 'same-origin').

let csrf: string | null = null;

export function definirCsrf(token: string | null | undefined): void {
  csrf = token ?? null;
}

/** Erro devolvido pela API (`erro` e, em validação, `campos` por nome de campo). */
export class ErroApi extends Error {
  readonly status: number;
  readonly campos: Record<string, string> | undefined;

  constructor(status: number, mensagem: string, campos?: Record<string, string>) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.campos = campos;
  }
}

interface RespostaDeErro {
  erro?: string;
  campos?: Record<string, string>;
}

interface OpcoesApi {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo?: unknown;
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return {};
  }
}

async function enviar(caminho: string, init: RequestInit): Promise<unknown> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, { ...init, credentials: 'same-origin' });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }
  const dados = await lerJson(resposta);
  if (!resposta.ok) {
    const { erro, campos } = dados as RespostaDeErro;
    throw new ErroApi(resposta.status, erro ?? 'Algo deu errado.', campos);
  }
  return dados;
}

export async function api<T>(caminho: string, { metodo = 'GET', corpo }: OpcoesApi = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  if (metodo !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
  const dados = await enviar(caminho, {
    method: metodo,
    headers,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  return dados as T;
}

/** Envia o arquivo cru no corpo (comprovantes e extratos). `cabecalhos` leva o nome do arquivo, por exemplo. */
export async function enviarArquivo<T>(
  caminho: string,
  arquivo: Blob,
  cabecalhos: Record<string, string> = {},
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream', ...cabecalhos };
  if (csrf) headers['x-csrf-token'] = csrf;
  const dados = await enviar(caminho, { method: 'POST', headers, body: arquivo });
  return dados as T;
}
