import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// Consultas compartilhadas por várias telas e o tipo das respostas. O servidor devolve indicadores prontos; o
// front só mostra. Os tipos descrevem apenas os campos que as telas leem.

export interface Conta {
  id: number;
  nome: string;
  tipo: string;
  saldo_inicial_centavos: number;
  saldo_centavos: number;
  arquivada: boolean;
}

export interface Categoria {
  id: number;
  nome: string;
  tipo: 'despesa' | 'receita';
  pai_id: number | null;
  arquivada: boolean;
  papel: string | null;
  usos: number;
}

export interface Cartao {
  id: number;
  nome: string;
  limite_centavos: number;
  dia_fechamento: number;
  dia_vencimento: number;
  conta_pagamento_id: number | null;
  arquivado: boolean;
  limite: LimiteDoCartao;
  ciclo_atual: { referencia: string; data_fechamento: string; data_vencimento: string };
  fatura_atual: { total_centavos: number; status: StatusDaFatura } | null;
}

export type StatusDaFatura = 'aberta' | 'fechada' | 'parcial' | 'paga' | 'atrasada';

/** Limite do cartão: todos os números vêm calculados pelo servidor (RF de cartão). */
export interface LimiteDoCartao {
  limite_centavos: number;
  usado_centavos: number;
  disponivel_centavos: number;
  faturas_nao_pagas_centavos: number;
  parcelas_futuras_centavos: number;
}

export interface Alerta {
  codigo: string;
  nivel: 'alta' | 'media' | 'info';
  titulo: string;
  mensagem: string;
  link: string;
}

export interface Lista<T> {
  itens: T[];
}

export const useContas = () => useQuery({ queryKey: ['contas'], queryFn: () => api<Lista<Conta>>('/contas') });
export const useCategorias = () =>
  useQuery({ queryKey: ['categorias'], queryFn: () => api<Lista<Categoria>>('/categorias') });
export const useCartoes = () => useQuery({ queryKey: ['cartoes'], queryFn: () => api<Lista<Cartao>>('/cartoes') });
export const useAlertas = () =>
  useQuery({ queryKey: ['alertas'], queryFn: () => api<{ total: number; alertas: Alerta[] }>('/alertas') });

const CHAVES_DE_DADOS = [
  'contas', 'categorias', 'movimentacoes', 'movimentacao', 'resumo', 'historico',
  'cartoes', 'cartao', 'faturas', 'fatura', 'projecao', 'compras', 'compra',
  'compromissos', 'recorrencias', 'recorrencia', 'fluxo', 'projecao-saldo', 'calendario', 'alertas',
  'orcamento', 'metas', 'meta', 'dividas', 'divida', 'assinaturas',
  'investimentos', 'investimento', 'patrimonio', 'relatorios', 'anexos', 'moedas', 'moeda',
];

/** Depois de qualquer escrita, tudo que depende de lançamentos precisa ser relido do servidor. */
export function useInvalidarDados(): () => Promise<unknown> {
  const cliente = useQueryClient();
  return () => Promise.all(CHAVES_DE_DADOS.map((k) => cliente.invalidateQueries({ queryKey: [k] })));
}

export const porId = <T extends { id: number }>(itens: T[] = []): Map<number, T> =>
  new Map(itens.map((i) => [i.id, i]));

/** 'Alimentação › Mercado' para subcategorias; só o nome para as principais. */
export function rotuloCategoria(categoria: Categoria, mapa: Map<number, Categoria>): string {
  const pai = categoria.pai_id ? mapa.get(categoria.pai_id) : null;
  return pai ? `${pai.nome} › ${categoria.nome}` : categoria.nome;
}
