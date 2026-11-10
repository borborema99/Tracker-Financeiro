import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import { porId, rotuloCategoria, useCartoes, useCategorias, useInvalidarDados, type Cartao, type Categoria } from '@/lib/dados';
import { formatarData, hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';
import { rotuloFatura } from './cartoesComum';

const CHAVE_ULTIMO_CARTAO = 'tracker.ultimoCartao';

function ultimoCartaoUsado(): number {
  try {
    return Number(localStorage.getItem(CHAVE_ULTIMO_CARTAO));
  } catch {
    return 0;
  }
}

function lembrarCartao(id: string): void {
  try {
    localStorage.setItem(CHAVE_ULTIMO_CARTAO, id);
  } catch {
    // sem armazenamento: só não lembra
  }
}

interface Compra {
  id: number;
  cartao_id: number;
  descricao: string;
  observacao: string;
  categoria_id: number | null;
  data_compra: string;
  parcelas_total: number;
  valor_total_centavos: number;
  valor_liquido_centavos: number;
  estornado_centavos: number;
  parcelas: { numero: number; fatura_id: number; referencia: string; data_vencimento: string; valor_centavos: number }[];
  estornos: { id: number; descricao: string; data_estorno: string; valor_centavos: number }[];
}

interface Aviso {
  codigo: string;
  mensagem: string;
}

const camposDe = (erro: Error | null) => (erro instanceof ErroApi ? (erro.campos ?? {}) : {});
const geralDe = (erro: Error | null) => (erro && !(erro instanceof ErroApi && erro.campos) ? erro.message : null);

const Bloco = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
    <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{titulo}</h2>
    {children}
  </section>
);

