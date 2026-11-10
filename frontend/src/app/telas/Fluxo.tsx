import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AGRUPAMENTOS, HORIZONTES, ROTULOS_AGRUPAMENTO } from '../../../../contratos/fluxo.js';
import { Campo } from '@/components/Campo';
import { Carregando, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { diaDaSemana, diasDoMes, formatarData, hojeIso, nomeDoMes, rotuloDoPeriodo, somarMesesIso, type Agrupamento } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';
import type { PeriodoDoFluxo } from './GraficoFluxo';
import type { DiaProjetado } from './GraficoProjecao';

const GraficoFluxo = lazy(() => import('./GraficoFluxo'));
const GraficoProjecao = lazy(() => import('./GraficoProjecao'));

const ABAS = [
  ['realizado', 'Realizado'],
  ['projecao', 'Projeção'],
  ['calendario', 'Calendário'],
] as const;
type Aba = (typeof ABAS)[number][0];

const Painel = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-1 rounded-lg border bg-card p-4">{children}</div>
);
const Linha = ({ rotulo, children, forte }: { rotulo: string; children: React.ReactNode; forte?: boolean }) => (
  <p className={`flex justify-between gap-3 ${forte ? 'font-semibold' : ''}`}>
    <span>{rotulo}</span>
    {children}
  </p>
);

