// Datas das ocorrências de uma recorrência. Função pura: quem grava é o repositório.
import { somarDias } from './datas.js';

export const LIMITE_OCORRENCIAS = 500;

function somarMesesComDia(iso, meses) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const indice = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(indice / 12);
  const novoMes = (indice % 12) + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia); // 31 de janeiro -> 28/29 de fevereiro, e volta a 31 depois
  return `${novoAno}-${String(novoMes).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;
}

/** A i-ésima ocorrência (i = 0 é a data de início). Sempre calculada a partir do início, sem acumular erro. */
export function dataDaOcorrencia(inicio, frequencia, i) {
  switch (frequencia) {
    case 'semanal':
      return somarDias(inicio, 7 * i);
    case 'quinzenal':
      return somarDias(inicio, 14 * i);
    case 'mensal':
      return somarMesesComDia(inicio, i);
    case 'anual':
      return somarMesesComDia(inicio, 12 * i);
    default:
      throw new RangeError(`frequência desconhecida: ${frequencia}`);
  }
}

/** Datas de início até `ate` (inclusive), respeitando a data final da recorrência. */
export function ocorrenciasDaRecorrencia({ data_inicio: inicio, data_fim: fim, frequencia }, ate) {
  const limite = fim && fim < ate ? fim : ate;
  const datas = [];
  for (let i = 0; datas.length < LIMITE_OCORRENCIAS; i++) {
    const data = dataDaOcorrencia(inicio, frequencia, i);
    if (data > limite) break;
    datas.push(data);
  }
  return datas;
}
