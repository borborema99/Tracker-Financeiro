import { fluxoRealizado, montarCalendario, projetarSaldo } from '../../dominio/fluxo.js';
import { situacaoDoCompromisso, vencimentoEfetivo } from '../../dominio/compromisso.js';
import { intervaloDoMes } from '../../dominio/datas.js';
import { montarAlertas } from '../../dominio/alertas.js';
import { faturasEmAberto } from './cartoes.js';
import { compromissosPendentes } from './compromissos.js';
import { listarContas } from './contas.js';
import { orcamentoSeExistir } from './orcamentos.js';

/** O que de fato entrou e saiu das contas (RF-02, visão de caixa): liquidadas e pagamentos de fatura. */
async function eventosRealizados(esc, de, ate) {
  const liquidadas = (
    await esc.todos(
      `SELECT tipo, valor_centavos, data_liquidacao AS data FROM movimentacoes
        WHERE usuario_id = :u AND excluida_em IS NULL AND status = 'liquidada' AND tipo IN ('receita', 'despesa')
          AND data_liquidacao BETWEEN ? AND ?`,
      [de, ate],
    )
  ).map((l) => ({ data: l.data, tipo: l.tipo === 'receita' ? 'entrada' : 'saida', valor_centavos: l.valor_centavos }));
  // RF-04: a compra no cartão só sai do caixa quando a fatura é paga.
  const faturas = (
    await esc.todos(
      `SELECT valor_centavos, data_pagamento AS data FROM pagamentos_fatura
        WHERE usuario_id = :u AND excluido_em IS NULL AND data_pagamento BETWEEN ? AND ?`,
      [de, ate],
    )
  ).map((l) => ({ data: l.data, tipo: 'saida', valor_centavos: l.valor_centavos }));
  return [...liquidadas, ...faturas];
}

/** Fluxo de caixa realizado, agrupado por dia, semana, mês ou ano. */
export async function fluxoDeCaixa(esc, { de, ate, agrupar }) {
  const periodos = fluxoRealizado(await eventosRealizados(esc, de, ate), { de, ate, agrupar });
  const soma = (campo) => periodos.reduce((total, p) => total + p[campo], 0);
  return {
    de,
    ate,
    agrupar,
    periodos,
    totais: {
      entradas_centavos: soma('entradas_centavos'),
      saidas_centavos: soma('saidas_centavos'),
      resultado_centavos: soma('resultado_centavos'),
    },
  };
}

/** Previsto: compromissos pendentes (no vencimento) e faturas de cartão em aberto (no vencimento da fatura). */
async function eventosPrevistos(esc, hoje) {
  const compromissos = (await compromissosPendentes(esc)).map((m) => ({
    data: vencimentoEfetivo(m),
    tipo: m.tipo === 'receita' ? 'entrada' : 'saida',
    valor_centavos: m.valor_centavos,
  }));
  const faturas = (await faturasEmAberto(esc, hoje)).map((f) => ({
    data: f.data_vencimento,
    tipo: 'saida',
    valor_centavos: f.saldo_centavos,
  }));
  return [...compromissos, ...faturas];
}

const saldoTotalAtual = async (esc) =>
  (await listarContas(esc, { incluirArquivadas: false })).reduce((s, c) => s + c.saldo_centavos, 0);

/** Projeção dia a dia do saldo total, de hoje até hoje + `dias`, a partir do saldo atual e do que está previsto. */
export async function projecaoDeSaldo(esc, hoje, dias) {
  return projetarSaldo({
    saldo_inicial_centavos: await saldoTotalAtual(esc),
    hoje,
    dias,
    eventos: await eventosPrevistos(esc, hoje),
  });
}

/** Calendário do mês: compromissos pendentes e vencimentos de fatura, por dia. */
export async function calendarioDoMes(esc, mes, hoje) {
  const { de, ate } = intervaloDoMes(mes);
  const itens = (await compromissosPendentes(esc))
    .filter((m) => vencimentoEfetivo(m) >= de && vencimentoEfetivo(m) <= ate)
    .map((m) => ({
      data: vencimentoEfetivo(m),
      tipo: m.tipo,
      id: m.id,
      descricao: m.descricao,
      valor_centavos: m.valor_centavos,
      situacao: situacaoDoCompromisso(m, hoje),
    }));
  const faturas = (await faturasEmAberto(esc, hoje))
    .filter((f) => f.data_vencimento >= de && f.data_vencimento <= ate)
    .map((f) => ({
      data: f.data_vencimento,
      tipo: 'fatura',
      id: f.id,
      descricao: `Fatura ${f.cartao_nome} (${f.referencia})`,
      valor_centavos: f.saldo_centavos,
      situacao: f.status === 'atrasada' ? 'atrasada' : f.data_vencimento === hoje ? 'vence_hoje' : 'a_vencer',
    }));
  return { mes, hoje, ...montarCalendario({ de, ate, itens: [...itens, ...faturas] }) };
}

/** Alertas de agora: atrasos, vencimentos próximos, fechamento de fatura e saldo projetado negativo. */
export async function alertasDoApp(esc, hoje) {
  const alertas = montarAlertas({
    hoje,
    compromissos: await compromissosPendentes(esc),
    faturas: await faturasEmAberto(esc, hoje),
    projecao: await projecaoDeSaldo(esc, hoje, 30),
    orcamento: await orcamentoSeExistir(esc, hoje.slice(0, 7)),
  });
  return { alertas, total: alertas.length };
}
