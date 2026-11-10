import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

// Apoio dos testes de tela: uma API falsa por `fetch` e uma moldura com Query e Router. Nenhum teste fala com o
// servidor de verdade; o contrato real da API é coberto pelos testes do servidor.

export interface RespostaFalsa {
  status?: number;
  corpo: unknown;
}

type Rota = RespostaFalsa | RespostaFalsa[];

/** Registra o `fetch` falso. Cada chave é "MÉTODO /caminho"; uma lista é consumida uma resposta por chamada e a última se repete. */
export function instalarApiFalsa(rotas: Record<string, Rota>) {
  const chamadas: { chave: string; corpo: unknown }[] = [];
  const filas = new Map<string, RespostaFalsa[]>();
  const fetchFalso = vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.pathname : entrada.url;
    const chave = `${init?.method ?? 'GET'} ${url.replace(/^\/api/, '')}`;
    const corpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    chamadas.push({ chave, corpo });
    const rota = rotas[chave];
    if (!rota) return Promise.reject(new Error(`Chamada sem resposta combinada: ${chave}`));
    let resposta: RespostaFalsa;
    if (Array.isArray(rota)) {
      const fila = filas.get(chave) ?? [...rota];
      filas.set(chave, fila);
      resposta = fila.length > 1 ? (fila.shift() as RespostaFalsa) : (fila[0] as RespostaFalsa);
    } else {
      resposta = rota;
    }
    return Promise.resolve(
      new Response(JSON.stringify(resposta.corpo), {
        status: resposta.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchFalso);
  return { chamadas, fetchFalso };
}

export const SESSAO_ANONIMA: RespostaFalsa = { corpo: { autenticado: false, demo: false, cadastroAberto: false } };
export const SESSAO_ABERTA: RespostaFalsa = {
  corpo: { autenticado: true, demo: false, cadastroAberto: false, usuario: 'ana', csrf: 'csrf-de-teste', fuso: 'America/Sao_Paulo' },
};

/** Mostra o endereço atual, para o teste conferir para onde a navegação foi. */
export function EnderecoAtual() {
  const local = useLocation();
  return <p data-testid="endereco">{`${local.pathname}${local.search}`}</p>;
}

export function renderizarComRotas(ui: ReactNode, enderecoInicial = '/') {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[enderecoInicial]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