function Realizado({ fuso }: { fuso: string | undefined }) {
  const hoje = hojeIso(fuso);
  const [agrupar, setAgrupar] = useState<Agrupamento>('mes');
  const [de, setDe] = useState(`${hoje.slice(0, 4)}-01-01`);
  const [ate, setAte] = useState(hoje);
  const valido = Boolean(de && ate && de <= ate);
  const consulta = useQuery({
    queryKey: ['fluxo', de, ate, agrupar],
    queryFn: () =>
      api<{
        totais: { entradas_centavos: number; saidas_centavos: number; resultado_centavos: number };
        periodos: PeriodoDoFluxo[];
      }>(`/fluxo?${new URLSearchParams({ de, ate, agrupar })}`),
    enabled: valido,
    placeholderData: (anterior) => anterior,
  });

  return (
    <>
      <p className="max-w-2xl text-sm text-muted-foreground">
        O que de fato entrou e saiu das contas (só liquidado). Compra no cartão só aparece quando a fatura é paga. Transferência
        entre suas contas não conta.
      </p>
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <Campo id="fluxo-agrupar" rotulo="Agrupar por">
          <Select id="fluxo-agrupar" value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupamento)}>
            {AGRUPAMENTOS.map((a) => (
              <option key={a} value={a}>
                {ROTULOS_AGRUPAMENTO[a]}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="fluxo-de" rotulo="De">
          <Input id="fluxo-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo id="fluxo-ate" rotulo="Até">
          <Input id="fluxo-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        {!valido ? (
          <p role="alert" className="text-sm font-medium text-destructive sm:col-span-3">
            A data final não pode ser antes da inicial.
          </p>
        ) : null}
      </div>

      {consulta.error ? <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      {consulta.isPending && valido ? <Carregando /> : null}
      {consulta.data && valido ? (
        <>
          <div className="max-w-xl">
            <Painel>
              <Linha rotulo="Entradas">
                <Valor centavos={consulta.data.totais.entradas_centavos} tipo="entrada" />
              </Linha>
              <Linha rotulo="Saídas">
                <Valor centavos={consulta.data.totais.saidas_centavos} tipo="saida" />
              </Linha>
              <Linha rotulo="Resultado" forte>
                <Valor centavos={consulta.data.totais.resultado_centavos} />
              </Linha>
            </Painel>
          </div>
          {consulta.data.periodos.length === 0 ? (
            <p className="rounded-lg border bg-card p-4">Nada liquidado neste período.</p>
          ) : (
            <>
              <div className="rounded-lg border bg-card p-4">
                <Suspense fallback={<Carregando />}>
                  <GraficoFluxo periodos={consulta.data.periodos} agrupar={agrupar} />
                </Suspense>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">Período</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Entradas</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Saídas</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.periodos.map((p) => (
                    <tr key={p.periodo} className="border-b">
                      <td className="px-3 py-3">{rotuloDoPeriodo(p.periodo, agrupar)}</td>
                      <td className="px-3 py-3 text-right"><Valor centavos={p.entradas_centavos} tipo="entrada" /></td>
                      <td className="px-3 py-3 text-right"><Valor centavos={p.saidas_centavos} tipo="saida" /></td>
                      <td className="px-3 py-3 text-right"><Valor centavos={p.resultado_centavos} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : null}
    </>
  );
}

interface Projecao {
  saldo_inicial_centavos: number;
  saldo_final_centavos: number;
  saldo_minimo: { data: string; centavos: number };
  atrasados: { saidas_centavos: number; entradas_centavos: number };
  periodos_negativos: { de: string; ate: string; minimo_centavos: number }[];
  serie: DiaProjetado[];
}

function ProjecaoDeSaldo() {
  const [dias, setDias] = useState<number>(30);
  const consulta = useQuery({
    queryKey: ['projecao-saldo', dias],
    queryFn: () => api<Projecao>(`/fluxo/projecao?dias=${dias}`),
    placeholderData: (anterior) => anterior,
  });
  const p = consulta.data;
  const diasComMovimento = p?.serie.filter((d) => d.entradas_centavos > 0 || d.saidas_centavos > 0) ?? [];
  const ultimo = p?.serie.at(-1);

  return (
    <>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Previsão do saldo total das contas: parte do saldo de hoje e aplica compromissos pendentes e faturas de cartão em aberto, no
        dia do vencimento. O que já venceu e não foi baixado pesa em hoje.
      </p>
      <div role="group" aria-label="Horizonte" className="flex flex-wrap gap-2">
        {HORIZONTES.map((h) => (
          <Button key={h} type="button" variant={dias === h ? 'default' : 'outline'} aria-pressed={dias === h} onClick={() => setDias(h)}>
            {h} dias
          </Button>
        ))}
      </div>
      {consulta.error ? <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      {consulta.isPending ? <Carregando /> : null}
      {p && ultimo ? (
        <>
          <div className="max-w-xl">
            <Painel>
              <Linha rotulo="Saldo hoje">
                <Valor centavos={p.saldo_inicial_centavos} />
              </Linha>
              <Linha rotulo={`Menor saldo (em ${formatarData(p.saldo_minimo.data)})`}>
                <Valor centavos={p.saldo_minimo.centavos} />
              </Linha>
              <Linha rotulo={`Saldo em ${formatarData(ultimo.data)}`} forte>
                <Valor centavos={p.saldo_final_centavos} />
              </Linha>
              {p.atrasados.saidas_centavos > 0 || p.atrasados.entradas_centavos > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Já considerando atrasados: a pagar <Valor centavos={p.atrasados.saidas_centavos} tipo="saida" /> · a receber{' '}
                  <Valor centavos={p.atrasados.entradas_centavos} tipo="entrada" />
                </p>
              ) : null}
            </Painel>
          </div>

          {p.periodos_negativos.length > 0 ? (
            <div role="status" className="max-w-xl space-y-2 rounded-lg border-2 border-saida bg-card p-4">
              <strong>Saldo projetado negativo</strong>
              <ul className="space-y-1 text-sm">
                {p.periodos_negativos.map((n) => (
                  <li key={n.de}>
                    {n.de === n.ate ? formatarData(n.de) : `${formatarData(n.de)} a ${formatarData(n.ate)}`}: chega a{' '}
                    <Valor centavos={n.minimo_centavos} tipo="saida" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border bg-card p-4">
            <Suspense fallback={<Carregando />}>
              <GraficoProjecao serie={p.serie} />
            </Suspense>
          </div>

          <details className="max-w-xl rounded-lg border bg-card px-4 py-2">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">Dias com movimento previsto</summary>
            {diasComMovimento.length === 0 ? (
              <p className="pb-2 text-muted-foreground">Nada previsto neste período.</p>
            ) : (
              <ul className="divide-y pb-2">
                {diasComMovimento.map((d) => (
                  <li key={d.data} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                    <span>{formatarData(d.data)}</span>
                    <span className="space-x-2">
                      {d.entradas_centavos > 0 ? <Valor centavos={d.entradas_centavos} tipo="entrada" /> : null}
                      {d.saidas_centavos > 0 ? <Valor centavos={d.saidas_centavos} tipo="saida" /> : null}
                      <span className="text-muted-foreground">saldo</span> <Valor centavos={d.saldo_centavos} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </>
      ) : null}
    </>
  );
}

const ROTULOS_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// Classes estáticas (o Tailwind só gera o que aparece escrito): onde cai o dia 1 na grade de 7 colunas.
const COLUNA_INICIAL = ['col-start-1', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7'];

interface ItemDoDia {
  tipo: 'despesa' | 'receita' | 'fatura';
  id: number;
  descricao: string;
  valor_centavos: number;
  situacao: string;
}

function Calendario({ fuso }: { fuso: string | undefined }) {
  const hoje = hojeIso(fuso);
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: ['calendario', mes],
    queryFn: () => api<{ dias: { data: string; itens: ItemDoDia[] }[] }>(`/calendario?mes=${mes}`),
    placeholderData: (anterior) => anterior,
  });
  const porDia = new Map((consulta.data?.dias ?? []).map((d) => [d.data, d]));
  const dias = Array.from({ length: diasDoMes(mes) }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
  const escolha = escolhido?.startsWith(mes) ? porDia.get(escolhido) : undefined;

  return (
    <>
      <p className="max-w-2xl text-sm text-muted-foreground">Vencimentos do mês: compromissos pendentes e faturas de cartão em aberto.</p>
      <div className="flex max-w-xl items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => setMes(somarMesesIso(mes, -1))} aria-label="Mês anterior">
          ‹
        </Button>
        <strong className="font-display text-2xl tracking-wide uppercase">{nomeDoMes(mes)}</strong>
        <Button variant="outline" size="icon" onClick={() => setMes(somarMesesIso(mes, 1))} aria-label="Próximo mês">
          ›
        </Button>
      </div>
      {consulta.error ? <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      <div role="group" aria-label={`Calendário de ${nomeDoMes(mes)}`} className="grid max-w-xl grid-cols-7 gap-1">
        {ROTULOS_DIA.map((r) => (
          <span key={r} className="text-center text-xs text-muted-foreground">{r}</span>
        ))}
        {dias.map((data, i) => {
          const d = porDia.get(data);
          const atrasado = d?.itens.some((x) => x.situacao === 'atrasada');
          const n = d?.itens.length ?? 0;
          return (
            <button
              key={data}
              type="button"
              onClick={() => setEscolhido(data)}
              aria-pressed={escolhido === data}
              aria-label={`${formatarData(data)}${d ? `: ${n} ${n === 1 ? 'item' : 'itens'}` : ''}`}
              className={[
                'relative flex min-h-11 flex-col items-center justify-center rounded-md border text-sm',
                i === 0 ? (COLUNA_INICIAL[diaDaSemana(data)] ?? '') : '',
                data === hoje ? 'border-2 border-foreground font-bold' : '',
                d ? 'bg-muted' : '',
                atrasado ? 'text-saida' : '',
                escolhido === data ? 'bg-primary text-primary-foreground' : '',
              ].join(' ')}
            >
              <span>{i + 1}</span>
              {d ? <span aria-hidden="true" className="text-[0.65rem] leading-none">{n}</span> : null}
            </button>
          );
        })}
      </div>

      {escolhido?.startsWith(mes) ? (
        <div className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{formatarData(escolhido)}</h2>
          {!escolha ? (
            <p className="text-muted-foreground">Nada vence neste dia.</p>
          ) : (
            <ul className="divide-y">
              {escolha.itens.map((item) => (
                <li key={`${item.tipo}-${item.id}`} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <Link
                      className="underline underline-offset-4"
                      to={item.tipo === 'fatura' ? `/app/faturas/${item.id}` : `/app/lancamentos/${item.id}`}
                    >
                      <strong>{item.descricao || (item.tipo === 'receita' ? 'Receita' : 'Despesa')}</strong>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {item.tipo === 'fatura' ? 'Fatura de cartão' : item.tipo === 'receita' ? 'A receber' : 'A pagar'}
                      {item.situacao === 'atrasada' ? (
                        <span className="ml-1 rounded-sm bg-saida px-1.5 py-0.5 text-xs font-medium text-background">Atrasada</span>
                      ) : null}
                    </p>
                  </div>
                  <Valor centavos={item.valor_centavos} tipo={item.tipo === 'receita' ? 'entrada' : 'saida'} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}

export default function Fluxo() {
  const [params, setParams] = useSearchParams();
  const { sessao } = useSessao();
  const pedida = params.get('aba');
  const aba: Aba = ABAS.find(([k]) => k === pedida)?.[0] ?? 'realizado';

  return (
    <Pagina titulo="Fluxo de caixa">
      <div role="group" aria-label="Visão" className="flex flex-wrap gap-2">
        {ABAS.map(([k, rotulo]) => (
          <Button
            key={k}
            type="button"
            variant={aba === k ? 'default' : 'outline'}
            aria-pressed={aba === k}
            onClick={() => setParams(k === 'realizado' ? {} : { aba: k })}
          >
            {rotulo}
          </Button>
        ))}
      </div>
      {aba === 'realizado' ? <Realizado fuso={sessao?.fuso} /> : null}
      {aba === 'projecao' ? <ProjecaoDeSaldo /> : null}
      {aba === 'calendario' ? <Calendario fuso={sessao?.fuso} /> : null}
    </Pagina>
  );
}
