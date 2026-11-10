import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { NavegacaoMes } from '@/components/NavegacaoMes';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import { useCategorias, useInvalidarDados, type Categoria } from '@/lib/dados';
import { hojeIso, nomeDoMes } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';

type Situacao = 'ok' | 'atencao' | 'estourado';

interface ItemOrcamento {
  categoria_id: number;
  nome: string;
  limite_centavos: number;
  realizado_centavos: number;
  previsto_centavos: number;
  restante_centavos: number;
  percentual: number;
  situacao: Situacao;
  vai_estourar: boolean;
}

interface Resposta {
  itens: ItemOrcamento[];
  totais: { limite_centavos: number; realizado_centavos: number; restante_centavos: number; estourados: number };
  sem_orcamento: { categoria_id: number | null; nome: string; realizado_centavos: number; previsto_centavos: number }[];
}

const ROTULO_SITUACAO: Record<Situacao, string> = { ok: 'Dentro do limite', atencao: 'Perto do limite', estourado: 'Estourado' };
const COR_DO_MEDIDOR: Record<Situacao, string> = { ok: 'text-entrada', atencao: 'text-aviso', estourado: 'text-saida' };

/** Define o limite de uma categoria a partir do mês exibido; zero tira o orçamento daquele mês em diante. */
function useDefinirLimite(mes: string, aoSalvar?: () => void) {
  const invalidar = useInvalidarDados();
  return useMutation({
    mutationFn: ({ categoriaId, centavos }: { categoriaId: number; centavos: number }) =>
      api(`/orcamento/${categoriaId}`, { metodo: 'PUT', corpo: { mes_inicio: mes, limite_centavos: centavos } }),
    onSuccess: async () => {
      await invalidar();
      aoSalvar?.();
    },
  });
}

const camposDe = (erro: Error | null) => (erro instanceof ErroApi ? (erro.campos ?? {}) : {});
const geralDe = (erro: Error | null) => (erro && !(erro instanceof ErroApi && erro.campos) ? erro.message : null);

function Item({ item, mes }: { item: ItemOrcamento; mes: string }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<number | null>(item.limite_centavos);
  const definir = useDefinirLimite(mes, () => setEditando(false));
  const campos = camposDe(definir.error);
  const restante = item.restante_centavos >= 0;

  return (
    <li className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong>{item.nome}</strong>
          <span className={`ml-2 rounded-sm px-1.5 py-0.5 text-xs font-medium ${item.situacao === 'estourado' ? 'bg-saida text-background' : item.situacao === 'atencao' ? 'bg-aviso text-background' : 'bg-muted'}`}>
            {ROTULO_SITUACAO[item.situacao]}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">{item.percentual}%</span>
      </div>
      <progress
        className={`medidor ${COR_DO_MEDIDOR[item.situacao]}`}
        max={100}
        value={Math.min(item.percentual, 100)}
        aria-label={`${item.percentual}% do limite de ${item.nome}`}
      />
      <p>
        Gasto <Valor centavos={item.realizado_centavos} tipo="saida" /> de <Valor centavos={item.limite_centavos} />
      </p>
      <p>
        {restante ? 'Resta' : 'Passou'} <Valor centavos={Math.abs(item.restante_centavos)} tipo={restante ? 'neutro' : 'saida'} />
      </p>
      {item.previsto_centavos > 0 ? (
        <p className="text-sm text-muted-foreground">
          Previsto (ainda não pago) neste mês: <Valor centavos={item.previsto_centavos} />.
          {item.vai_estourar ? ' Se tudo for pago, o limite será ultrapassado.' : ''}
        </p>
      ) : null}
      {editando ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            definir.mutate({ categoriaId: item.categoria_id, centavos: valor ?? 0 });
          }}
        >
          <CampoValor id={`lim-${item.categoria_id}`} rotulo={`Novo limite a partir de ${nomeDoMes(mes)}`} inicial={item.limite_centavos} aoMudar={setValor} erro={campos.limite_centavos} autoFocus />
          <p className="text-sm text-muted-foreground">Os meses anteriores continuam com o limite que tinham.</p>
          {geralDe(definir.error) ? <p role="alert" className="text-sm font-medium text-destructive">{geralDe(definir.error)}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={definir.isPending || valor == null || valor === 0}>
              Salvar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditando(true)}>
            Alterar limite
          </Button>
          <Button variant="outline" disabled={definir.isPending} onClick={() => definir.mutate({ categoriaId: item.categoria_id, centavos: 0 })}>
            Remover a partir daqui
          </Button>
        </div>
      )}
      {!editando ? <ErroDeAcao erro={definir.error} /> : null}
    </li>
  );
}

