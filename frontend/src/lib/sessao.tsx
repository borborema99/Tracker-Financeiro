import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { esquemaSessao } from '../../../contratos/sessao.js';
import { api, definirCsrf } from './api';

// A sessão mora no servidor (cookie HttpOnly). O front só pergunta "quem sou eu?" em GET /api/sessao e guarda o
// token CSRF que vem junto para as escritas.

/** Forma da resposta, inferida do contrato do servidor (só tipo: o Zod não entra no chunk da landing). */
export type Sessao = z.infer<typeof esquemaSessao>;

const CHAVE = ['sessao'] as const;

async function buscarSessao(): Promise<Sessao> {
  const dados = await api<Partial<Sessao>>('/sessao');
  if (typeof dados.autenticado !== 'boolean') throw new Error('Resposta inesperada do servidor.');
  const sessao: Sessao = {
    autenticado: dados.autenticado,
    cadastroAberto: dados.cadastroAberto === true,
    demo: dados.demo === true,
    ...(dados.usuario === undefined ? {} : { usuario: dados.usuario }),
    ...(dados.csrf === undefined ? {} : { csrf: dados.csrf }),
    ...(dados.fuso === undefined ? {} : { fuso: dados.fuso }),
  };
  definirCsrf(sessao.csrf);
  return sessao;
}

/** Estado da sessão: `sessao` fica indefinida enquanto carrega ou se a consulta falhou (veja `erro`). */
export function useSessao() {
  const consulta = useQuery({ queryKey: CHAVE, queryFn: buscarSessao, staleTime: 60_000 });
  return {
    sessao: consulta.data,
    carregando: consulta.isPending,
    erro: consulta.isError ? consulta.error : null,
    recarregar: consulta.refetch,
  };
}

export function useEntrar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (corpo: { usuario: string; senha: string }) => api('/login', { metodo: 'POST', corpo }),
    onSuccess: () => cliente.fetchQuery({ queryKey: CHAVE, queryFn: buscarSessao, staleTime: 0 }),
  });
}

export function useCriarConta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (corpo: { usuario: string; senha: string }) => api('/cadastro', { metodo: 'POST', corpo }),
    onSuccess: () => cliente.fetchQuery({ queryKey: CHAVE, queryFn: buscarSessao, staleTime: 0 }),
  });
}

export function useSair() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => api('/logout', { metodo: 'POST' }),
    onSettled: () => {
      definirCsrf(null);
      // Nada do usuário que saiu pode ficar no cache da próxima pessoa que usar este navegador.
      cliente.clear();
    },
  });
}
