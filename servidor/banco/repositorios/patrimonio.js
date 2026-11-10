import { calcularPatrimonio } from '../../dominio/patrimonio.js';
import { resumoDosCartoes } from './cartoes.js';
import { listarContas } from './contas.js';
import { resumoDeDividas } from './dividas.js';
import { resumoDeInvestimentos } from './investimentos.js';
import { resumoDeMoedas } from './moedas.js';

/**
 * Junta o que cada módulo informa e calcula o patrimônio (RF-21). Contas arquivadas ficam de fora, como no saldo
 * total do início, para não existirem dois "saldos" diferentes. Módulo sem dados não entra (RF-10).
 */
export async function calcularPatrimonioAtual(esc, hoje) {
  const contas = await listarContas(esc, { incluirArquivadas: false });
  const carteira = await resumoDeInvestimentos(esc);
  const cartoes = await resumoDosCartoes(esc, hoje);
  const dividas = await resumoDeDividas(esc, hoje);
  const moedas = await resumoDeMoedas(esc, hoje);
  return {
    carteira,
    moedas,
    patrimonio: {
      ...calcularPatrimonio({ contas, investimentos: carteira, cartoes, dividas, moedas }),
      contas: contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo_centavos: c.saldo_centavos })),
    },
  };
}
