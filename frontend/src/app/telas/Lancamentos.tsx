import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ROTULOS_STATUS, ROTULOS_TIPO } from '../../../../contratos/movimentacoes.js';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados, type Categoria, type Conta } from '@/lib/dados';
import { formatarData } from '@/lib/datas';
import { FiltrosLancamentos } from './FiltrosLancamentos';

export interface Movimentacao {
  id: number;
  tipo: 'receita' | 'despesa' | 'transferencia';
  descricao: string;
  valor_centavos: number;
  conta_id: number;
  conta_destino_id: number | null;
  categoria_id: number | null;
  divisoes?: { categoria_id: number; valor_centavos: number }[];
  data_competencia: string;
  data_vencimento: string | null;
  data_liquidacao: string | null;
  status: 'pendente' | 'liquidada';
  atrasada?: boolean;
  recorrencia_id: number | null;
  transferencia_id: number | null;
  reembolso_de_id: number | null;
  reembolsavel_centavos: number;
  reembolsado_centavos: number;
}

interface Totais {
  realizado: { receitas: number; despesas: number; resultado: number };
  previsto: { receitas: number; despesas: number };
}

interface Resposta {
  itens: Movimentacao[];
  total: number;
  pagina: number;
  por_pagina: number;
  totais: Totais;
}

const CHAVES = ['q', 'tipo', 'status', 'conta_id', 'categoria_id', 'campo_data', 'de', 'ate', 'ordenar', 'direcao', 'pagina'];

