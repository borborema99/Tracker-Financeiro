import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Carregando, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/Campo';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { diasDoMes, formatarData, hojeIso, nomeDoMes, somarMesesIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';

const GraficoFluxo = lazy(() => import('./GraficoFluxo'));

const PERIODOS = [
  { id: 'mes', rotulo: 'Este mês', meses: 1, atras: 0 },
  { id: 'passado', rotulo: 'Mês passado', meses: 1, atras: 1 },
  { id: 'trimestre', rotulo: 'Últimos 3 meses', meses: 3, atras: 0 },
  { id: 'ano', rotulo: 'Últimos 12 meses', meses: 12, atras: 0 },
] as const;

interface Intervalo {
  de: string;
  ate: string;
}

/** Meses cheios: só navegação de calendário para montar as datas da consulta; o cálculo é do servidor. */
function intervaloDoPreset(preset: (typeof PERIODOS)[number], hoje: string): Intervalo {
  const fim = somarMesesIso(hoje.slice(0, 7), -preset.atras);
  const inicio = somarMesesIso(fim, -(preset.meses - 1));
  return { de: `${inicio}-01`, ate: `${fim}-${String(diasDoMes(fim)).padStart(2, '0')}` };
}

const percentualBr = (n: number) => n.toLocaleString('pt-BR');

function Variacao({ percentual }: { percentual: number | null }) {
  if (percentual == null) return <span>sem base de comparação</span>;
  if (percentual === 0) return <span>igual ao período anterior</span>;
  return (
    <span>
      {percentual > 0 ? 'alta' : 'queda'} de {percentualBr(Math.abs(percentual))}% sobre o período anterior
    </span>
  );
}

const Titulo = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{children}</h2>
);

function Seletor<T extends string | number>({ opcoes, valor, aoMudar, rotulo }: { opcoes: readonly (readonly [T, string])[]; valor: T; aoMudar: (v: T) => void; rotulo: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={rotulo}>
      {opcoes.map(([id, nome]) => (
        <Button key={id} variant={id === valor ? 'default' : 'outline'} aria-pressed={id === valor} onClick={() => aoMudar(id)}>
          {nome}
        </Button>
      ))}
    </div>
  );
}

interface RespostaCategorias {
  total_centavos: number;
  total_anterior_centavos: number;
  variacao_percentual: number | null;
  periodo_anterior: Intervalo;
  itens: {
    categoria_id: number | null;
    nome: string;
    valor_centavos: number;
    anterior_centavos: number;
    percentual: number | null;
    variacao_percentual: number | null;
    subcategorias: { categoria_id: number; nome: string; valor_centavos: number }[];
  }[];
}

