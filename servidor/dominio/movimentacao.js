import { formatarDinheiro } from '../../contratos/dinheiro.js';

/**
 * Regras de consistência de uma movimentação que não dependem do banco.
 * Devolve { campo: mensagem } (vazio se estiver tudo certo).
 */
export function validarRegras(d) {
  const erros = {};
  const divisoes = d.divisoes ?? [];

  if (d.tipo === 'transferencia') {
    if (!d.conta_destino_id) erros.conta_destino_id = 'Escolha a conta de destino.';
    else if (d.conta_destino_id === d.conta_id) {
      erros.conta_destino_id = 'A origem e o destino precisam ser contas diferentes.';
    }
    if (d.categoria_id) erros.categoria_id = 'Transferência não tem categoria.';
    if (divisoes.length > 0) erros.divisoes = 'Transferência não pode ser dividida entre categorias.';
  } else {
    if (d.conta_destino_id) erros.conta_destino_id = 'Só transferência tem conta de destino.';
    if ((d.tarifa_centavos ?? 0) > 0) erros.tarifa_centavos = 'Só transferência tem tarifa.';
  }

  if (divisoes.length > 0 && d.tipo !== 'transferencia') {
    if (d.categoria_id) erros.categoria_id = 'Use uma categoria ou a divisão, não as duas.';
    if (divisoes.length < 2) erros.divisoes = 'Para dividir, informe pelo menos duas categorias.';
    else {
      const soma = divisoes.reduce((acc, p) => acc + p.valor_centavos, 0);
      if (soma !== d.valor_centavos) {
        erros.divisoes =
          `A soma das divisões (${formatarDinheiro(soma)}) precisa ser igual ao valor ` +
          `(${formatarDinheiro(d.valor_centavos)}).`;
      }
    }
  }

  if (d.reembolso_de_id && d.tipo !== 'receita') erros.reembolso_de_id = 'Só uma receita pode ser reembolso.';

  if (d.status === 'pendente' && d.data_liquidacao) {
    erros.data_liquidacao = 'Uma movimentação pendente não tem data de liquidação.';
  }
  return erros;
}

/** RF-05: quanto ainda pode ser reembolsado de uma despesa (nunca negativo). */
export const restanteReembolsavel = (valorOriginalCentavos, jaReembolsadoCentavos) =>
  Math.max(0, valorOriginalCentavos - jaReembolsadoCentavos);

/** Aplica os padrões: transferência sem categoria, liquidada com data (hoje se faltar), pendente sem data. */
export function normalizar(d, hoje) {
  const n = { ...d, divisoes: d.divisoes ?? [] };
  if (n.tipo === 'transferencia') {
    n.categoria_id = null;
    n.divisoes = [];
  } else {
    n.conta_destino_id = null;
    n.tarifa_centavos = 0;
  }
  n.categoria_id = n.divisoes.length > 0 ? null : (n.categoria_id ?? null);
  n.reembolso_de_id = n.tipo === 'receita' ? (n.reembolso_de_id ?? null) : null;
  n.data_vencimento = n.data_vencimento ?? null;
  if (n.status === 'liquidada') n.data_liquidacao = n.data_liquidacao ?? hoje;
  else n.data_liquidacao = null;
  n.observacao = n.observacao ?? '';
  n.descricao = n.descricao ?? '';
  n.tarifa_centavos = n.tarifa_centavos ?? 0;
  return n;
}
