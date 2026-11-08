import { calcularPatrimonio } from '../../dominio/patrimonio.js';
import { resumoDosCartoes } from './cartoes.js';
import { listarContas } from './contas.js';
import { resumoDeDividas } from './dividas.js';
import { resumoDeInvestimentos } from './investimentos.js';

/**
 * Junta o que cada módulo informa e calcula o patrimônio (RF-21). Contas arquivadas ficam de fora, como no saldo
 * total do início, para não existirem dois "saldos" diferentes. Módulo sem dados não entra (RF-10).
 */
export function calcularPatrimonioAtual(db, hoje) {
  const contas = listarContas(db, { incluirArquivadas: false });
  const carteira = resumoDeInvestimentos(db);
  const cartoes = resumoDosCartoes(db, hoje);
  const dividas = resumoDeDividas(db, hoje);
  return {
    carteira,
    patrimonio: {
      ...calcularPatrimonio({ contas, investimentos: carteira, cartoes, dividas }),
      contas: contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo_centavos: c.saldo_centavos })),
    },
  };
}