function PorCategoria({ periodo }: { periodo: Intervalo }) {
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const consulta = useQuery({
    queryKey: ['relatorios', 'categorias', periodo.de, periodo.ate, tipo],
    queryFn: () => api<RespostaCategorias>(`/relatorios/categorias?de=${periodo.de}&ate=${periodo.ate}&tipo=${tipo}`),
  });
  const sinal = tipo === 'despesa' ? 'saida' : 'entrada';

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo>{tipo === 'despesa' ? 'Despesas' : 'Receitas'} por categoria</Titulo>
        <Seletor
          rotulo="Tipo"
          valor={tipo}
          aoMudar={setTipo}
          opcoes={[
            ['despesa', 'Despesas'],
            ['receita', 'Receitas'],
          ]}
        />
      </div>
      {consulta.error ? <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      {!consulta.error && !consulta.data ? <Carregando /> : null}
      {consulta.data ? (
        <>
          <div className="max-w-xl space-y-1 rounded-lg border bg-card p-4">
            <h3 className="font-semibold">Total realizado</h3>
            <p className="font-display text-4xl font-black tracking-tight">
              <Valor centavos={consulta.data.total_centavos} tipo={sinal} />
            </p>
            <p className="text-sm text-muted-foreground">
              Período anterior ({formatarData(consulta.data.periodo_anterior.de)} a {formatarData(consulta.data.periodo_anterior.ate)}):{' '}
              <Valor centavos={consulta.data.total_anterior_centavos} />
            </p>
            <p className="text-sm text-muted-foreground">
              <Variacao percentual={consulta.data.variacao_percentual} />
            </p>
          </div>
          {consulta.data.itens.length === 0 ? (
            <Vazio titulo="Nenhum lançamento liquidado nesse período." />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {consulta.data.itens.map((i) => (
                <li key={i.categoria_id ?? 'sem'} className="space-y-2 rounded-lg border bg-card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong>{i.nome}</strong>
                    {i.percentual != null ? <span className="text-sm text-muted-foreground">{percentualBr(i.percentual)}%</span> : null}
                  </div>
                  <p>
                    <Valor centavos={i.valor_centavos} tipo={sinal} />
                  </p>
                  {i.percentual != null ? (
                    <progress className="medidor text-primary" max={100} value={i.percentual} aria-label={`${percentualBr(i.percentual)}% do total em ${i.nome}`} />
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    Antes: <Valor centavos={i.anterior_centavos} /> · <Variacao percentual={i.variacao_percentual} />
                  </p>
                  {i.subcategorias.length > 0 ? (
                    <ul className="divide-y border-t">
                      {i.subcategorias.map((s) => (
                        <li key={s.categoria_id} className="flex justify-between gap-3 py-1.5 text-sm">
                          <span>{s.nome}</span>
                          <Valor centavos={s.valor_centavos} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

interface RespostaMaiores {
  itens: { origem: string; data: string; descricao: string; valor_centavos: number; dividida: boolean; categoria_nome: string | null }[];
}

function MaioresDespesas({ periodo }: { periodo: Intervalo }) {
  const consulta = useQuery({
    queryKey: ['relatorios', 'maiores', periodo.de, periodo.ate],
    queryFn: () => api<RespostaMaiores>(`/relatorios/maiores-despesas?de=${periodo.de}&ate=${periodo.ate}&limite=10`),
  });
  return (
    <section className="space-y-3">
      <Titulo>Maiores despesas</Titulo>
      {consulta.error ? <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      {!consulta.error && !consulta.data ? <Carregando /> : null}
      {consulta.data ? (
        consulta.data.itens.length === 0 ? (
          <Vazio titulo="Nenhuma despesa liquidada nesse período." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card px-4">
            {consulta.data.itens.map((d, indice) => (
              <li key={`${d.origem}-${d.data}-${indice}`} className="py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <strong>{d.descricao || 'Sem descrição'}</strong>
                  <Valor centavos={d.valor_centavos} tipo="saida" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatarData(d.data)} · {d.dividida ? 'Várias categorias' : (d.categoria_nome ?? 'Sem categoria')}
                  {d.origem === 'cartao' ? ' · compra no cartão' : ''}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

interface RespostaEvolucao {
  meses: { mes: string; receitas: number; despesas: number; resultado: number }[];
  media: { meses_considerados: number; receitas_centavos: number; despesas_centavos: number; resultado_centavos: number } | null;
}

function Evolucao() {
  const [meses, setMeses] = useState(6);
  const consulta = useQuery({ queryKey: ['relatorios', 'evolucao', meses], queryFn: () => api<RespostaEvolucao>(`/relatorios/evolucao?meses=${meses}`) });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo>Evolução mês a mês</Titulo>
        <Seletor
          rotulo="Janela"
          valor={meses}
          aoMudar={setMeses}
          opcoes={[
            [6, '6 meses'],
            [12, '12 meses'],
          ]}
        />
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">Só o que foi liquidado, pela data de liquidação. Compras no cartão entram pela data da compra.</p>
      {consulta.error ? <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} /> : null}
      {!consulta.error && !consulta.data ? <Carregando /> : null}
      {consulta.data ? (
        <>
          {consulta.data.media ? (
            <div className="max-w-xl space-y-1 rounded-lg border bg-card p-4">
              <h3 className="font-semibold">Média por mês</h3>
              <p className="text-sm text-muted-foreground">
                Desde o primeiro mês com movimento ({consulta.data.media.meses_considerados} {consulta.data.media.meses_considerados === 1 ? 'mês' : 'meses'}).
              </p>
              <p className="flex justify-between">
                Receitas <Valor centavos={consulta.data.media.receitas_centavos} tipo="entrada" />
              </p>
              <p className="flex justify-between">
                Despesas <Valor centavos={consulta.data.media.despesas_centavos} tipo="saida" />
              </p>
              <p className="flex justify-between">
                Resultado <Valor centavos={consulta.data.media.resultado_centavos} />
              </p>
            </div>
          ) : (
            <Vazio titulo="Nenhum lançamento liquidado nesse período." />
          )}
          <Suspense fallback={<Carregando />}>
            <GraficoFluxo
              agrupar="mes"
              periodos={consulta.data.meses.map((m) => ({ periodo: m.mes, entradas_centavos: m.receitas, saidas_centavos: m.despesas, resultado_centavos: m.resultado }))}
            />
          </Suspense>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="p-3 font-semibold">Mês</th>
                  <th scope="col" className="p-3 text-right font-semibold">Receitas</th>
                  <th scope="col" className="p-3 text-right font-semibold">Despesas</th>
                  <th scope="col" className="p-3 text-right font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {[...consulta.data.meses].reverse().map((m) => (
                  <tr key={m.mes} className="border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-medium">{nomeDoMes(m.mes).replace(' de ', ' ')}</th>
                    <td className="p-3 text-right"><Valor centavos={m.receitas} tipo="entrada" /></td>
                    <td className="p-3 text-right"><Valor centavos={m.despesas} tipo="saida" /></td>
                    <td className="p-3 text-right"><Valor centavos={m.resultado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function Relatorios() {
  const { sessao } = useSessao();
  const hoje = hojeIso(sessao?.fuso);
  const [presetId, setPresetId] = useState<string>('mes');
  const [livre, setLivre] = useState<Partial<Intervalo> | null>(null);
  const personalizado = presetId === 'livre';
  const preset = PERIODOS.find((p) => p.id === presetId) ?? PERIODOS[0];
  const periodo: Intervalo = personalizado && livre?.de && livre?.ate && livre.de <= livre.ate ? { de: livre.de, ate: livre.ate } : intervaloDoPreset(preset, hoje);

  return (
    <Pagina titulo="Relatórios">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Os relatórios leem os mesmos números do Início: só o que já foi liquidado. Pagar fatura de cartão e transferir entre contas não são despesa.
      </p>

      <section className="space-y-3">
        <Titulo>Período</Titulo>
        <Seletor
          rotulo="Período"
          valor={presetId}
          aoMudar={(id) => {
            setPresetId(id);
            if (id === 'livre') setLivre((l) => l ?? intervaloDoPreset(PERIODOS[0], hoje));
          }}
          opcoes={[...PERIODOS.map((p) => [p.id, p.rotulo] as const), ['livre', 'Personalizado'] as const]}
        />
        {personalizado ? (
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Campo id="rel-de" rotulo="De">
              <Input id="rel-de" type="date" value={livre?.de ?? ''} onChange={(e) => setLivre({ ...livre, de: e.target.value })} />
            </Campo>
            <Campo id="rel-ate" rotulo="Até">
              <Input id="rel-ate" type="date" value={livre?.ate ?? ''} min={livre?.de} onChange={(e) => setLivre({ ...livre, ate: e.target.value })} />
            </Campo>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.de)} a {formatarData(periodo.ate)}
        </p>
      </section>

      <PorCategoria periodo={periodo} />
      <MaioresDespesas periodo={periodo} />
      <Evolucao />
    </Pagina>
  );
}
