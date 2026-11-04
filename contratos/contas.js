import { z } from 'zod';
import { centavos } from './comum.js';

// Padrão a confirmar contra o escopo original (seção 4). Ver docs/adr/003-padroes-onda-1.md.
export const TIPOS_CONTA = ['corrente', 'poupanca', 'carteira', 'investimento'];

export const ROTULOS_TIPO_CONTA = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira (dinheiro)',
  investimento: 'Conta de investimento',
};

export const esquemaConta = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(60, 'Nome longo demais (máx. 60).'),
  tipo: z.enum(TIPOS_CONTA, 'Escolha o tipo da conta.'),
  saldo_inicial_centavos: centavos.default(0),
  arquivada: z.boolean().default(false),
});
