import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Carregando, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { caminhoDoTracker } from '@/lib/caminhos';
import { useAlertas, useContas } from '@/lib/dados';
import { formatarData, nomeDoMes } from '@/lib/datas';
import { destinoExiste, MODULOS } from '../modulos';
import type { DiaProjetado } from './GraficoProjecao';

const GraficoProjecao = lazy(() => import('./GraficoProjecao'));

// Início: o servidor entrega o resumo pronto (GET /resumo). Aqui só se mostra. Um bloco aparece quando o servidor
// manda o dado e o módulo dele está no menu; sem dado ou sem tela, o bloco não existe (nada de zero falso nem de
// botão que não leva a lugar nenhum).

interface Compromissos {
  atrasado_centavos: number;
  vence_em_breve_centavos: number;
  depois_centavos: number;
}

interface Resumo {
  mes: string;
  saldos: { total_centavos: number; por_conta: { id: number; nome: string; saldo_centavos: number }[] };
  realizado: { receitas: number; despesas: number; resultado: number };
  previsto: { receitas: number; despesas: number };
  cartoes?: { faturas_nao_pagas_centavos: number; parcelas_futuras_centavos: number; limite_disponivel_centavos: number } | null;
  compromissos?: { a_pagar: Compromissos; a_receber: Compromissos } | null;
  orcamento?: { limite_centavos: number; realizado_centavos: number; restante_centavos: number; estourados: number } | null;
  metas?: { abertas: number; atrasadas: number; acumulado_centavos: number; alvo_centavos: number } | null;
  dividas?: { abertas: number; atrasadas: number; restante_centavos: number; atrasado_centavos: number } | null;
  assinaturas?: { ativas: number; mensal_centavos: number; anual_centavos: number } | null;
  investimentos?: { valor_atual_centavos: number; resultado_centavos: number | null } | null;
  moedas?: { com_cotacao: number; sem_cotacao: number; valor_brl_centavos: number } | null;
  patrimonio?: { patrimonio_liquido_centavos: number } | null;
}

const temModulo = (caminho: string) => MODULOS.some((m) => m.caminho === caminho);

const Cartao = ({ titulo, nota, children, link }: { titulo: string; nota?: string; children: ReactNode; link?: { para: string; texto: string } }) => (
  <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
    <h3 className="font-display text-xl font-extrabold tracking-wide uppercase">{titulo}</h3>
    {nota ? <p className="text-sm text-muted-foreground">{nota}</p> : null}
    {children}
    {link ? (
      <div className="pt-2">
        <Button asChild variant="outline">
          <Link to={link.para}>{link.texto}</Link>
        </Button>
      </div>
    ) : null}
  </div>
);

const Linha = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <p className="flex justify-between gap-3">
    <span>{rotulo}</span>
    {children}
  </p>
);

const Secao = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section className="space-y-3">
    <h2 className="font-display text-3xl font-extrabold tracking-wide uppercase">{titulo}</h2>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  </section>
);

/** Os alertas mais importantes; a lista completa fica em Alertas. */
function AlertasEmDestaque() {
  const { data } = useAlertas();
  if (!data || data.total === 0) return null;
  const topo = data.alertas.slice(0, 3);
  return (
    <section role="status" className="space-y-2 rounded-lg border-2 border-saida bg-card p-4">
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Alertas</h2>
      <ul className="space-y-2">
        {topo.map((a) => (
          <li key={`${a.codigo}-${a.link}`}>
            {destinoExiste(a.link) ? (
              <Link className="underline underline-offset-4" to={caminhoDoTracker(a.link)}>
                <strong>{a.titulo}</strong>
              </Link>
            ) : (
              <strong>{a.titulo}</strong>
            )}
            <p className="text-sm text-muted-foreground">{a.mensagem}</p>
          </li>
        ))}
      </ul>
      {data.total > topo.length ? (
        <Button asChild variant="outline">
          <Link to="/app/alertas">Ver todos ({data.total})</Link>
        </Button>
      ) : null}
    </section>
  );
}

/** Projeção de 30 dias; fica de fora quando o servidor não traz série (nada a projetar). */
function Projecao() {
  const projecao = useQuery({
    queryKey: ['projecao-saldo', 30],
    queryFn: () =>
      api<{ saldo_minimo: { data: string; centavos: number }; saldo_final_centavos: number; serie: DiaProjetado[] }>(
        '/fluxo/projecao?dias=30',
      ),
  });
  const p = projecao.data;
  const ultimo = p?.serie.at(-1);
  if (!p || !ultimo) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-3xl font-extrabold tracking-wide uppercase">Próximos 30 dias</h2>
      <div className="max-w-3xl space-y-3 rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Saldo projetado: saldo de hoje + compromissos pendentes + faturas em aberto.</p>
        <Linha rotulo={`Menor saldo (em ${formatarData(p.saldo_minimo.data)})`}>
          <Valor centavos={p.saldo_minimo.centavos} />
        </Linha>
        <Linha rotulo={`Saldo em ${formatarData(ultimo.data)}`}>
          <Valor centavos={p.saldo_final_centavos} />
        </Linha>
        <Suspense fallback={<Carregando />}>
          <GraficoProjecao serie={p.serie} />
        </Suspense>
        <Button asChild variant="outline">
          <Link to="/app/fluxo?aba=projecao">Ver fluxo de caixa</Link>
        </Button>
      </div>
    </section>
  );
}

