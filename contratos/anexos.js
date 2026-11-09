import { z } from 'zod';
import './mensagens.js';

export const TAMANHO_MAXIMO_ANEXO = 5 * 1024 * 1024;
export const MAXIMO_DE_ANEXOS_POR_LANCAMENTO = 10;

/** Tipos aceitos. O servidor confere pelos primeiros bytes do arquivo, nunca pelo nome nem pelo tipo declarado. */
export const TIPOS_DE_ANEXO = /** @type {const} */ (['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
export const EXTENSOES_DE_ANEXO = '.pdf,.png,.jpg,.jpeg,.webp';

/** Nome original do arquivo, enviado no cabeçalho `x-nome-arquivo` (codificado com encodeURIComponent). */
export const esquemaNomeDoArquivo = z
  .string('Informe o nome do arquivo.')
  .trim()
  .min(1, 'Informe o nome do arquivo.')
  .max(300, 'Nome do arquivo longo demais.');
