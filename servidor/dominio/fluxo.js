// Fluxo de caixa: dinheiro que entra e sai das contas. Duas visões separadas (RF-02):
//  - realizado: o que já aconteceu (liquidado), agrupado por dia, semana, mês ou ano;
//  - projetado: saldo dia a dia a partir do saldo de hoje e do que ainda está previsto.
// Eventos: { data, tipo: 'entrada' | 'saida', valor_centavos }.
import { diasEntre, somarDias } from './datas.js';

/** Segunda-feira da semana da data. */
export function inicioDaSemana(iso) {
  const diaDaSemana = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(iso, -((diaDaSemana + 6) % 7));
}

/** Chave do período: dia 'AAAA-MM-DD', semana (segunda) 'AAAA-MM-DD', mês 'AAAA-MM', ano 'AAAA'. */
export function chaveDoPeriodo(iso, agrupar) {
  if (agrupar === 'dia') return iso;
  if (agrupar === 'semana') return inicioDaSemana(iso);
  if (agrupar === 'mes') return iso.slice(0, 7);
  if (agrupar === 'ano') return iso.slice(0, 4);
  throw new RangeError(`agrupamento desconhecido: ${agrupar}`);
}

/** Realizado por período, em ordem cronológica. Só entra o que está dentro de [de, ate]. */
export function fluxoRealizado(eventos, { de, ate, agrupar }) {
  const periodos = new Map();
  for (const e of eventos) {
    if (e.data < de || e.data > ate) continue;
    const chave = chaveDoPeriodo(e.data, agrupar);
    const p = periodos.get(chave) ?? { periodo: chave, entradas_centavos: 0, saidas_centavos: 0 };
    if (e.tipo === 'entrada') p.entradas_centavos += e.valor_centavos;
    else p.saidas_centavos += e.valor_centavos;
    periodos.set(chave, p);
  }
  return [...periodos.values()]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((p) => ({ ...p, resultado_centavos: p.entradas_centavos - p.saidas_centavos }));
}

/** Trechos seguidos em que o saldo projetado fica abaixo de zero. */
export function periodosNegativos(serie) {
  const periodos = [];
  let atual = null;
  for (const dia of serie) {
    if (dia.saldo_centavos < 0) {
      if (!atual) atual = { de: dia.data, ate: dia.data, minimo_centavos: dia.saldo_centavos };
      atual.ate = dia.data;
      atual.minimo_centavos = Math.min(atual.minimo_centavos, dia.saldo_centavos);
    } else if (atual) {
      periodos.push(atual);
      atual = null;
    }
  }
  if (atual) periodos.push(atual);
  return periodos;
}

/**
 * Calendário: agrupa por dia os itens (compromissos e vencimentos de fatura) de [de, ate]. Só aparecem os dias
 * com algo. `receita` entra como entrada; `despesa` e `fatura` como saída.
 */
export function montarCalendario({ de, ate, itens }) {
  const dias = new Map();
  for (const item of itens) {
    if (item.data < de || item.data > ate) continue;
    const d = dias.get(item.data) ?? { data: item.data, entradas_centavos: 0, saidas_centavos: 0, itens: [] };
    if (item.tipo === 'receita') d.entradas_centavos += item.valor_centavos;
    else d.saidas_centavos += item.valor_centavos;
    d.itens.push(item);
    dias.set(item.data, d);
  }
  return { dias: [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)) };
}

/**
 * PROJEÇÃO do saldo de hoje até hoje + `dias`. Parte do saldo atual (realizado) e aplica o que está previsto,
 * no dia do vencimento. O que já venceu e não foi baixado ainda precisa sair/entrar: conta em hoje.
 * Eventos depois do horizonte ficam de fora.
 */
export function projetarSaldo({ saldo_inicial_centavos: saldoInicial, hoje, dias, eventos }) {
  const porDia = new Map();
  const atrasados = { entradas_centavos: 0, saidas_centavos: 0 };
  for (const e of eventos) {
    const dia = e.data < hoje ? hoje : e.data;
    if (diasEntre(hoje, dia) > dias) continue;
    if (e.data < hoje) {
      if (e.tipo === 'entrada') atrasados.entradas_centavos += e.valor_centavos;
      else atrasados.saidas_centavos += e.valor_centavos;
    }
    const d = porDia.get(dia) ?? { entradas_centavos: 0, saidas_centavos: 0 };
    if (e.tipo === 'entrada') d.entradas_centavos += e.valor_centavos;
    else d.saidas_centavos += e.valor_centavos;
    porDia.set(dia, d);
  }

  const serie = [];
  let saldo = saldoInicial;
  for (let i = 0; i <= dias; i++) {
    const data = somarDias(hoje, i);
    const d = porDia.get(data) ?? { entradas_centavos: 0, saidas_centavos: 0 };
    saldo += d.entradas_centavos - d.saidas_centavos;
    serie.push({ data, ...d, saldo_centavos: saldo });
  }
  const minimo = serie.reduce((m, d) => (d.saldo_centavos < m.saldo_centavos ? d : m), serie[0]);
  return {
    saldo_inicial_centavos: saldoInicial,
    serie,
    periodos_negativos: periodosNegativos(serie),
    saldo_minimo: { data: minimo.data, centavos: minimo.saldo_centavos },
    saldo_final_centavos: saldo,
    atrasados,
  };
}
