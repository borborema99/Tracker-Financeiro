import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, definirCsrf } from '../compartilhado/api.js';

export function useSessao() {
  return useQuery({
    queryKey: ['sessao'],
    queryFn: async () => {
      const sessao = await api('/sessao');
      definirCsrf(sessao.csrf);
      return sessao;
    },
  });
}

export function useLogin() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (senha) => api('/login', { metodo: 'POST', corpo: { senha } }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['sessao'] }),
  });
}

export function useLogout() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => api('/logout', { metodo: 'POST' }),
    onSuccess: () => {
      definirCsrf(null);
      cliente.clear();
      cliente.invalidateQueries({ queryKey: ['sessao'] });
    },
  });
}
