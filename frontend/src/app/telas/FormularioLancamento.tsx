import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ROTULOS_TIPO, TIPOS_MOVIMENTACAO, esquemaMovimentacao } from '../../../../contratos/movimentacoes.js';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import {
  porId, rotuloCategoria, useCartoes, useCategorias, useContas, useInvalidarDados,
  type Categoria, type Conta,
} from '@/lib/dados';
import { hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';
import type { Movimentacao } from './Lancamentos';

const CHAVE_ULTIMA_CONTA = 'tracker.ultimaConta';

function ultimaContaUsada(): number {
  try {
    return Number(localStorage.getItem(CHAVE_ULTIMA_CONTA));
  } catch {
    return 0;
  }
}

function lembrarConta(id: string): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_CONTA, id);
  } catch {
    // sem armazenamento: só não lembra
  }
}

/** Detalhe devolvido por GET /movimentacoes/:id (a listagem não traz observação nem tarifa). */
interface Detalhe extends Movimentacao {
  observacao: string;
  tarifa_centavos: number;
  divisoes: { categoria_id: number; valor_centavos: number }[];
}

interface Parte {
  categoria_id: string;
  valor: number | null;
}

interface Aviso {
  codigo: string;
  mensagem: string;
}

type Tipo = (typeof TIPOS_MOVIMENTACAO)[number];

interface PropsFormulario {
  origem: Detalhe | undefined;
  duplicando: boolean;
  reembolsoDe: Detalhe | undefined;
  temCartoes: boolean;
  contas: Conta[];
  categorias: Categoria[];
  fuso: string | undefined;
}

