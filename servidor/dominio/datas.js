/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function hojeNoFuso(fuso, agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/** 'AAAA-MM' -> { de: 'AAAA-MM-01', ate: 'AAAA-MM-último' }. */
export function intervaloDoMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}
