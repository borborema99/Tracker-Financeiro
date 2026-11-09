import { estaAtrasada } from '../../dominio/compromisso.js';
import { listarMovimentacoes } from './movimentacoes.js';

/** Tabelas de dados do usuário. Ficam de fora: `config` (guarda o hash da senha), sessões, tentativas de login e audit_log. */
export const TABELAS_DA_COPIA = [
  'contas', 'categorias', 'movimentacoes', 'movimentacao_divisoes',
  'cartoes', 'faturas', 'compras_cartao', 'parcelas_cartao', 'estornos_cartao', 'pagamentos_fatura',
  'recorrencias', 'recorrencias_puladas',
  'orcamentos', 'metas', 'metas_aportes', 'dividas',
  'investimentos', 'investimentos_operacoes', 'investimentos_avaliacoes',
  'contas_moeda', 'moeda_operacoes', 'moeda_cotacoes',
  // Só o registro dos anexos (nome, tipo, tamanho). O conteúdo (`anexos_arquivos`) fica de fora do JSON; o backup leva.
  'anexos', 'importacoes_ofx',
];

const nomes = (db, tabela) => new Map(db.prepare(`SELECT id, nome FROM ${tabela}`).all().map((l) => [l.id, l.nome]));

/** Todas as movimentações que casam com os filtros (sem paginação), já com nomes de conta e categoria. */
export function linhasDeLancamentos(db, filtros, hoje) {
  const contas = nomes(db, 'contas');
  const categorias = nomes(db, 'categorias');
  const todas = [];
  for (let pagina = 1; ; pagina++) {
    const r = listarMovimentacoes(db, { ...filtros, pagina, por_pagina: 100 }, hoje);
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
export function linhasDeComprasCartao(db) {
  return db
    .prepare(
      `SELECT c.id, c.data_compra, k.nome AS cartao, c.descricao, g.nome AS categoria, c.valor_total_centavos,
              c.parcelas_total, c.observacao,
              COALESCE((SELECT SUM(e.valor_centavos) FROM estornos_cartao e
                         WHERE e.compra_id = c.id AND e.excluido_em IS NULL), 0) AS estornado_centavos
         FROM compras_cartao c
         JOIN cartoes k ON k.id = c.cartao_id
         LEFT JOIN categorias g ON g.id = c.categoria_id
        WHERE c.excluida_em IS NULL
        ORDER BY c.data_compra, c.id`,
    )
    .all();
}

/** Cópia completa em JSON, com exclusões lógicas incluídas (é um retrato fiel das tabelas, não um relatório). */
export function copiaCompleta(db, agora = new Date()) {
  const versao = db.prepare('SELECT MAX(versao) AS v FROM schema_migrations').get().v;
  const dados = Object.fromEntries(TABELAS_DA_COPIA.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]));
  return {
    sistema: 'tracker-financeiro',
    versao_do_esquema: versao,
    exportado_em: agora.toISOString(),
    aviso: 'Valores em centavos inteiros; datas AAAA-MM-DD; timestamps em UTC. Não inclui senha nem sessões.',
    dados,
  };
}