export default function Inicio() {
  const contas = useContas();
  const resumo = useQuery({ queryKey: ['resumo'], queryFn: () => api<Resumo>('/resumo') });

  const erro = contas.error ?? resumo.error;
  if (erro) return <ErroDeTela erro={erro} aoTentar={() => void resumo.refetch()} />;
  if (!contas.data || !resumo.data) return <Carregando />;

  if (contas.data.itens.length === 0) {
    return (
      <Pagina titulo="Início">
        <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
          <p className="font-medium">Comece criando sua primeira conta.</p>
          <p className="text-sm text-muted-foreground">Os saldos e o resumo do mês aparecem aqui assim que houver lançamentos.</p>
          <Button asChild>
            <Link to="/app/contas">Criar conta</Link>
          </Button>
        </div>
      </Pagina>
    );
  }

  const { saldos, realizado, previsto, mes, cartoes, compromissos, orcamento, metas, dividas, assinaturas, investimentos, moedas, patrimonio } = resumo.data;
  const planejamento = [temModulo('orcamento') && orcamento, temModulo('metas') && metas, temModulo('dividas') && dividas, temModulo('assinaturas') && assinaturas].some(Boolean);
  const patrimonial = [temModulo('patrimonio') && patrimonio, temModulo('investimentos') && investimentos, temModulo('moedas') && moedas].some(Boolean);

  return (
    <Pagina titulo="Início">
      <AlertasEmDestaque />

      <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Saldo total</h2>
        <p className="font-display text-5xl font-black tracking-tight">
          <Valor centavos={saldos.total_centavos} />
        </p>
        <ul className="divide-y">
          {saldos.por_conta.map((c) => (
            <li key={c.id} className="flex justify-between gap-3 py-2">
              <span>{c.nome}</span>
              <Valor centavos={c.saldo_centavos} />
            </li>
          ))}
        </ul>
      </div>

      <Secao titulo={nomeDoMes(mes)}>
        <Cartao titulo="Realizado" nota="Só o que já foi liquidado">
          <Linha rotulo="Receitas"><Valor centavos={realizado.receitas} tipo="entrada" /></Linha>
          <Linha rotulo="Despesas"><Valor centavos={realizado.despesas} tipo="saida" /></Linha>
          <Linha rotulo="Resultado"><Valor centavos={realizado.resultado} className="font-semibold" /></Linha>
        </Cartao>
        <Cartao titulo="Previsto" nota="Pendente, ainda não liquidado">
          <Linha rotulo="A receber"><Valor centavos={previsto.receitas} tipo="entrada" /></Linha>
          <Linha rotulo="A pagar"><Valor centavos={previsto.despesas} tipo="saida" /></Linha>
        </Cartao>
      </Secao>

      {compromissos ? (
        <Secao titulo="Compromissos">
          {([['a_pagar', 'A pagar', 'saida', ''], ['a_receber', 'A receber', 'entrada', '?tipo=receita']] as const).map(([chave, titulo, tipo, busca]) => (
            <Cartao key={chave} titulo={titulo} nota="Pendente, ainda não liquidado" link={{ para: `/app/compromissos${busca}`, texto: `Ver ${titulo.toLowerCase()}` }}>
              <Linha rotulo="Atrasado"><Valor centavos={compromissos[chave].atrasado_centavos} tipo={tipo} /></Linha>
              <Linha rotulo="Próximos 7 dias"><Valor centavos={compromissos[chave].vence_em_breve_centavos} /></Linha>
              <Linha rotulo="Depois"><Valor centavos={compromissos[chave].depois_centavos} /></Linha>
            </Cartao>
          ))}
        </Secao>
      ) : null}

      {planejamento ? (
        <Secao titulo="Planejamento">
          {temModulo('orcamento') && orcamento ? (
            <Cartao titulo={`Orçamento de ${nomeDoMes(mes)}`} link={{ para: '/app/orcamento', texto: 'Ver orçamento' }}>
              <Linha rotulo="Limites"><Valor centavos={orcamento.limite_centavos} /></Linha>
              <Linha rotulo="Gasto"><Valor centavos={orcamento.realizado_centavos} tipo="saida" /></Linha>
              <Linha rotulo={orcamento.restante_centavos >= 0 ? 'Resta' : 'Passou'}><Valor centavos={Math.abs(orcamento.restante_centavos)} /></Linha>
              {orcamento.estourados > 0 ? <p className="text-sm text-muted-foreground">{orcamento.estourados} categoria(s) acima do limite.</p> : null}
            </Cartao>
          ) : null}
          {temModulo('metas') && metas ? (
            <Cartao titulo="Metas" link={{ para: '/app/metas', texto: 'Ver metas' }}>
              <p>{metas.abertas} em aberto{metas.atrasadas > 0 ? `, ${metas.atrasadas} com prazo vencido` : ''}</p>
              <Linha rotulo="Guardado"><Valor centavos={metas.acumulado_centavos} tipo="entrada" /></Linha>
              <Linha rotulo="Alvo"><Valor centavos={metas.alvo_centavos} /></Linha>
            </Cartao>
          ) : null}
          {temModulo('dividas') && dividas ? (
            <Cartao titulo="Dívidas" link={{ para: '/app/dividas', texto: 'Ver dívidas' }}>
              <p>{dividas.abertas} em aberto{dividas.atrasadas > 0 ? `, ${dividas.atrasadas} em atraso` : ''}</p>
              <Linha rotulo="Falta pagar"><Valor centavos={dividas.restante_centavos} tipo="saida" /></Linha>
              {dividas.atrasado_centavos > 0 ? <Linha rotulo="Em atraso"><Valor centavos={dividas.atrasado_centavos} tipo="saida" /></Linha> : null}
            </Cartao>
          ) : null}
          {temModulo('assinaturas') && assinaturas ? (
            <Cartao titulo="Assinaturas" link={{ para: '/app/assinaturas', texto: 'Ver assinaturas' }}>
              <p>{assinaturas.ativas} {assinaturas.ativas === 1 ? 'ativa' : 'ativas'}</p>
              <Linha rotulo="Por mês"><Valor centavos={assinaturas.mensal_centavos} tipo="saida" /></Linha>
              <Linha rotulo="Por ano"><Valor centavos={assinaturas.anual_centavos} tipo="saida" /></Linha>
            </Cartao>
          ) : null}
        </Secao>
      ) : null}

      {patrimonial ? (
        <Secao titulo="Patrimônio">
          {temModulo('patrimonio') && patrimonio ? (
            <Cartao titulo="Patrimônio líquido" nota="Contas, investimentos e moedas menos cartões e dívidas" link={{ para: '/app/patrimonio', texto: 'Ver patrimônio' }}>
              <p className="font-display text-4xl font-black"><Valor centavos={patrimonio.patrimonio_liquido_centavos} /></p>
            </Cartao>
          ) : null}
          {temModulo('investimentos') && investimentos ? (
            <Cartao titulo="Investimentos" link={{ para: '/app/investimentos', texto: 'Ver investimentos' }}>
              <Linha rotulo="Vale hoje"><Valor centavos={investimentos.valor_atual_centavos} /></Linha>
              {investimentos.resultado_centavos != null ? (
                <Linha rotulo="Resultado">
                  <Valor centavos={investimentos.resultado_centavos} tipo={investimentos.resultado_centavos >= 0 ? 'entrada' : 'saida'} />
                </Linha>
              ) : null}
            </Cartao>
          ) : null}
          {temModulo('moedas') && moedas ? (
            <Cartao titulo="Moedas" link={{ para: '/app/moedas', texto: 'Ver moedas' }}>
              {moedas.com_cotacao > 0 ? <Linha rotulo="Em reais"><Valor centavos={moedas.valor_brl_centavos} /></Linha> : null}
              {moedas.sem_cotacao > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {moedas.sem_cotacao} {moedas.sem_cotacao === 1 ? 'conta sem cotação' : 'contas sem cotação'}: informe a cotação para ver em reais.
                </p>
              ) : null}
            </Cartao>
          ) : null}
        </Secao>
      ) : null}

      {compromissos || cartoes ? <Projecao /> : null}

      {cartoes && temModulo('cartoes') ? (
        <Secao titulo="Cartões">
          <Cartao titulo="Faturas e limite" nota="As despesas realizadas acima incluem as compras no cartão, pela data da compra." link={{ para: '/app/cartoes', texto: 'Ver cartões' }}>
            <Linha rotulo="Faturas não pagas"><Valor centavos={cartoes.faturas_nao_pagas_centavos} tipo="saida" /></Linha>
            <Linha rotulo="Parcelas futuras"><Valor centavos={cartoes.parcelas_futuras_centavos} tipo="saida" /></Linha>
            <Linha rotulo="Limite disponível"><Valor centavos={cartoes.limite_disponivel_centavos} /></Linha>
          </Cartao>
        </Secao>
      ) : null}
    </Pagina>
  );
}
