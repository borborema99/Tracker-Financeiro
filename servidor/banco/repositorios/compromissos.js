import { diasDeAtraso, situacaoDoCompromisso, totaisDeCompromissos } from '../../dominio/compromisso.js';
import { obterMovimentacao } from './movimentacoes.js';

// Conta a pagar/receber = receita ou despesa pendente (RF-07). A transferência não é compromisso.
const BASE = `m.usuario_id = :u AND m.excluida_em IS NULL AND m.status = 'pendente' AND m.tipo IN ('receita', 'despesa')`;
const VENCIMENTO = 'COALESCE(m.data_vencimento, m.data_competencia)';

/** Todos os compromissos pendentes, só com o necessário para totais, alertas e fluxo. */
export function compromissosPendentes(esc, tipo = null) {
  return esc.todos(
    `SELECT m.id, m.tipo, m.descricao, m.valor_centavos, m.conta_id, m.categoria_id, m.data_competencia,
            m.data_vencimento, m.status
       FROM movimentacoes m WHERE ${BASE} ${tipo ? 'AND m.tipo = ?' : ''}`,
    tipo ? [tipo] : [],
  );
}

/**
 * Lista de contas a pagar (despesas) ou a receber (receitas) pendentes, da mais antiga para a mais nova.
 * "Atrasada" é calculada aqui, contra `hoje`; os totais ignoram o filtro de situação (visão geral do tipo).
 */
export async function listarCompromissos(esc, { tipo, situacao, pagina, por_pagina: porPagina }, hoje) {
  const totais = totaisDeCompromissos(await compromissosPendentes(esc, tipo), hoje);
  const onde = [BASE, 'm.tipo = ?'];
  const p = [tipo];
  if (situacao === 'atrasada') {
    onde.push(`${VENCIMENTO} < ?`);
    p.push(hoje);
  } else if (situacao === 'a_vencer') {
    onde.push(`${VENCIMENTO} >= ?`);
    p.push(hoje);
  }
  const where = onde.join(' AND ');
  const { n: total } = await esc.um(`SELECT COUNT(*) AS n FROM movimentacoes m WHERE ${where}`, p);
  const ids = await esc.todos(
    `SELECT m.id FROM movimentacoes m WHERE ${where} ORDER BY ${VENCIMENTO}, m.id LIMIT ? OFFSET ?`,
    [...p, porPagina, (pagina - 1) * porPagina],
  );
  const itens = [];
  for (const { id } of ids) {
    const m = await obterMovimentacao(esc, id);
    itens.push({
      ...m,
      vencimento: m.data_vencimento ?? m.data_competencia,
      situacao: situacaoDoCompromisso(m, hoje),
      dias_de_atraso: diasDeAtraso(m, hoje),
      recorrente: m.recorrencia_id != null,
    });
  }
  return { itens, total, pagina, por_pagina: porPagina, totais };
}