function Formulario({ compra, cartoes, categorias, cartaoInicial, fuso }: { compra: Compra | undefined; cartoes: Cartao[]; categorias: Categoria[]; cartaoInicial: number | null; fuso: string | undefined }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const ativos = cartoes.filter((c) => !c.arquivado || c.id === compra?.cartao_id);
  const padrao =
    ativos.find((c) => c.id === compra?.cartao_id) ??
    ativos.find((c) => c.id === cartaoInicial) ??
    ativos.find((c) => c.id === ultimoCartaoUsado()) ??
    ativos[0];

  const [cartaoId, setCartaoId] = useState(String(padrao?.id ?? ''));
  const [valor, setValor] = useState<number | null>(compra?.valor_total_centavos ?? null);
  const [parcelas, setParcelas] = useState(String(compra?.parcelas_total ?? 1));
  const [categoriaId, setCategoriaId] = useState(String(compra?.categoria_id ?? ''));
  const [data, setData] = useState(compra?.data_compra ?? hojeIso(fuso));
  const [descricao, setDescricao] = useState(compra?.descricao ?? '');
  const [observacao, setObservacao] = useState(compra?.observacao ?? '');
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === 'despesa' && c.papel == null && (!c.arquivada || String(c.id) === categoriaId))
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const salvar = useMutation({
    mutationFn: () =>
      api<{ avisos?: Aviso[] }>(compra ? `/compras-cartao/${compra.id}` : '/compras-cartao', {
        metodo: compra ? 'PUT' : 'POST',
        corpo: {
          cartao_id: Number(cartaoId),
          descricao,
          valor_total_centavos: valor ?? 0,
          categoria_id: categoriaId ? Number(categoriaId) : null,
          data_compra: data,
          parcelas_total: Number(parcelas) || 0,
          observacao,
        },
      }),
    onSuccess: async (resposta) => {
      lembrarCartao(cartaoId);
      await invalidar();
      if (resposta.avisos?.length) setAvisos(resposta.avisos);
      else navegar(`/app/cartoes/${cartaoId}`);
    },
  });
  const campos = camposDe(salvar.error);

  if (avisos.length > 0) {
    return (
      <Pagina titulo="Compra salva">
        <div role="status" className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
          {avisos.map((a) => (
            <p key={a.codigo}>{a.mensagem}</p>
          ))}
        </div>
        <div>
          <Button onClick={() => navegar(`/app/cartoes/${cartaoId}`)}>Ver o cartão</Button>
        </div>
      </Pagina>
    );
  }

  return (
    <Pagina titulo={compra ? 'Editar compra no cartão' : 'Nova compra no cartão'}>
      <form
        noValidate
        className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <CampoValor id="compra-valor" rotulo="Valor total" inicial={compra?.valor_total_centavos ?? null} aoMudar={setValor} autoFocus erro={campos.valor_total_centavos} />
        <Campo id="compra-categoria" rotulo="Categoria" erro={campos.categoria_id}>
          <Select id="compra-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {opcoesCategoria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="compra-cartao" rotulo="Cartão" erro={campos.cartao_id}>
          <Select id="compra-cartao" value={cartaoId} disabled={Boolean(compra)} onChange={(e) => setCartaoId(e.target.value)}>
            {ativos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="compra-data" rotulo="Data da compra" erro={campos.data_compra}>
            <Input id="compra-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo id="compra-parcelas" rotulo="Parcelas (1 = à vista)" erro={campos.parcelas_total}>
            <Input id="compra-parcelas" type="number" inputMode="numeric" min={1} max={48} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
          </Campo>
        </div>
        <Campo id="compra-descricao" rotulo="Descrição" erro={campos.descricao}>
          <Input id="compra-descricao" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <details className="rounded-md border px-3 py-2" open={Boolean(compra?.observacao)}>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Mais opções</summary>
          <Campo id="compra-obs" rotulo="Observação" erro={campos.observacao}>
            <Textarea id="compra-obs" rows={3} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Campo>
        </details>
        <p className="text-sm text-muted-foreground">
          A compra vira despesa uma vez, na data da compra. Cada parcela entra na fatura pelo dia de fechamento do cartão.
        </p>
        {geralDe(salvar.error) ? <p role="alert" className="text-sm font-medium text-destructive">{geralDe(salvar.error)}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvar.isPending || valor == null || !cartaoId}>
            Salvar
          </Button>
          <Button type="button" variant="ghost" onClick={() => navegar(-1)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Pagina>
  );
}

function Parcelas({ compra, cartao }: { compra: Compra; cartao: Cartao }) {
  const invalidar = useInvalidarDados();
  const [escolhidas, setEscolhidas] = useState<number[]>([]);
  const antecipar = useMutation({
    mutationFn: () => api(`/compras-cartao/${compra.id}/antecipar`, { metodo: 'POST', corpo: { parcelas: escolhidas } }),
    onSuccess: async () => {
      setEscolhidas([]);
      await invalidar();
    },
  });
  const futuras = compra.parcelas.filter((p) => p.referencia > cartao.ciclo_atual.referencia);
  const alternar = (numero: number) =>
    setEscolhidas((atual) => (atual.includes(numero) ? atual.filter((n) => n !== numero) : [...atual, numero]));

  return (
    <Bloco titulo="Parcelas">
      <ul className="divide-y">
        {compra.parcelas.map((p) => {
          const podeAntecipar = futuras.some((f) => f.numero === p.numero);
          const texto = (
            <span>
              {p.numero} de {compra.parcelas_total} ·{' '}
              <Link className="underline underline-offset-4" to={`/app/faturas/${p.fatura_id}`}>
                {rotuloFatura(p.referencia)}
              </Link>
              <span className="text-sm text-muted-foreground"> · vence em {formatarData(p.data_vencimento)}</span>
            </span>
          );
          return (
            <li key={p.numero} className="flex min-h-11 items-center justify-between gap-3 py-2">
              {podeAntecipar ? (
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="size-5" checked={escolhidas.includes(p.numero)} onChange={() => alternar(p.numero)} />
                  {texto}
                </label>
              ) : (
                texto
              )}
              <Valor centavos={p.valor_centavos} tipo="saida" />
            </li>
          );
        })}
      </ul>
      {futuras.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Marque parcelas futuras para trazê-las para a fatura atual. O valor não muda; só o vencimento chega antes.
          </p>
          <ErroDeAcao erro={antecipar.error} />
          <Button variant="outline" disabled={antecipar.isPending || escolhidas.length === 0} onClick={() => antecipar.mutate()}>
            Antecipar para a fatura atual
          </Button>
        </>
      ) : null}
    </Bloco>
  );
}

