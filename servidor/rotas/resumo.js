import { esquemaMes } from '../../contratos/movimentacoes.js';
import { movimentosDeCartaoDoPeriodo, resumoDosCartoes } from '../banco/repositorios/cartoes.js';
import { compromissosPendentes } from '../banco/repositorios/compromissos.js';
import { listarContas } from '../banco/repositorios/contas.js';
import { resumoDeAssinaturas } from '../banco/repositorios/assinaturas.js';
import { calcularPatrimonioAtual } from '../banco/repositorios/patrimonio.js';
import { resumoDeDividas } from '../banco/repositorios/dividas.js';
import { resumoDeMetas } from '../banco/repositorios/metas.js';
import { orcamentoSeExistir } from '../banco/repositorios/orcamentos.js';
import { totaisDeCompromissos } from '../dominio/compromisso.js';
import { movimentacoesDoPeriodo } from '../banco/repositorios/movimentacoes.js';
import { intervaloDoMes } from '../dominio/datas.js';
import { resumoDoPeriodo } from '../dominio/resumo.js';
import { garantirOcorrencias } from './util.js';

export async function rotasResumo(app) {
  const { db } = app;

  /**
   * Indicadores do mês (padrão: mês atual no fuso configurado). Saldos, realizado e previsto vêm
   * em blocos separados; não existe número que misture realizado com previsto.
   */
  app.get('/api/resumo', async (request) => {
    const { mes } = esquemaMes.parse(request.query);
    const { hoje } = garantirOcorrencias(db);
    const mesAlvo = mes ?? hoje.slice(0, 7);
    const periodo = intervaloDoMes(mesAlvo);
    const contas = listarContas(db, { incluirArquivadas: false });
    // RF-04: a compra no cartão é despesa realizada na data da compra; pagar fatura não entra aqui.
    const movimentos = [
      ...movimentacoesDoPeriodo(db, periodo.de, periodo.ate),
      ...movimentosDeCartaoDoPeriodo(db, periodo.de, periodo.ate),
    ];
    const cartoes = resumoDosCartoes(db, hoje);
    const aPagar = compromissosPendentes(db, 'despesa');
    const aReceber = compromissosPendentes(db, 'receita');
    const orcamento = orcamentoSeExistir(db, mesAlvo);
    const metas = resumoDeMetas(db, hoje);
    const dividas = resumoDeDividas(db, hoje);
    const assinaturas = resumoDeAssinaturas(db);
    const { carteira, patrimonio } = calcularPatrimonioAtual(db, hoje);
    return {
      mes: mesAlvo,
      periodo,
      saldos: {
        por_conta: contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo_centavos: c.saldo_centavos })),
        total_centavos: contas.reduce((soma, c) => soma + c.saldo_centavos, 0),
      },
      ...resumoDoPeriodo(movimentos, periodo),
      // Só aparece quando existe cartão: nada de zero falso (RF-10).
      ...(cartoes ? { cartoes } : {}),
      // Compromissos (RF-07): só aparece com algo pendente; "atrasado" é calculado contra hoje.
      ...(aPagar.length + aReceber.length > 0
        ? {
            compromissos: {
              a_pagar: totaisDeCompromissos(aPagar, hoje),
              a_receber: totaisDeCompromissos(aReceber, hoje),
            },
          }
        : {}),
      // Planejamento (RF-10): só aparece se existir limite em vigor no mês ou meta ainda aberta.
      ...(orcamento ? { orcamento: orcamento.totais } : {}),
      ...(metas ? { metas } : {}),
      ...(dividas ? { dividas } : {}),
      ...(assinaturas ? { assinaturas } : {}),
      // Fase 3 (RF-10): a carteira só vem com investimento em aberto; o patrimônio só quando há algo além das contas
      // (senão repetiria o saldo total).
      ...(carteira ? { investimentos: carteira } : {}),
      ...(carteira || cartoes || dividas
        ? { patrimonio: { patrimonio_liquido_centavos: patrimonio.patrimonio_liquido_centavos, ativos: patrimonio.ativos, passivos: patrimonio.passivos } }
        : {}),
    };
  });
}
