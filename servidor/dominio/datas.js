/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function hojeNoFuso(fuso, agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/** 'AAAA-MM-DD' + n dias -> 'AAAA-MM-DD' (n pode ser negativo). */
export function somarDias(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dias entre duas datas (ate − de). */
export function diasEntre(de, ate) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
}

/** 'AAAA-MM' ->{ de: 'AAAA-MM-01', ate: 'AAAA-MM-último' }. */
export function intervaloDoMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}
