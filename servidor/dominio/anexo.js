// RF-25: anexos. O tipo vem dos primeiros bytes do arquivo, nunca do nome nem do Content-Type que o cliente declara.
// Funções puras.

const ASSINATURAS = [
  { tipo: 'application/pdf', confere: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-' },
  {
    tipo: 'image/png',
    confere: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { tipo: 'image/jpeg', confere: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    tipo: 'image/webp',
    confere: (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** Tipo permitido do conteúdo, ou null se não for PDF, PNG, JPEG nem WEBP. */
export function detectarTipo(conteudo) {
  if (!Buffer.isBuffer(conteudo)) return null;
  return ASSINATURAS.find((a) => a.confere(conteudo))?.tipo ?? null;
}

const EXTENSAO = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * Nome para guardar e mostrar: sem pasta, sem caractere de controle nem das que quebram cabeçalho ou caminho,
 * no máximo 120 caracteres, e com a extensão do tipo REAL (um PDF chamado "foto.png" vira "foto.pdf").
 */
export function nomeSeguro(nome, tipo) {
  const extensao = EXTENSAO[tipo] ?? 'bin';
  const base = String(nome ?? '')
    .split(/[\\/]/)
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .trim();
  const semExtensao = base.replace(/\.[^.]{1,8}$/, '').trim().slice(0, 110);
  return `${semExtensao || 'comprovante'}.${extensao}`;
}

/** Imagens abrem na tela; PDF sempre baixa (o visualizador do navegador não roda com a nossa política de segurança). */
export const abreNaTela = (tipo) => tipo.startsWith('image/');
