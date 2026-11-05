// CSV para planilha (Excel/LibreOffice em pt-BR): separador ";", quebra CRLF e valores com vírgula decimal.
// Texto digitado pelo usuário é neutralizado contra injeção de fórmula (CSV injection): uma célula que começa
// com = + - @ (ou tab/CR) ganha um apóstrofo na frente e a planilha a trata como texto.
import { centavosParaCampo } from '../../contratos/dinheiro.js';

const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

function escapar(texto) {
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** Texto livre: neutraliza fórmula e protege separadores. */
export function celulaTexto(valor) {
  if (valor == null) return '';
  const texto = String(valor);
  return escapar(INICIO_DE_FORMULA.test(texto) ? `'${texto}` : texto);
}

/** Dinheiro em centavos -> "1234,56" (número de verdade para a planilha; o sinal de menos é legítimo aqui). */
export const celulaDinheiro = (centavos) => (centavos == null ? '' : centavosParaCampo(centavos));

/** `colunas`: [{ titulo, valor: (linha) => ..., dinheiro?: true }]. Devolve o texto do CSV, sem BOM. */
export function montarCsv(colunas, linhas) {
  const cabecalho = colunas.map((c) => celulaTexto(c.titulo)).join(';');
  const corpo = linhas.map((linha) =>
    colunas.map((c) => (c.dinheiro ? celulaDinheiro(c.valor(linha)) : celulaTexto(c.valor(linha)))).join(';'),
  );
  return [cabecalho, ...corpo].join('\r\n') + '\r\n';
}
