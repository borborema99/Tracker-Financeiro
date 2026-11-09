import { z } from 'zod';
import { centavos } from './comum.js';

// Seção 4 do escopo. A lista também está no CHECK da tabela `contas` (migration 010).
export const TIPOS_CONTA = /** @type {const} */ (['corrente', 'poupanca', 'carteira', 'investimento', 'digital', 'beneficio', 'outro']);

export const ROTULOS_TIPO_CONTA = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira (dinheiro)',
  investimento: 'Conta de investimento',
  digital: 'Conta digital ou de pagamento',
  beneficio: 'Vale-alimentação ou refeição',
  outro: 'Outra',
};

export const esquemaConta = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(60, 'Nome longo demais (máx. 60).'),
  tipo: z.enum(TIPOS_CONTA, 'Escolha o tipo da conta.'),
  saldo_inicial_centavos: centavos.default(0),
  arquivada: z.boolean().default(false),
});