function NovoOrcamento({ mes, categorias, comLimite }: { mes: string; categorias: Categoria[]; comLimite: Set<number> }) {
  const [categoriaId, setCategoriaId] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [chave, setChave] = useState(0);
  const definir = useDefinirLimite(mes, () => {
    setCategoriaId('');
    setValor(null);
    setChave((c) => c + 1);
  });
  const campos = camposDe(definir.error);
  const disponiveis = categorias
    .filter((c) => c.tipo === 'despesa' && c.pai_id == null && !c.arquivada && !comLimite.has(c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (disponiveis.length === 0) return null;
  return (
    <form
      noValidate
      className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        definir.mutate({ categoriaId: Number(categoriaId), centavos: valor ?? 0 });
      }}
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Novo orçamento</h2>
      <Campo id="orc-categoria" rotulo="Categoria" erro={campos.categoria_id}>
        <Select id="orc-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Escolha…</option>
          {disponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </Campo>
      <CampoValor key={chave} id="orc-limite" rotulo="Limite por mês" aoMudar={setValor} erro={campos.limite_centavos} />
      <p className="text-sm text-muted-foreground">Vale de {nomeDoMes(mes)} em diante. Subcategorias somam na categoria principal.</p>
      {geralDe(definir.error) ? <p role="alert" className="text-sm font-medium text-destructive">{geralDe(definir.error)}</p> : null}
      <Button type="submit" disabled={definir.isPending || !categoriaId || valor == null || valor === 0}>
        Definir limite
      </Button>
    </form>
  );
}

export default function Orcamento() {
  const { sessao } = useSessao();
  const [mes, setMes] = useState(hojeIso(sessao?.fuso).slice(0, 7));
  const orcamento = useQuery({ queryKey: ['orcamento', mes], queryFn: () => api<Resposta>(`/orcamento?mes=${mes}`) });
  const categorias = useCategorias();

  const erro = orcamento.error ?? categorias.error;
  if (erro) return <ErroDeTela erro={erro} aoTentar={() => void orcamento.refetch()} />;
  if (!orcamento.data || !categorias.data) return <Carregando />;
  const o = orcamento.data;
  const comLimite = new Set(o.itens.map((i) => i.categoria_id));

  return (
    <Pagina titulo="Orçamento">
      <NavegacaoMes mes={mes} aoMudar={setMes} />
      <p className="max-w-2xl text-sm text-muted-foreground">
        O gasto é o realizado: despesas liquidadas e compras no cartão pela data da compra, menos estornos. O que ainda está
        pendente aparece à parte, como previsto.
      </p>

      {o.itens.length > 0 ? (
        <div className="max-w-xl space-y-1 rounded-lg border bg-card p-4">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Total orçado</h2>
          <p className="flex justify-between">Limites <Valor centavos={o.totais.limite_centavos} /></p>
          <p className="flex justify-between">Gasto <Valor centavos={o.totais.realizado_centavos} tipo="saida" /></p>
          <p className="flex justify-between">{o.totais.restante_centavos >= 0 ? 'Resta' : 'Passou'} <Valor centavos={Math.abs(o.totais.restante_centavos)} /></p>
          <p className="text-sm text-muted-foreground">
            Só categorias com orçamento entram neste total.
            {o.totais.estourados > 0 ? ` ${o.totais.estourados} estourado(s).` : ''}
          </p>
        </div>
      ) : null}

      {o.itens.length === 0 ? (
        <Vazio titulo={`Nenhum orçamento em vigor em ${nomeDoMes(mes)}.`}>
          Defina um limite por categoria abaixo para acompanhar o gasto do mês.
        </Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {o.itens.map((i) => (
            <Item key={`${mes}-${i.categoria_id}-${i.limite_centavos}`} item={i} mes={mes} />
          ))}
        </ul>
      )}

      <NovoOrcamento mes={mes} categorias={categorias.data.itens} comLimite={comLimite} />

      {o.sem_orcamento.length > 0 ? (
        <div className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Sem orçamento</h2>
          <ul className="divide-y">
            {o.sem_orcamento.map((s) => (
              <li key={s.categoria_id ?? 'sem'} className="flex justify-between gap-3 py-2">
                <span>{s.nome}</span>
                <span>
                  <Valor centavos={s.realizado_centavos} tipo="saida" />
                  {s.previsto_centavos > 0 ? (
                    <span className="text-sm text-muted-foreground"> · previsto <Valor centavos={s.previsto_centavos} /></span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Pagina>
  );
}