function Estornos({ compra, fuso }: { compra: Compra; fuso: string | undefined }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso(fuso));
  const [descricao, setDescricao] = useState('');
  const [rodada, setRodada] = useState(0);

  const estornar = useMutation({
    mutationFn: () =>
      api(`/compras-cartao/${compra.id}/estornos`, {
        metodo: 'POST',
        corpo: { valor_centavos: valor ?? 0, data_estorno: data, descricao },
      }),
    onSuccess: async () => {
      setValor(null);
      setDescricao('');
      setRodada((r) => r + 1);
      await invalidar();
    },
  });
  const desfazer = useMutation({
    mutationFn: (id: number) => api(`/estornos-cartao/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  const campos = camposDe(estornar.error);

  return (
    <Bloco titulo="Estorno">
      <p className="text-sm text-muted-foreground">
        O estorno ajusta a compra: o valor líquido cai e o crédito abate a fatura aberta. Estornar o valor todo reverte a compra.
      </p>
      <p>
        Valor líquido <Valor centavos={compra.valor_liquido_centavos} tipo="saida" />
        {compra.estornado_centavos > 0 ? (
          <span className="text-sm text-muted-foreground">
            {' '}(de <Valor centavos={compra.valor_total_centavos} />)
          </span>
        ) : null}
      </p>

      <ul className="divide-y">
        {compra.estornos.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 py-2">
            <div>
              <strong>{e.descricao || 'Estorno'}</strong>
              <p className="text-sm text-muted-foreground">{formatarData(e.data_estorno)}</p>
            </div>
            <div className="space-y-1 text-right">
              <Valor centavos={e.valor_centavos} tipo="entrada" />
              <div>
                <Button variant="outline" disabled={desfazer.isPending} onClick={() => desfazer.mutate(e.id)}>
                  Desfazer
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ErroDeAcao erro={desfazer.error} />

      {compra.valor_liquido_centavos > 0 ? (
        <form
          noValidate
          className="space-y-4 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            estornar.mutate();
          }}
        >
          <CampoValor key={rodada} id="estorno-valor" rotulo="Valor do estorno" aoMudar={setValor} erro={campos.valor_centavos} />
          <Campo id="estorno-data" rotulo="Data do estorno" erro={campos.data_estorno}>
            <Input id="estorno-data" type="date" min={compra.data_compra} max={hojeIso(fuso)} value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo id="estorno-descricao" rotulo="Descrição">
            <Input id="estorno-descricao" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
          {geralDe(estornar.error) ? <p role="alert" className="text-sm font-medium text-destructive">{geralDe(estornar.error)}</p> : null}
          <Button type="submit" variant="outline" disabled={estornar.isPending || valor == null}>
            Registrar estorno
          </Button>
        </form>
      ) : null}
    </Bloco>
  );
}

function Excluir({ compra }: { compra: Compra }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const excluir = useMutation({
    mutationFn: () => api(`/compras-cartao/${compra.id}`, { metodo: 'DELETE' }),
    onSuccess: async () => {
      await invalidar();
      navegar(`/app/cartoes/${compra.cartao_id}`);
    },
  });
  return (
    <Bloco titulo="Excluir compra">
      <p className="text-sm text-muted-foreground">Tira as parcelas das faturas e devolve o limite. Os estornos da compra saem junto.</p>
      <ErroDeAcao erro={excluir.error} />
      <div className="flex flex-wrap gap-2">
        <BotaoExcluir rotulo="Excluir compra" aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      </div>
    </Bloco>
  );
}

/** Rotas `/app/cartoes/compras/nova` (com `?cartao=ID`) e `/app/cartoes/compras/:id`. */
export default function CompraCartao() {
  const { id } = useParams();
  const [busca] = useSearchParams();
  const { sessao } = useSessao();
  const cartoes = useCartoes();
  const categorias = useCategorias();
  const compra = useQuery({ queryKey: ['compra', id], queryFn: () => api<Compra>(`/compras-cartao/${id}`), enabled: Boolean(id) });

  const erro = cartoes.error ?? categorias.error ?? compra.error;
  if (erro) return <ErroDeTela erro={erro} />;
  if (!cartoes.data || !categorias.data || (id && !compra.data)) return <Carregando />;
  if (!id && cartoes.data.itens.filter((c) => !c.arquivado).length === 0) {
    return (
      <Pagina titulo="Nova compra no cartão">
        <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
          <p>Antes de lançar uma compra, cadastre um cartão.</p>
          <Button asChild>
            <Link to="/app/cartoes">Ir para Cartões</Link>
          </Button>
        </div>
      </Pagina>
    );
  }

  const cartao = compra.data ? cartoes.data.itens.find((c) => c.id === compra.data.cartao_id) : undefined;
  return (
    <>
      <Formulario
        key={`${id ?? 'nova'}-${compra.dataUpdatedAt}`}
        compra={compra.data}
        cartoes={cartoes.data.itens}
        categorias={categorias.data.itens}
        cartaoInicial={Number(busca.get('cartao')) || null}
        fuso={sessao?.fuso}
      />
      {compra.data && cartao ? (
        <div className="mt-6 space-y-6">
          <Parcelas compra={compra.data} cartao={cartao} />
          <Estornos compra={compra.data} fuso={sessao?.fuso} />
          <Excluir compra={compra.data} />
        </div>
      ) : null}
    </>
  );
}
