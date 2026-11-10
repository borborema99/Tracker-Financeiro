import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROTULOS_SITUACAO } from '../../../../contratos/compromissos.js';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import { porId, useContas, useInvalidarDados, type Conta } from '@/lib/dados';
import { formatarData, hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';

type Tipo = 'despesa' | 'receita';
type Situacao = 'atrasada' | 'a_vencer';

interface Compromisso {
  id: number;
  tipo: Tipo;
  descricao: string;
  valor_centavos: number;
  conta_id: number;
  vencimento: string;
  situacao: Situacao;
  dias_de_atraso: number;
  recorrente: boolean;
  baixa_de_id: number | null;
}

interface Resposta {
  itens: Compromisso[];
  total: number;
  por_pagina: number;
  totais: { atrasado_centavos: number; vence_em_breve_centavos: number; depois_centavos: number; total_centavos: number };
}

const TEXTOS = {
  despesa: { aba: 'A pagar', baixa: 'Dar baixa (paguei)', parcial: 'Pagar parte', campo: 'Valor pago', vazio: 'Nenhuma conta a pagar.' },
  receita: { aba: 'A receber', baixa: 'Dar baixa (recebi)', parcial: 'Receber parte', campo: 'Valor recebido', vazio: 'Nenhum recebimento pendente.' },
} as const;

type Textos = (typeof TEXTOS)[Tipo];

const camposDe = (erro: Error | null) => (erro instanceof ErroApi ? (erro.campos ?? {}) : {});
const mensagemGeral = (erro: Error | null) => (erro && !(erro instanceof ErroApi && erro.campos) ? erro.message : null);

function BaixaParcial({ item, textos, fuso, aoFechar }: { item: Compromisso; textos: Textos; fuso: string | undefined; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState<number | null>(item.valor_centavos);
  const [data, setData] = useState(hojeIso(fuso));
  const baixar = useMutation({
    mutationFn: () =>
      api(`/compromissos/${item.id}/baixa-parcial`, {
        metodo: 'POST',
        corpo: { valor_centavos: valor ?? 0, data_liquidacao: data },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = camposDe(baixar.error);
  const geral = mensagemGeral(baixar.error);
  return (
    <form
      noValidate
      className="space-y-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        baixar.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        O que sobrar continua pendente, com o mesmo vencimento. Informe o valor inteiro para dar baixa completa.
      </p>
      <CampoValor
        id={`baixa-valor-${item.id}`}
        rotulo={textos.campo}
        inicial={item.valor_centavos}
        aoMudar={setValor}
        erro={campos.valor_centavos}
        autoFocus
      />
      <Campo id={`baixa-data-${item.id}`} rotulo="Data" erro={campos.data_liquidacao}>
        <Input id={`baixa-data-${item.id}`} type="date" max={hojeIso(fuso)} value={data} onChange={(e) => setData(e.target.value)} />
      </Campo>
      {geral ? <p role="alert" className="text-sm font-medium text-destructive">{geral}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={baixar.isPending || valor == null || !data}>
          Confirmar
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Reagendar({ item, aoFechar }: { item: Compromisso; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const [data, setData] = useState(item.vencimento);
  const reagendar = useMutation({
    mutationFn: () => api(`/compromissos/${item.id}/reagendar`, { metodo: 'POST', corpo: { data_vencimento: data } }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = camposDe(reagendar.error);
  const geral = mensagemGeral(reagendar.error);
  return (
    <form
      noValidate
      className="space-y-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        reagendar.mutate();
      }}
    >
      <Campo id={`reag-data-${item.id}`} rotulo="Novo vencimento" erro={campos.data_vencimento}>
        <Input id={`reag-data-${item.id}`} type="date" value={data} onChange={(e) => setData(e.target.value)} autoFocus />
      </Campo>
      {geral ? <p role="alert" className="text-sm font-medium text-destructive">{geral}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={reagendar.isPending || !data}>
          Reagendar
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Etiqueta({ children, atrasada }: { children: React.ReactNode; atrasada?: boolean }) {
  return (
    <span className={`ml-1 rounded-sm px-1.5 py-0.5 text-xs font-medium ${atrasada ? 'bg-saida text-background' : 'bg-muted'}`}>
      {children}
    </span>
  );
}

function ItemCompromisso({ item, contas, textos, fuso }: { item: Compromisso; contas: Map<number, Conta>; textos: Textos; fuso: string | undefined }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState<'baixa' | 'reagendar' | null>(null);
  const liquidar = useMutation({
    mutationFn: () => api(`/movimentacoes/${item.id}/liquidar`, { metodo: 'POST', corpo: {} }),
    onSuccess: invalidar,
  });
  const entrada = item.tipo === 'receita';
  const atrasada = item.situacao === 'atrasada';
  const etiqueta = atrasada
    ? `Atrasada há ${item.dias_de_atraso} ${item.dias_de_atraso === 1 ? 'dia' : 'dias'}`
    : ROTULOS_SITUACAO[item.situacao];

  return (
    <li className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong>{item.descricao || (entrada ? 'Receita' : 'Despesa')}</strong>
          <p className="text-sm text-muted-foreground">
            Vence em {formatarData(item.vencimento)} · {contas.get(item.conta_id)?.nome ?? '—'}
            {item.recorrente ? <Etiqueta>Recorrente</Etiqueta> : null}
            {item.baixa_de_id ? <Etiqueta>Restante</Etiqueta> : null}
          </p>
        </div>
        <div className="text-right">
          <Valor centavos={item.valor_centavos} tipo={entrada ? 'entrada' : 'saida'} className="text-lg font-semibold" />
          <p>
            <Etiqueta atrasada={atrasada}>{etiqueta}</Etiqueta>
          </p>
        </div>
      </div>

      {modo === 'baixa' ? <BaixaParcial item={item} textos={textos} fuso={fuso} aoFechar={() => setModo(null)} /> : null}
      {modo === 'reagendar' ? <Reagendar item={item} aoFechar={() => setModo(null)} /> : null}

      {modo === null ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={liquidar.isPending} onClick={() => liquidar.mutate()}>
            {textos.baixa}
          </Button>
          <Button variant="outline" onClick={() => setModo('baixa')}>
            {textos.parcial}
          </Button>
          <Button variant="outline" onClick={() => setModo('reagendar')}>
            Reagendar
          </Button>
          <Button asChild variant="outline">
            <Link to={`/app/lancamentos/${item.id}`}>Editar</Link>
          </Button>
        </div>
      ) : null}
      <ErroDeAcao erro={liquidar.error} />
    </li>
  );
}

function Segmentos<T extends string>({
  rotulo,
  opcoes,
  atual,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: [T, string][];
  atual: T;
  aoEscolher: (valor: T) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map(([valor, texto]) => (
        <Button
          key={texto}
          type="button"
          variant={atual === valor ? 'default' : 'outline'}
          aria-pressed={atual === valor}
          onClick={() => aoEscolher(valor)}
        >
          {texto}
        </Button>
      ))}
    </div>
  );
}

export default function Compromissos() {
  const [params, setParams] = useSearchParams();
  const { sessao } = useSessao();
  const tipo: Tipo = params.get('tipo') === 'receita' ? 'receita' : 'despesa';
  const filtro = params.get('situacao');
  const situacao: Situacao | '' = filtro === 'atrasada' || filtro === 'a_vencer' ? filtro : '';
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const textos = TEXTOS[tipo];

  const contas = useContas();
  const consulta = useQuery({
    queryKey: ['compromissos', tipo, situacao, pagina],
    queryFn: () =>
      api<Resposta>(`/compromissos?${new URLSearchParams({ tipo, pagina: String(pagina), ...(situacao ? { situacao } : {}) })}`),
    placeholderData: (anterior) => anterior,
  });

  const mudar = (mudancas: Record<string, string>) => {
    const novo = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) novo.set(k, v);
      else novo.delete(k);
    }
    if (!('pagina' in mudancas)) novo.delete('pagina');
    setParams(novo);
  };

  const erro = consulta.error ?? contas.error;
  if (erro) return <ErroDeTela erro={erro} aoTentar={() => void consulta.refetch()} />;
  if (!consulta.data || !contas.data) return <Carregando />;

  const { itens, total, por_pagina: porPagina, totais } = consulta.data;
  const mapaContas = porId(contas.data.itens);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const tomDoTotal = tipo === 'receita' ? 'entrada' : 'saida';

  return (
    <Pagina
      titulo="Compromissos"
      acao={
        <Button asChild variant="outline">
          <Link to="/app/recorrencias">Recorrências</Link>
        </Button>
      }
    >
      <Segmentos
        rotulo="Tipo"
        atual={tipo}
        opcoes={[['despesa', TEXTOS.despesa.aba], ['receita', TEXTOS.receita.aba]]}
        aoEscolher={(t) => mudar({ tipo: t === 'despesa' ? '' : t, situacao: '' })}
      />

      <div className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{textos.aba}</h2>
        <p className="text-sm text-muted-foreground">Pendente, ainda não liquidado. Atrasado é o que já passou do vencimento.</p>
        <p className="flex justify-between">Atrasado <Valor centavos={totais.atrasado_centavos} tipo={tomDoTotal} /></p>
        <p className="flex justify-between">Vence nos próximos 7 dias <Valor centavos={totais.vence_em_breve_centavos} /></p>
        <p className="flex justify-between">Depois disso <Valor centavos={totais.depois_centavos} /></p>
        <p className="flex justify-between font-semibold">Total pendente <Valor centavos={totais.total_centavos} /></p>
      </div>

      <Segmentos<Situacao | ''>
        rotulo="Situação"
        atual={situacao}
        opcoes={[['', 'Todas'], ['atrasada', 'Atrasadas'], ['a_vencer', 'A vencer']]}
        aoEscolher={(s) => mudar({ situacao: s })}
      />

      {total === 0 ? (
        <Vazio titulo={situacao ? 'Nada nesta situação.' : textos.vazio}>
          <p>Para criar um, registre um lançamento como pendente ou cadastre uma recorrência.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/app/lancamentos/novo">Novo lançamento</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/recorrencias/nova">Nova recorrência</Link>
            </Button>
          </div>
        </Vazio>
      ) : (
        <>
          <ul className="grid gap-3 lg:grid-cols-2">
            {itens.map((item) => (
              <ItemCompromisso key={item.id} item={item} contas={mapaContas} textos={textos} fuso={sessao?.fuso} />
            ))}
          </ul>
          <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" disabled={pagina <= 1} onClick={() => mudar({ pagina: String(pagina - 1) })}>
              Anterior
            </Button>
            <span className="text-sm">Página {pagina} de {paginas} · {total} itens</span>
            <Button variant="outline" disabled={pagina >= paginas} onClick={() => mudar({ pagina: String(pagina + 1) })}>
              Próxima
            </Button>
          </nav>
        </>
      )}
    </Pagina>
  );
}
