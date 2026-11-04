// Única fonte de parse e format de dinheiro. Valores são sempre centavos inteiros.

const formatadorBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** 123456 -> "R$ 1.234,56" (com espaço sem quebra, como o Intl entrega). */
export function formatarDinheiro(centavos) {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError('centavos deve ser um inteiro seguro');
  }
  return formatadorBRL.format(centavos / 100);
}

/** 123456 -> "1234,56" (texto para campo de edição; sem float, sem símbolo, sem milhar). */
export function centavosParaCampo(centavos) {
  if (!Number.isSafeInteger(centavos)) throw new TypeError('centavos deve ser um inteiro seguro');
  const abs = Math.abs(centavos);
  const resto = String(abs % 100).padStart(2, '0');
  return `${centavos < 0 ? '-' : ''}${Math.trunc(abs / 100)},${resto}`;
}

/**
 * "R$ 1.234,56" | "1.234,56" | "1234,5" | "1234.56" | "-10" -> centavos inteiros.
 * Devolve null se o texto não for um valor válido.
 * Regra: com vírgula, ela é o decimal e o ponto é milhar. Sem vírgula, um único
 * ponto seguido de 1 ou 2 dígitos é decimal; fora disso, pontos são milhar (grupos de 3).
 */
export function parseDinheiro(texto) {
  if (typeof texto !== 'string') return null;
  let s = texto.replace(/\s/g, ''); // \s já cobre o espaço sem quebra do Intl
  let negativo = false;
  if (s.startsWith('-')) {
    negativo = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(/^R\$/i, '');
  if (s.startsWith('-') && !negativo) {
    negativo = true;
    s = s.slice(1);
  }
  if (s === '') return null;

  let inteiro;
  let fracao = '';
  if (s.includes(',')) {
    const partes = s.split(',');
    if (partes.length !== 2) return null;
    [inteiro, fracao] = partes;
    if (!/^\d{1,3}(\.\d{3})+$|^\d*$/.test(inteiro) || (inteiro === '' && fracao === '')) return null;
    inteiro = inteiro.replace(/\./g, '');
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [inteiro, fracao] = s.split('.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    inteiro = s.replace(/\./g, '');
  } else if (/^\d+$/.test(s)) {
    inteiro = s;
  } else {
    return null;
  }
  if (inteiro === '') inteiro = '0';
  if (!/^\d{0,2}$/.test(fracao)) return null;

  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo && centavos !== 0 ? -centavos : centavos;
}

/**
 * Divide total em n parcelas que somam exatamente total.
 * O resto de centavos vai para a primeira parcela.
 */
export function dividirEmParcelas(totalCentavos, n) {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos < 0) {
    throw new RangeError('total deve ser um inteiro não negativo');
  }
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n deve ser inteiro >= 1');
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}
