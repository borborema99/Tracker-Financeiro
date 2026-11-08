import { naoEncontrado } from '../../erros.js';
import { custoAnualCentavos, custoMensalEquivalenteCentavos, totaisDeAssinaturas } from '../../dominio/assinatura.js';
import { atualizarRecorrencia, listarRecorrencias, obterRecorrencia } from './recorrencias.js';

/** Assinaturas = recorrências de despesa marcadas como assinatura, com o custo equivalente calculado. */
export function listarAssinaturas(db) {
  const itens = listarRecorrencias(db)
    .filter((r) => r.assinatura)
    .map((r) => ({
      ...r,
      custo_mensal_centavos: custoMensalEquivalenteCentavos(r.valor_centavos, r.frequencia),
      custo_anual_centavos: custoAnualCentavos(r.valor_centavos, r.frequencia),
    }))
    .sort(
      (a, b) =>
        Number(b.ativa) - Number(a.ativa) ||
        (a.proximo_vencimento ?? '9999-99-99').localeCompare(b.proximo_vencimento ?? '9999-99-99') ||
        a.descricao.localeCompare(b.descricao, 'pt-BR'),
    );
  return { itens, totais: totaisDeAssinaturas(itens) };
}

/** Resumo para o início: só existe com assinatura ativa (RF-10). */
export function resumoDeAssinaturas(db) {
  const { totais } = listarAssinaturas(db);
  return totais.ativas > 0 ? totais : null;
}

/** Pausa ou reativa uma assinatura. Pausada não gera cobranças; reativar não recria as do período pausado (RF-18). */
export function alternarAssinatura(db, id, ativa, ctx) {
  const r = obterRecorrencia(db, id);
  if (!r || !r.assinatura) throw naoEncontrado('Assinatura');
  return atualizarRecorrencia(
    db,
    id,
    {
      tipo: r.tipo,
      descricao: r.descricao,
      valor_centavos: r.valor_centavos,
      conta_id: r.conta_id,
      categoria_id: r.categoria_id,
      frequencia: r.frequencia,
      data_inicio: r.data_inicio,
      data_fim: r.data_fim,
      ativa,
      assinatura: true,
      observacao: r.observacao,
    },
    ctx,
  );
}
