// RF-26: leitura de extrato OFX (versões 1.x em SGML e 2.x em XML). Só leitura de texto: nada de rede, nada de
// executar o conteúdo. Valores em centavos inteiros, sem float. Funções puras.
import { createHash } from 'node:crypto';
import { ehDataValida } from '../../contratos/comum.js';

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodificarEntidades = (t) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, e) => {
    if (e[0] === '#') {
      const codigo = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(codigo) && codigo > 0 && codigo < 0x110000 ? String.fromCodePoint(codigo) : inteiro;
    }
    return ENTIDADES[e.toLowerCase()] ?? inteiro;
  });

/**
 * Texto do arquivo. O cabeçalho do OFX 1.x diz a codificação (`CHARSET:1252`); sem ele tenta UTF-8 e, se não for
 * UTF-8 válido, usa Windows-1252 (o que os bancos brasileiros costumam gerar).
 */
export function decodificarOfx(conteudo) {
  const cabecalho = conteudo.subarray(0, 800).toString('latin1');
  const charset = /CHARSET:\s*([\w-]+)/i.exec(cabecalho)?.[1]?.toUpperCase();
  const encoding = /ENCODING:\s*([\w-]+)/i.exec(cabecalho)?.[1]?.toUpperCase();
  const latim = new TextDecoder('windows-1252');
  if (charset === '1252' || charset === 'ISO-8859-1' || charset === 'LATIN1' || charset === 'WINDOWS-1252') {
    return latim.decode(conteudo);
  }
  if (charset === 'UTF-8' || charset === '65001' || encoding === 'UTF-8') {
    return new TextDecoder('utf-8').decode(conteudo);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(conteudo);
  } catch {
    return latim.decode(conteudo);
  }
}

/**
 * Valor do OFX em centavos, com sinal, ou null se for inválido. Aceita ponto ou vírgula decimal e separador de
 * milhar; recusa mais de duas casas decimais com valor (não existe meio centavo).
 */
export function parseValorOfx(texto) {
  const m = /^([+-]?)(\d[\d.,]*)$/.exec(String(texto ?? '').replace(/\s/g, ''));
  if (!m) return null;
  const [, sinal, t] = m;
  // Separador decimal: o último dos dois quando aparecem ambos; senão o único que aparece, uma só vez (OFX usa
  // ponto). Repetido sem o outro é milhar ("1.234.567"). "1.234" é decimal com 3 casas, logo recusado abaixo.
  const conta = (c) => t.split(c).length - 1;
  let decimal = null;
  if (conta('.') > 0 && conta(',') > 0) decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
  else if (conta('.') === 1) decimal = '.';
  else if (conta(',') === 1) decimal = ',';
  const pos = decimal ? t.lastIndexOf(decimal) : -1;
  const inteira = (pos === -1 ? t : t.slice(0, pos)).replace(/[.,]/g, '');
  const fracao = pos === -1 ? '' : t.slice(pos + 1);
  if (!/^\d+$/.test(inteira) || !/^\d*$/.test(fracao)) return null;
  if (fracao.length > 2 && /[1-9]/.test(fracao.slice(2))) return null;
  const centavos = Number(inteira) * 100 + Number(fracao.slice(0, 2).padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos)) return null;
  return sinal === '-' ? -centavos : centavos;
}

/** `20260610120000[-3:BRT]` -> `2026-06-10` (só a data; hora e fuso não importam para o lançamento). */
export function parseDataOfx(texto) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return ehDataValida(iso) ? iso : null;
}

function campo(bloco, nome) {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
  return m ? decodificarEntidades(m[1].trim()) : '';
}

const juntarDescricao = (nome, memo) => {
  const partes = [nome, memo].filter(Boolean);
  const unicas = partes.filter((p, i) => partes.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  const semRepeticao = unicas.filter((p, i) => !unicas.some((q, j) => j !== i && q.length > p.length && q.toLowerCase().includes(p.toLowerCase())));
  return semRepeticao.join(' - ').replace(/\s+/g, ' ').slice(0, 200);
};

/**
 * Lê o OFX e devolve `{ moeda, banco, conta, transacoes, invalidas }`. Cada transação: `{ fitid, data, valor_centavos,
 * descricao }` (valor com sinal). Sem FITID, a chave é derivada de data, valor, descrição e da ordem entre
 * idênticas, estável entre importações do mesmo arquivo. FITID repetido no arquivo e linha ilegível vão para
 * `invalidas`, com o motivo. Lança Error se não parecer OFX.
 */
export function lerOfx(texto) {
  const inicio = texto.search(/<OFX>/i);
  if (inicio === -1) throw new Error('O arquivo não parece ser um extrato OFX.');
  const corpo = texto.slice(inicio);

  const moeda = (/<CURDEF>\s*([A-Za-z]{3})/i.exec(corpo)?.[1] ?? 'BRL').toUpperCase();
  const banco = campo(corpo, 'BANKID');
  const conta = campo(corpo, 'ACCTID');

  const blocos = corpo
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|<\/CCSTMTRS>/i)[0]);

  const transacoes = [];
  const invalidas = [];
  const vistos = new Set();
  const ocorrencias = new Map();

  blocos.forEach((bloco, i) => {
    const indice = i + 1;
    const data = parseDataOfx(campo(bloco, 'DTPOSTED'));
    const valor = parseValorOfx(campo(bloco, 'TRNAMT'));
    if (!data) return invalidas.push({ indice, motivo: 'Data inválida.' });
    if (valor == null) return invalidas.push({ indice, motivo: 'Valor inválido.' });
    if (valor === 0) return invalidas.push({ indice, motivo: 'Valor zero.' });
    const descricao = juntarDescricao(campo(bloco, 'NAME'), campo(bloco, 'MEMO'));

    let fitid = campo(bloco, 'FITID');
    if (!fitid) {
      const base = `${data}|${valor}|${descricao}`;
      const n = (ocorrencias.get(base) ?? 0) + 1;
      ocorrencias.set(base, n);
      fitid = `sem-id:${createHash('sha1').update(base).digest('hex').slice(0, 16)}:${n}`;
    }
    if (vistos.has(fitid)) return invalidas.push({ indice, motivo: 'Transação repetida no arquivo (mesmo FITID).' });
    vistos.add(fitid);
    transacoes.push({ fitid, data, valor_centavos: valor, descricao });
  });

  return { moeda, banco, conta, transacoes, invalidas };
}
