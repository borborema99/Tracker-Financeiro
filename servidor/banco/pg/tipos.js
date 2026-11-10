// Conversão dos tipos do Postgres para o que o app usa (ADR 013). Vale para o driver de produção (postgres) e
// para o PGlite, para que um teste em PGlite e a produção devolvam exatamente os mesmos valores.
//   bigint       -> Number (centavos cabem em 2^53; fora disso é erro, nunca um número arredondado em silêncio)
//   date         -> texto AAAA-MM-DD (nunca objeto Date, que traria fuso)
//   timestamptz  -> texto ISO em UTC ("2026-06-15T15:00:00.000Z"), igual ao que a API já devolvia

export const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082, TIMESTAMPTZ: 1184 };

export function paraNumero(texto) {
  const n = Number(texto);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Inteiro fora do limite seguro: ${texto}`);
  return n;
}

/** `sum(bigint)` no Postgres devolve numeric (texto): vira Number, e inteiro grande demais é erro. */
export function numericoComoNumero(texto) {
  const n = Number(texto);
  if (!Number.isFinite(n)) throw new RangeError(`Número inválido: ${texto}`);
  if (Number.isInteger(n) && !Number.isSafeInteger(n)) throw new RangeError(`Inteiro fora do limite seguro: ${texto}`);
  return n;
}

export const dataComoTexto = (texto) => texto;

const INSTANTE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/;

/** "2026-06-15 15:00:00+00" -> "2026-06-15T15:00:00.000Z". */
export function instanteComoIso(texto) {
  if (texto instanceof Date) return texto.toISOString();
  const m = INSTANTE.exec(texto);
  if (!m) throw new RangeError(`Instante inválido: ${texto}`);
  const [, dia, hora, fracao = '', fuso] = m;
  let zona = fuso;
  if (zona !== 'Z') {
    const digitos = zona.slice(1).replace(':', '');
    zona = `${zona[0]}${digitos.slice(0, 2)}:${digitos.slice(2) || '00'}`;
  }
  return new Date(`${dia}T${hora}${fracao}${zona}`).toISOString();
}

/** Na ida: Date vira ISO; texto passa como está. */
export const instanteParaBanco = (v) => (v instanceof Date ? v.toISOString() : v);

/** Opção `types` do driver `postgres`. As chaves têm nomes próprios para não substituir os tipos padrão. */
export const tiposDoDriver = {
  inteiro_seguro: { to: OID.INT8, from: [OID.INT8], serialize: (v) => String(v), parse: paraNumero },
  numerico: { to: OID.NUMERIC, from: [OID.NUMERIC], serialize: (v) => String(v), parse: numericoComoNumero },
  data_texto: { to: OID.DATE, from: [OID.DATE], serialize: (v) => v, parse: dataComoTexto },
  instante_iso: { to: OID.TIMESTAMPTZ, from: [OID.TIMESTAMPTZ], serialize: instanteParaBanco, parse: instanteComoIso },
};

/** Opção `parsers` do PGlite. */
export const parsersDoPglite = {
  [OID.INT8]: paraNumero,
  [OID.NUMERIC]: numericoComoNumero,
  [OID.DATE]: dataComoTexto,
  [OID.TIMESTAMPTZ]: instanteComoIso,
};
