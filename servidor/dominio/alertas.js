// Alertas dentro do app: vencimento próximo, atraso, fechamento de fatura e saldo projetado negativo.
// Calculados na hora a partir dos dados; não há notificação nem estado guardado.
import { formatarDinheiro } from '../../contratos/dinheiro.js';
import { diasEntre } from './datas.js';
import { vencimentoEfetivo } from './compromisso.js';

export const DIAS_DE_AVISO = 3;

const ORDEM_NIVEL = { alta: 0, media: 1, info: 2 };
const dataBr = (iso) => iso.split('-').reverse().join('/');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const soma = (itens) => itens.reduce((s, i) => s + i.valor_centavos, 0);

/**
 * `compromissos`: pendentes { tipo, valor_centavos, data_vencimento, data_competencia };
 * `faturas`: { id, cartao_nome, referencia, data_fechamento, data_vencimento, total_centavos, saldo_centavos, status };
 * `projecao`: resultado de `projetarSaldo`;
 * `orcamento` (opcional): resultado de `montarOrcamento` do mês de hoje, ou null se não houver limites.
 */
export function montarAlertas({ hoje, compromissos, faturas, projecao, orcamento = null, diasAviso = DIAS_DE_AVISO }) {
  const alertas = [];
  const dias = (iso) => diasEntre(hoje, iso);
  const comVenc = compromissos.map((m) => ({ ...m, vencimento: vencimentoEfetivo(m) }));

  for (const [tipo, codigo, nivel, rotulo] of [
    ['despesa', 'atraso_pagar', 'alta', 'conta a pagar atrasada'],
    ['receita', 'atraso_receber', 'media', 'recebimento atrasado'],
  ]) {
    const itens = comVenc.filter((m) => m.tipo === tipo && m.vencimento < hoje);
    if (itens.length === 0) continue;
    alertas.push({
      codigo,
      nivel,
      titulo: plural(itens.length, rotulo, tipo === 'despesa' ? 'contas a pagar atrasadas' : 'recebimentos atrasados'),
      mensagem: `Total ${formatarDinheiro(soma(itens))}. O mais antigo venceu em ${dataBr(itens.map((i) => i.vencimento).sort()[0])}.`,
      link: `/compromissos?tipo=${tipo}&situacao=atrasada`,
    });
  }

  for (const [tipo, codigo, nivel, titulo] of [
    ['despesa', 'vencimento_proximo', 'media', 'Contas a pagar vencendo em breve'],
    ['receita', 'recebimento_proximo', 'info', 'Recebimentos previstos para os próximos dias'],
  ]) {
    const itens = comVenc.filter((m) => m.tipo === tipo && m.vencimento >= hoje && dias(m.vencimento) <= diasAviso);
    if (itens.length === 0) continue;
    alertas.push({
      codigo,
      nivel,
      titulo,
      mensagem: `${plural(itens.length, 'lançamento', 'lançamentos')} nos próximos ${diasAviso} dias, ${formatarDinheiro(soma(itens))}.`,
      link: `/compromissos?tipo=${tipo}&situacao=a_vencer`,
    });
  }

  for (const f of faturas) {
    const nome = `${f.cartao_nome} (${f.referencia})`;
    if (f.saldo_centavos > 0 && f.status === 'atrasada') {
      alertas.push({
        codigo: 'fatura_atrasada',
        nivel: 'alta',
        titulo: `Fatura atrasada: ${nome}`,
        mensagem: `Faltam ${formatarDinheiro(f.saldo_centavos)}; venceu em ${dataBr(f.data_vencimento)}.`,
        link: `/faturas/${f.id}`,
      });
    } else if (f.saldo_centavos > 0 && f.data_vencimento >= hoje && dias(f.data_vencimento) <= diasAviso) {
      alertas.push({
        codigo: 'fatura_vence_em_breve',
        nivel: 'media',
        titulo: `Fatura vence em breve: ${nome}`,
        mensagem: `Faltam ${formatarDinheiro(f.saldo_centavos)}; vence em ${dataBr(f.data_vencimento)}.`,
        link: `/faturas/${f.id}`,
      });
    }
    if (f.total_centavos > 0 && f.data_fechamento >= hoje && dias(f.data_fechamento) <= diasAviso) {
      alertas.push({
        codigo: 'fechamento_fatura',
        nivel: 'info',
        titulo: `Fatura fecha em breve: ${nome}`,
        mensagem: `Fecha em ${dataBr(f.data_fechamento)}; compras novas passam para a fatura seguinte.`,
        link: `/faturas/${f.id}`,
      });
    }
  }

  const negativo = projecao?.periodos_negativos?.[0];
  if (negativo) {
    alertas.push({
      codigo: 'saldo_negativo_projetado',
      nivel: 'alta',
      titulo: 'Saldo projetado negativo',
      mensagem: `A projeção de ${projecao.serie.length - 1} dias fica negativa a partir de ${dataBr(negativo.de)} (mínimo ${formatarDinheiro(negativo.minimo_centavos)}).`,
      link: '/fluxo',
    });
  }

  // Orçamento do mês (RF-11): a situação é calculada só do realizado; o previsto não dispara alerta de estouro.
  const estourados = orcamento?.itens.filter((i) => i.situacao === 'estourado') ?? [];
  if (estourados.length > 0) {
    alertas.push({
      codigo: 'orcamento_estourado',
      nivel: 'media',
      titulo: plural(estourados.length, 'orçamento estourado', 'orçamentos estourados'),
      mensagem: estourados.map((i) => `${i.nome} (${i.percentual}%)`).join(', ') + '.',
      link: '/orcamento',
    });
  }
  const emAtencao = orcamento?.itens.filter((i) => i.situacao === 'atencao') ?? [];
  if (emAtencao.length > 0) {
    alertas.push({
      codigo: 'orcamento_atencao',
      nivel: 'info',
      titulo: `${plural(emAtencao.length, 'orçamento', 'orçamentos')} perto do limite`,
      mensagem: emAtencao.map((i) => `${i.nome} (${i.percentual}%)`).join(', ') + '.',
      link: '/orcamento',
    });
  }

  return alertas.sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel]);
}
