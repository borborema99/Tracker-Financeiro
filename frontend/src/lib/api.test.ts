import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, definirCsrf, enviarArquivo, ErroApi } from './api';

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
});

describe('api', () => {
  it('GET não leva o token CSRF e usa o cookie da mesma origem', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaJson({ ok: true }));
    vi.stubGlobal('fetch', fetchFalso);
    definirCsrf('token');
    await api('/contas');
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/contas');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
  });

  it('escrita leva o token CSRF e o corpo em JSON', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaJson({ id: 1 }));
    vi.stubGlobal('fetch', fetchFalso);
    definirCsrf('token-123');
    await api('/contas', { metodo: 'POST', corpo: { nome: 'A' } });
    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('token-123');
    expect(headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"nome":"A"}');
  });

  it('erro da API vira ErroApi com status, mensagem e campos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({ erro: 'Dados inválidos.', campos: { nome: 'Informe o nome.' } }, 400)));
    const erro = await api('/contas', { metodo: 'POST', corpo: {} }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 400, message: 'Dados inválidos.', campos: { nome: 'Informe o nome.' } });
  });

  it('sem rede, a mensagem é em português e o status é 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const erro = await api('/contas').catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 0 });
    expect((erro as Error).message).toMatch(/Sem conexão/);
  });

  it('resposta de erro sem JSON ainda dá uma mensagem útil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })));
    const erro = await api('/contas').catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 502, message: 'Algo deu errado.' });
  });

  it('enviarArquivo manda o corpo cru com o token CSRF', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaJson({ id: 7 }));
    vi.stubGlobal('fetch', fetchFalso);
    definirCsrf('t');
    const arquivo = new Blob(['conteudo']);
    await enviarArquivo('/movimentacoes/1/anexos', arquivo, { 'x-nome-arquivo': 'nota.pdf' });
    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(arquivo);
    expect(headers['x-nome-arquivo']).toBe('nota.pdf');
    expect(headers['x-csrf-token']).toBe('t');
  });
});
