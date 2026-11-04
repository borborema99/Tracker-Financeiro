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
