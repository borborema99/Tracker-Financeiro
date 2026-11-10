import { estaAtrasada } from '../../dominio/compromisso.js';
import { listarMovimentacoes } from './movimentacoes.js';

/**
 * Tabelas de dados do usuário, na ordem em que podem ser recriadas (cada uma só aponta para as anteriores).
 * Ficam de fora: `usuarios` (hash da senha), `sessoes`, `tentativas_login`, `config` e `audit_log`.
 */
export const TABELAS_DA_COPIA = [
  'contas', 'categorias',
  // Recorrências e dívidas vêm antes: os lançamentos apontam para elas (e elas não apontam para lançamentos).
  'recorrencias', 'recorrencias_puladas', 'dividas',
  'movimentacoes', 'movimentacao_divisoes',
  'cartoes', 'faturas', 'compras_cartao', 'parcelas_cartao', 'estornos_cartao', 'pagamentos_fatura',
  'orcamentos', 'metas', 'metas_aportes',
  'investimentos', 'investimentos_operacoes', 'investimentos_avaliacoes',
  'contas_moeda', 'moeda_operacoes', 'moeda_cotacoes',
  // Só o registro dos anexos (nome, tipo, tamanho). O arquivo fica no armazenamento; o script de backup o leva à parte.
  'anexos', 'importacoes_ofx',
];

const nomes = async (esc, tabela) =>
  new Map((await esc.todos(`SELECT id, nome FROM ${tabela} WHERE usuario_id = :u`)).map((l) => [l.id, l.nome]));

/** Todas as movimentações que casam com os filtros (sem paginação), já com nomes de conta e categoria. */
export async function linhasDeLancamentos(esc, filtros, hoje) {
  const contas = await nomes(esc, 'contas');
  const categorias = await nomes(esc, 'categorias');
  const todas = [];
  for (let pagina = 1; ; pagina++) {
    const r = await listarMovimentacoes(esc, { ...filtros, pagina, por_pagina: 100 }, hoje);
    todas.push(...r.itens);
    if (todas.length >= r.total || r.itens.length === 0) break;
  }
  return todas.map((m) => ({
    ...m,
    conta: contas.get(m.conta_id) ?? '',
    conta_destino: m.conta_destino_id ? (contas.get(m.conta_destino_id) ?? '') : '',
    categoria: m.divisoes.length
      ? m.divisoes.map((d) => `${categorias.get(d.categoria_id) ?? ''}`).join(' + ')
      : (categorias.get(m.categoria_id) ?? ''),
    situacao: m.status === 'liquidada' ? 'Liquidada' : estaAtrasada(m, hoje) ? 'Atrasada' : 'Pendente',
  }));
}

/** Uma linha por compra no cartão (as parcelas ficam no JSON completo). */
export function linhasDeComprasCartao(esc) {
  return esc.todos(
    `SELECT c.id, c.data_compra, k.nome AS cartao, c.descricao, g.nome AS categoria, c.valor_total_centavos,
            c.parcelas_total, c.observacao,
            COALESCE((SELECT SUM(e.valor_centavos) FROM estornos_cartao e
                       WHERE e.usuario_id = :u AND e.compra_id = c.id AND e.excluido_em IS NULL), 0) AS estornado_centavos
       FROM compras_cartao c
       JOIN cartoes k ON k.usuario_id = c.usuario_id AND k.id = c.cartao_id
       LEFT JOIN categorias g ON g.usuario_id = c.usuario_id AND g.id = c.categoria_id
      WHERE c.usuario_id = :u AND c.excluida_em IS NULL
      ORDER BY c.data_compra, c.id`,
  );
}

/**
 * Cópia completa em JSON, com exclusões lógicas incluídas (é um retrato fiel das tabelas, não um relatório).
 * Só do usuário do escopo e sem `usuario_id` (quem restaura põe o do destino). `comCaminhos` mantém o caminho do
 * arquivo de cada anexo no armazenamento, para o script de backup; a API não o entrega.
 */
export async function copiaCompleta(esc, agora = new Date(), { comCaminhos = false } = {}) {
  const { v: versao } = await esc.um('SELECT MAX(versao) AS v FROM schema_migrations');
  const dados = {};
  for (const tabela of TABELAS_DA_COPIA) {
    const ordem = tabela === 'recorrencias_puladas' ? 'recorrencia_id, data_ocorrencia' : 'id';
    const linhas = await esc.todos(`SELECT * FROM ${tabela} WHERE usuario_id = :u ORDER BY ${ordem}`);
    dados[tabela] = linhas.map(({ usuario_id: _, caminho_storage: caminho, ...resto }) =>
      tabela === 'anexos' && comCaminhos ? { ...resto, caminho_storage: caminho } : resto,
    );
  }
  return {
    sistema: 'tracker-financeiro',
    versao_do_esquema: versao,
    exportado_em: agora.toISOString(),
    aviso: 'Valores em centavos inteiros; datas AAAA-MM-DD; timestamps em UTC. Não inclui senha nem sessões.',
    dados,
  };
}