function Formulario({ origem, duplicando, reembolsoDe, temCartoes, contas, categorias, fuso }: PropsFormulario) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const hoje = hojeIso(fuso);
  const edicao = origem && !duplicando ? origem : null;

  const contasAtivas = contas.filter((c) => !c.arquivada || c.id === origem?.conta_id);
  const lembrada = ultimaContaUsada();
  const contaPadrao = contasAtivas.find((c) => c.id === lembrada)?.id ?? contasAtivas[0]?.id ?? '';
  // Reembolso: nasce de uma despesa (?reembolso=ID) e já vem com o que ainda dá para reembolsar.
  const valorInicial = origem?.valor_centavos ?? reembolsoDe?.reembolsavel_centavos ?? null;
  const ligadoA = reembolsoDe?.id ?? edicao?.reembolso_de_id ?? null;

  const [tipo, setTipo] = useState<Tipo>(reembolsoDe ? 'receita' : (origem?.tipo ?? 'despesa'));
  const [valor, setValor] = useState<number | null>(valorInicial);
  const [descricao, setDescricao] = useState(
    origem?.descricao ?? (reembolsoDe ? `Reembolso: ${reembolsoDe.descricao || 'despesa'}` : ''),
  );
  const [contaId, setContaId] = useState(String(origem?.conta_id ?? reembolsoDe?.conta_id ?? contaPadrao));
  const [destinoId, setDestinoId] = useState(String(origem?.conta_destino_id ?? ''));
  const [categoriaId, setCategoriaId] = useState(String(origem?.categoria_id ?? ''));
  const [data, setData] = useState(duplicando || !origem ? hoje : origem.data_competencia);
  const [status, setStatus] = useState<'liquidada' | 'pendente'>(duplicando ? 'liquidada' : (origem?.status ?? 'liquidada'));
  const [vencimento, setVencimento] = useState(duplicando ? '' : (origem?.data_vencimento ?? ''));
  const [liquidacao, setLiquidacao] = useState(duplicando ? '' : (origem?.data_liquidacao ?? ''));
  const [observacao, setObservacao] = useState(origem?.observacao ?? '');
  const [tarifa, setTarifa] = useState<number | null>(origem?.tarifa_centavos || null);
  const [partes, setPartes] = useState<Parte[]>(
    (origem?.divisoes ?? []).map((d) => ({ categoria_id: String(d.categoria_id), valor: d.valor_centavos })),
  );
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [errosLocais, setErrosLocais] = useState<Record<string, string>>({});

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === tipo && c.papel == null && (!c.arquivada || String(c.id) === categoriaId))
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const abrirMaisOpcoes = Boolean(
    edicao && (edicao.status === 'pendente' || edicao.data_vencimento || edicao.observacao || partes.length > 0 || edicao.tarifa_centavos),
  );

  function montarCorpo() {
    const dividido = tipo !== 'transferencia' && partes.length > 0;
    return {
      tipo,
      descricao,
      valor_centavos: valor ?? 0,
      conta_id: Number(contaId),
      conta_destino_id: tipo === 'transferencia' && destinoId ? Number(destinoId) : null,
      categoria_id: tipo !== 'transferencia' && !dividido && categoriaId ? Number(categoriaId) : null,
      divisoes: dividido ? partes.map((p) => ({ categoria_id: Number(p.categoria_id), valor_centavos: p.valor ?? 0 })) : [],
      data_competencia: data,
      data_vencimento: vencimento || null,
      data_liquidacao: status === 'liquidada' ? liquidacao || data : null,
      status,
      observacao,
      tarifa_centavos: tipo === 'transferencia' ? (tarifa ?? 0) : 0,
      reembolso_de_id: tipo === 'receita' ? ligadoA : null,
    };
  }

  const salvar = useMutation({
    mutationFn: (corpo: ReturnType<typeof montarCorpo>) =>
      api<{ avisos?: Aviso[] }>(edicao ? `/movimentacoes/${edicao.id}` : '/movimentacoes', {
        metodo: edicao ? 'PUT' : 'POST',
        corpo,
      }),
    onSuccess: async (resposta) => {
      lembrarConta(contaId);
      await invalidar();
      if (resposta.avisos?.length) setAvisos(resposta.avisos);
      else navegar('/app/lancamentos');
    },
  });
  const camposDoServidor = salvar.error instanceof ErroApi ? (salvar.error.campos ?? {}) : {};
  const erroDe = (campo: string) => errosLocais[campo] ?? camposDoServidor[campo];

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const corpo = montarCorpo();
    // As mesmas regras e mensagens do servidor (contrato compartilhado); o servidor continua sendo a autoridade.
    const resultado = esquemaMovimentacao.safeParse(corpo);
    if (!resultado.success) {
      const erros: Record<string, string> = {};
      for (const problema of resultado.error.issues) {
        const campo = String(problema.path[0] ?? 'geral');
        erros[campo] ??= problema.message;
      }
      setErrosLocais(erros);
      return;
    }
    setErrosLocais({});
    salvar.mutate(corpo);
  }

  function mudarParte(i: number, mudanca: Partial<Parte>) {
    setPartes((atual) => atual.map((p, j) => (j === i ? { ...p, ...mudanca } : p)));
  }

  if (avisos.length > 0) {
    return (
      <Pagina titulo="Lançamento salvo">
        <div role="status" className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
          {avisos.map((a) => (
            <p key={a.codigo}>{a.mensagem}</p>
          ))}
        </div>
        <div>
          <Button onClick={() => navegar('/app/lancamentos')}>Ver lançamentos</Button>
        </div>
      </Pagina>
    );
  }

  const titulo = edicao
    ? 'Editar lançamento'
    : duplicando
      ? 'Duplicar lançamento'
      : reembolsoDe
        ? 'Registrar reembolso'
        : 'Novo lançamento';
  const erroGeral = salvar.error && !(salvar.error instanceof ErroApi && salvar.error.campos) ? salvar.error.message : null;

  return (
    <Pagina titulo={titulo}>
      <form noValidate onSubmit={enviar} className="max-w-xl space-y-4 rounded-lg border bg-card p-4">
        {reembolsoDe ? (
          <p className="text-sm text-muted-foreground">
            Reembolso da despesa “{reembolsoDe.descricao || 'sem descrição'}” (<Valor centavos={reembolsoDe.valor_centavos} />).
            Ainda dá para reembolsar <Valor centavos={reembolsoDe.reembolsavel_centavos} />.
          </p>
        ) : null}
        {edicao?.reembolso_de_id ? (
          <p className="text-sm text-muted-foreground">
            Este lançamento é um reembolso.{' '}
            <Link className="underline underline-offset-4" to={`/app/lancamentos/${edicao.reembolso_de_id}`}>
              Ver a despesa original
            </Link>
            .
          </p>
        ) : null}
        {tipo === 'despesa' && temCartoes && !edicao && !reembolsoDe ? (
          <p className="text-sm text-muted-foreground">
            Foi no cartão de crédito?{' '}
            <Link className="underline underline-offset-4" to="/app/cartoes/compras/nova">
              Registre como compra no cartão
            </Link>
            .
          </p>
        ) : null}

        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-2">
          {TIPOS_MOVIMENTACAO.map((t) => (
            <Button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              variant={tipo === t ? 'default' : 'outline'}
              disabled={
                (Boolean(edicao) && (edicao?.tipo === 'transferencia') !== (t === 'transferencia')) ||
                (ligadoA != null && t !== 'receita')
              }
              onClick={() => {
                setTipo(t);
                setCategoriaId('');
                setPartes([]);
              }}
            >
              {ROTULOS_TIPO[t]}
            </Button>
          ))}
        </div>

        <CampoValor id="mov-valor" rotulo="Valor" inicial={valorInicial} aoMudar={setValor} autoFocus erro={erroDe('valor_centavos')} />
        {erroDe('reembolso_de_id') ? (
          <p role="alert" className="text-sm font-medium text-destructive">{erroDe('reembolso_de_id')}</p>
        ) : null}

        {tipo !== 'transferencia' && partes.length === 0 ? (
          <Campo id="mov-categoria" rotulo="Categoria" erro={erroDe('categoria_id')}>
            <Select id="mov-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sem categoria</option>
              {opcoesCategoria.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </Select>
          </Campo>
        ) : null}

        <Campo id="mov-conta" rotulo={tipo === 'transferencia' ? 'Conta de origem' : 'Conta'} erro={erroDe('conta_id')}>
          <Select id="mov-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contasAtivas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Campo>

        {tipo === 'transferencia' ? (
          <Campo id="mov-destino" rotulo="Conta de destino" erro={erroDe('conta_destino_id')}>
            <Select id="mov-destino" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
              <option value="">Escolha…</option>
              {contasAtivas
                .filter((c) => String(c.id) !== contaId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </Select>
          </Campo>
        ) : null}

        <Campo id="mov-data" rotulo="Data" erro={erroDe('data_competencia')}>
          <Input id="mov-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>

        <Campo id="mov-descricao" rotulo="Descrição" erro={erroDe('descricao')}>
          <Input id="mov-descricao" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>

        <details className="rounded-md border px-3 py-2" open={abrirMaisOpcoes}>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Mais opções</summary>
          <div className="space-y-4 pb-2">
            <Campo id="mov-status" rotulo="Situação">
              <Select id="mov-status" value={status} onChange={(e) => setStatus(e.target.value as 'liquidada' | 'pendente')}>
                <option value="liquidada">Liquidada (já aconteceu)</option>
                <option value="pendente">Pendente (ainda vai acontecer)</option>
              </Select>
            </Campo>

            <Campo id="mov-vencimento" rotulo="Vencimento" erro={erroDe('data_vencimento')}>
              <Input id="mov-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>

            {status === 'liquidada' ? (
              <Campo id="mov-liquidacao" rotulo="Data de liquidação (vazio = mesma data)" erro={erroDe('data_liquidacao')}>
                <Input id="mov-liquidacao" type="date" value={liquidacao} onChange={(e) => setLiquidacao(e.target.value)} />
              </Campo>
            ) : null}

            {tipo === 'transferencia' ? (
              <CampoValor
                id="mov-tarifa"
                rotulo="Tarifa da transferência (vira despesa)"
                inicial={origem?.tarifa_centavos || null}
                aoMudar={setTarifa}
                erro={erroDe('tarifa_centavos')}
              />
            ) : (
              <fieldset className="space-y-3">
                <legend className="mb-2 font-medium">Dividir entre categorias</legend>
                {partes.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-md border p-3">
                    <Select
                      aria-label={`Categoria da parte ${i + 1}`}
                      value={p.categoria_id}
                      onChange={(e) => mudarParte(i, { categoria_id: e.target.value })}
                    >
                      <option value="">Escolha…</option>
                      {opcoesCategoria.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.rotulo}
                        </option>
                      ))}
                    </Select>
                    <CampoValor
                      id={`mov-div-${i}`}
                      rotulo={`Valor da parte ${i + 1}`}
                      inicial={p.valor}
                      aoMudar={(v) => mudarParte(i, { valor: v })}
                    />
                    <Button type="button" variant="outline" onClick={() => setPartes((atual) => atual.filter((_, j) => j !== i))}>
                      Remover parte
                    </Button>
                  </div>
                ))}
                {erroDe('divisoes') ? (
                  <p role="alert" className="text-sm font-medium text-destructive">{erroDe('divisoes')}</p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setPartes((atual) =>
                      atual.length === 0
                        ? [
                            { categoria_id: categoriaId, valor: null },
                            { categoria_id: '', valor: null },
                          ]
                        : [...atual, { categoria_id: '', valor: null }],
                    )
                  }
                >
                  {partes.length === 0 ? 'Dividir' : 'Adicionar parte'}
                </Button>
              </fieldset>
            )}

            <Campo id="mov-obs" rotulo="Observação" erro={erroDe('observacao')}>
              <Textarea id="mov-obs" rows={3} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Campo>
          </div>
        </details>

        {erroGeral ? <p role="alert" className="text-sm font-medium text-destructive">{erroGeral}</p> : null}
        {salvar.error instanceof ErroApi && salvar.error.campos ? (
          <p role="alert" className="text-sm font-medium text-destructive">{salvar.error.message}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvar.isPending || !contaId}>
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

/** Rotas `/app/lancamentos/novo` (com `?duplicar=ID` ou `?reembolso=ID`) e `/app/lancamentos/:id`. */
export default function FormularioLancamento() {
  const { id } = useParams();
  const [busca] = useSearchParams();
  const { sessao } = useSessao();
  const duplicarId = busca.get('duplicar');
  const reembolsoId = id ? null : busca.get('reembolso');
  const idOrigem = id ?? duplicarId;

  const contas = useContas();
  const categorias = useCategorias();
  const cartoes = useCartoes();
  const origem = useQuery({
    queryKey: ['movimentacao', idOrigem],
    queryFn: () => api<Detalhe>(`/movimentacoes/${idOrigem}`),
    enabled: Boolean(idOrigem),
  });
  const despesaOriginal = useQuery({
    queryKey: ['movimentacao', reembolsoId],
    queryFn: () => api<Detalhe>(`/movimentacoes/${reembolsoId}`),
    enabled: Boolean(reembolsoId),
  });

  const erro = contas.error ?? categorias.error ?? cartoes.error ?? origem.error ?? despesaOriginal.error;
  if (erro) return <ErroDeTela erro={erro} />;
  if (
    !contas.data || !categorias.data || !cartoes.data ||
    (idOrigem && !origem.data) || (reembolsoId && !despesaOriginal.data)
  ) {
    return <Carregando />;
  }
  if (contas.data.itens.filter((c) => !c.arquivada).length === 0) {
    return (
      <Pagina titulo="Novo lançamento">
        <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
          <p>Antes de lançar, crie uma conta.</p>
          <Button asChild>
            <Link to="/app/contas">Ir para Contas</Link>
          </Button>
        </div>
      </Pagina>
    );
  }

  return (
    <Formulario
      key={`${idOrigem ?? 'novo'}-${origem.dataUpdatedAt}-${reembolsoId ?? ''}`}
      origem={origem.data}
      duplicando={!id && Boolean(duplicarId)}
      reembolsoDe={despesaOriginal.data}
      temCartoes={cartoes.data.itens.some((c) => !c.arquivado)}
      contas={contas.data.itens}
      categorias={categorias.data.itens}
      fuso={sessao?.fuso}
    />
  );
}