function Acoes({ m }: { m: Movimentacao }) {
  const invalidar = useInvalidarDados();
  const liquidar = useMutation({ mutationFn: () => api(`/movimentacoes/${m.id}/liquidar`, { metodo: 'POST' }), onSuccess: invalidar });
  const reabrir = useMutation({ mutationFn: () => api(`/movimentacoes/${m.id}/reabrir`, { metodo: 'POST' }), onSuccess: invalidar });
  const excluir = useMutation({ mutationFn: () => api(`/movimentacoes/${m.id}`, { metodo: 'DELETE' }), onSuccess: invalidar });
  const erro = liquidar.error ?? reabrir.error ?? excluir.error;

  if (m.transferencia_id) {
    return (
      <Button asChild variant="outline">
        <Link to={`/app/lancamentos/${m.transferencia_id}`}>Abrir transferência</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link to={`/app/lancamentos/${m.id}`}>Editar</Link>
      </Button>
      <Button asChild variant="outline">
        <Link to={`/app/lancamentos/novo?duplicar=${m.id}`}>Duplicar</Link>
      </Button>
      {m.tipo === 'despesa' && m.reembolsavel_centavos > 0 ? (
        <Button asChild variant="outline">
          <Link to={`/app/lancamentos/novo?reembolso=${m.id}`}>Registrar reembolso</Link>
        </Button>
      ) : null}
      <Button asChild variant="outline">
        <Link to={`/app/lancamentos/${m.id}/historico`}>Histórico</Link>
      </Button>
      <Button asChild variant="outline">
        <Link to={`/app/lancamentos/${m.id}/anexos`}>Comprovantes</Link>
      </Button>
      {m.status === 'pendente' ? (
        <Button variant="outline" disabled={liquidar.isPending} onClick={() => liquidar.mutate()}>
          Liquidar
        </Button>
      ) : (
        <Button variant="outline" disabled={reabrir.isPending} onClick={() => reabrir.mutate()}>
          Reabrir
        </Button>
      )}
      <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      <ErroDeAcao erro={erro} />
    </div>
  );
}

function Etiqueta({ children, tom }: { children: React.ReactNode; tom?: 'atraso' | 'pendente' }) {
  return (
    <span
      className={`ml-1 rounded-sm px-1.5 py-0.5 text-xs font-medium ${
        tom === 'atraso' ? 'bg-saida text-background' : tom === 'pendente' ? 'bg-aviso text-background' : 'bg-muted'
      }`}
    >
      {children}
    </span>
  );
}

// Em telas estreitas a tabela vira cartões: cada célula mostra o próprio rótulo (data-label) antes do valor.
const celula = 'block px-3 py-1 before:mr-2 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:px-3 md:py-3 md:before:content-none';

function Linha({ m, contas, categorias }: { m: Movimentacao; contas: Map<number, Conta>; categorias: Map<number, Categoria> }) {
  const categoriaDaLinha = m.categoria_id ? categorias.get(m.categoria_id) : undefined;
  const categoria = categoriaDaLinha ? rotuloCategoria(categoriaDaLinha, categorias) : m.divisoes?.length ? 'Dividida' : '—';
  const conta = contas.get(m.conta_id)?.nome ?? '—';
  const destino = m.conta_destino_id ? contas.get(m.conta_destino_id)?.nome : null;
  const tipoDoValor = m.tipo === 'receita' ? 'entrada' : m.tipo === 'despesa' ? 'saida' : 'neutro';

  return (
    <tr className={`block border-b py-2 md:table-row md:py-0 ${m.status === 'pendente' ? 'bg-muted/40' : ''}`}>
      <td data-label="Data" className={celula}>
        {formatarData(m.data_competencia)}
      </td>
      <td data-label="Descrição" className={celula}>
        <strong>{m.descricao || ROTULOS_TIPO[m.tipo]}</strong>
        {m.transferencia_id ? <Etiqueta>Tarifa</Etiqueta> : null}
        {m.reembolso_de_id ? <Etiqueta>Reembolso</Etiqueta> : null}
        {m.reembolsado_centavos > 0 ? (
          <Etiqueta>
            Reembolsado <Valor centavos={m.reembolsado_centavos} tipo="entrada" />
          </Etiqueta>
        ) : null}
      </td>
      <td data-label="Categoria" className={celula}>
        {m.tipo === 'transferencia' ? 'Transferência' : categoria}
      </td>
      <td data-label="Conta" className={celula}>
        {destino ? `${conta} → ${destino}` : conta}
      </td>
      <td data-label="Situação" className={celula}>
        {m.atrasada ? <Etiqueta tom="atraso">Atrasada</Etiqueta> : m.status === 'pendente' ? <Etiqueta tom="pendente">Pendente</Etiqueta> : <Etiqueta>{ROTULOS_STATUS[m.status]}</Etiqueta>}
        {m.recorrencia_id ? <Etiqueta>Recorrente</Etiqueta> : null}
      </td>
      <td data-label="Valor" className={`${celula} md:text-right`}>
        <Valor centavos={m.valor_centavos} tipo={tipoDoValor} sinal className="font-semibold" />
      </td>
      <td className={`${celula} md:max-w-72`}>
        <Acoes m={m} />
      </td>
    </tr>
  );
}

export default function Lancamentos() {
  const [params, setParams] = useSearchParams();
  const contas = useContas();
  const categorias = useCategorias();

  const filtros = Object.fromEntries(CHAVES.flatMap((k) => (params.get(k) ? [[k, params.get(k) as string]] : [])));
  const consulta = useQuery({
    queryKey: ['movimentacoes', filtros],
    queryFn: () => api<Resposta>(`/movimentacoes?${new URLSearchParams(filtros)}`),
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

  const erro = consulta.error ?? contas.error ?? categorias.error;
  if (erro) return <ErroDeTela erro={erro} aoTentar={() => void consulta.refetch()} />;
  if (!consulta.data || !contas.data || !categorias.data) return <Carregando />;

  const { itens, total, pagina, por_pagina: porPagina, totais } = consulta.data;
  const mapaContas = porId(contas.data.itens);
  const mapaCategorias = porId(categorias.data.itens);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const filtrando = Object.keys(filtros).some((k) => k !== 'pagina');
  const consultaCsv = new URLSearchParams(Object.entries(filtros).filter(([k]) => k !== 'pagina'));

  return (
    <Pagina
      titulo="Lançamentos"
      acao={
        <Button asChild>
          <Link to="/app/lancamentos/novo">Novo lançamento</Link>
        </Button>
      }
    >
      <FiltrosLancamentos params={params} mudar={mudar} />

      {total === 0 ? (
        <Vazio titulo={filtrando ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento ainda.'}>
          {filtrando ? null : 'Use o botão “Novo lançamento” para registrar o primeiro.'}
        </Vazio>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 rounded-lg border bg-card p-4">
              <h2 className="font-display text-xl font-extrabold tracking-wide uppercase">Realizado (liquidado)</h2>
              <p className="flex justify-between">Receitas <Valor centavos={totais.realizado.receitas} tipo="entrada" sinal /></p>
              <p className="flex justify-between">Despesas <Valor centavos={totais.realizado.despesas} tipo="saida" sinal /></p>
              <p className="flex justify-between font-semibold">Resultado <Valor centavos={totais.realizado.resultado} /></p>
            </div>
            <div className="space-y-1 rounded-lg border bg-card p-4">
              <h2 className="font-display text-xl font-extrabold tracking-wide uppercase">Previsto (pendente)</h2>
              <p className="flex justify-between">A receber <Valor centavos={totais.previsto.receitas} tipo="entrada" sinal /></p>
              <p className="flex justify-between">A pagar <Valor centavos={totais.previsto.despesas} tipo="saida" sinal /></p>
            </div>
          </div>

          <table className="block w-full text-left text-sm md:table">
            <thead className="hidden md:table-header-group">
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Data</th>
                <th scope="col" className="px-3 py-2 font-medium">Descrição</th>
                <th scope="col" className="px-3 py-2 font-medium">Categoria</th>
                <th scope="col" className="px-3 py-2 font-medium">Conta</th>
                <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {itens.map((m) => (
                <Linha key={m.id} m={m} contas={mapaContas} categorias={mapaCategorias} />
              ))}
            </tbody>
          </table>

          <p className="text-sm text-muted-foreground">
            <a className="underline underline-offset-4 hover:no-underline" href={`/api/exportar/lancamentos.csv?${consultaCsv}`} download>
              Exportar {filtrando ? 'estes lançamentos' : 'todos os lançamentos'} em CSV
            </a>{' '}
            (abre em planilha)
          </p>

          <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" disabled={pagina <= 1} onClick={() => mudar({ pagina: String(pagina - 1) })}>
              Anterior
            </Button>
            <span className="text-sm">Página {pagina} de {paginas} · {total} lançamentos</span>
            <Button variant="outline" disabled={pagina >= paginas} onClick={() => mudar({ pagina: String(pagina + 1) })}>
              Próxima
            </Button>
          </nav>
        </>
      )}
    </Pagina>
  );
}
