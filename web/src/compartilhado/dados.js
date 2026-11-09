import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const useContas = () => useQuery({ queryKey: ['contas'], queryFn: () => api('/contas') });
export const useCategorias = () => useQuery({ queryKey: ['categorias'], queryFn: () => api('/categorias') });
export const useCartoes = () => useQuery({ queryKey: ['cartoes'], queryFn: () => api('/cartoes') });
export const useAlertas = () => useQuery({ queryKey: ['alertas'], queryFn: () => api('/alertas') });

/** Depois de qualquer escrita, tudo que depende de lançamentos precisa ser relido do servidor. */
export function useInvalidarDados() {
  const cliente = useQueryClient();
  return () =>
    Promise.all(
      [
        'contas', 'categorias', 'movimentacoes', 'movimentacao', 'resumo', 'historico',
        'cartoes', 'cartao', 'faturas', 'fatura', 'projecao', 'compras', 'compra',
        'compromissos', 'recorrencias', 'recorrencia', 'fluxo', 'projecao-saldo', 'calendario', 'alertas',
        'orcamento', 'metas', 'meta', 'dividas', 'divida', 'assinaturas',
        'investimentos', 'investimento', 'patrimonio', 'relatorios', 'anexos',
      ].map((k) =>
        cliente.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

export const porId = (itens = []) => new Map(itens.map((i) => [i.id, i]));

/** 'Alimentação › Mercado' para subcategorias; só o nome para as principais. */
export function rotuloCategoria(categoria, mapa) {
  const pai = categoria.pai_id ? mapa.get(categoria.pai_id) : null;
  return pai ? `${pai.nome} › ${categoria.nome}` : categoria.nome;
}
