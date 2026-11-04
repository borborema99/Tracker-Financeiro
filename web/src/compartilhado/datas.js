// Só apresentação de datas. Datas sem hora ficam em AAAA-MM-DD; timestamps são UTC.

/** Data de hoje (AAAA-MM-DD) no fuso configurado: padrão do campo de data. */
export function hojeIso(fuso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** '2026-11-04' -> '04/11/2026' (sem passar por Date, para não deslocar o dia). */
export function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Timestamp UTC -> 'dd/mm/aaaa hh:mm' no fuso configurado. */
export function formatarDataHora(isoUtc, fuso) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(isoUtc),
  );
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** '2026-11' -> 'novembro de 2026'. */
export function nomeDoMes(mes) {
  const [ano, m] = mes.split('-');
  return `${MESES[Number(m) - 1]} de ${ano}`;
}

/** 'AAAA-MM' + n meses (n pode ser negativo). Só navegação: não há cálculo financeiro aqui. */
export function somarMesesIso(mes, n) {
  const [ano, m] = mes.split('-').map(Number);
  const indice = ano * 12 + (m - 1) + n;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`;
}

/** Dia da semana de uma data AAAA-MM-DD (0 = domingo). */
export const diaDaSemana = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Quantos dias tem o mês 'AAAA-MM'. */
export function diasDoMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

/** Rótulo de um período do fluxo: dia, semana (começa na segunda), mês ou ano. */
export function rotuloDoPeriodo(periodo, agrupar) {
  if (agrupar === 'dia') return formatarData(periodo);
  if (agrupar === 'semana') return `Semana de ${formatarData(periodo).slice(0, 5)}`;
  if (agrupar === 'mes') return nomeDoMes(periodo);
  return periodo;
}
