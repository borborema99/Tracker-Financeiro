import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FREQUENCIAS, ROTULOS_FREQUENCIA } from '../../../../contratos/recorrencias.js';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ErroApi } from '@/lib/api';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados, type Categoria, type Conta } from '@/lib/dados';
import { hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';
import type { Recorrencia } from './Recorrencias';

const VOLTAR_PARA = '/app/recorrencias';
const VOLTAR_PARA_ASSINATURAS = '/app/assinaturas';

function Formulario({ edicao, contas, categorias, fuso }: { edicao: Recorrencia | null; contas: Conta[]; categorias: Categoria[]; fuso: string | undefined }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const [tipo, setTipo] = useState<'despesa' | 'receita'>(edicao?.tipo ?? 'despesa');
  const [descricao, setDescricao] = useState(edicao?.descricao ?? '');
  const [valor, setValor] = useState<number | null>(edicao?.valor_centavos ?? null);
  const [contaId, setContaId] = useState(String(edicao?.conta_id ?? contas.find((c) => !c.arquivada)?.id ?? ''));
  const [categoriaId, setCategoriaId] = useState(edicao?.categoria_id ? String(edicao.categoria_id) : '');
  const [frequencia, setFrequencia] = useState<string>(edicao?.frequencia ?? 'mensal');
  const [inicio, setInicio] = useState(edicao?.data_inicio ?? hojeIso(fuso));
  const [fim, setFim] = useState(edicao?.data_fim ?? '');
  const [ativa, setAtiva] = useState(edicao?.ativa ?? true);
  const [observacao, setObservacao] = useState(edicao?.observacao ?? '');
  const [params] = useSearchParams();
  // Vem de "Nova assinatura" (?assinatura=1) ou da edição de uma que já é assinatura.
  const viaAssinaturas = edicao?.assinatura ?? params.get('assinatura') === '1';
  const [assinatura, setAssinatura] = useState(viaAssinaturas);

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === tipo && c.papel == null && (!c.arquivada || String(c.id) === categoriaId))
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const salvar = useMutation({
    mutationFn: () =>
      api(edicao ? `/recorrencias/${edicao.id}` : '/recorrencias', {
        metodo: edicao ? 'PUT' : 'POST',
        corpo: {
          tipo,
          descricao,
          valor_centavos: valor ?? 0,
          conta_id: Number(contaId),
          categoria_id: categoriaId ? Number(categoriaId) : null,
          frequencia,
          data_inicio: inicio,
          data_fim: fim || null,
          ativa,
          assinatura: tipo === 'despesa' && assinatura,
          observacao,
        },
      }),
    onSuccess: async () => {
      await invalidar();
      navegar(tipo === 'despesa' && assinatura ? VOLTAR_PARA_ASSINATURAS : VOLTAR_PARA);
    },
  });
  const cancelarPara = viaAssinaturas ? VOLTAR_PARA_ASSINATURAS : VOLTAR_PARA;
  const campos = salvar.error instanceof ErroApi ? (salvar.error.campos ?? {}) : {};
  const geral = salvar.error && !(salvar.error instanceof ErroApi && salvar.error.campos) ? salvar.error.message : null;

  return (
    <Pagina titulo={edicao ? 'Editar recorrência' : 'Nova recorrência'}>
      <form
        noValidate
        className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div role="group" aria-label="Tipo" className="grid grid-cols-2 gap-2">
          {([['despesa', 'Despesa'], ['receita', 'Receita']] as const).map(([t, rotulo]) => (
            <Button
              key={t}
              type="button"
              variant={tipo === t ? 'default' : 'outline'}
              aria-pressed={tipo === t}
              onClick={() => {
                setTipo(t);
                setCategoriaId('');
              }}
            >
              {rotulo}
            </Button>
          ))}
        </div>
        <Campo id="rec-descricao" rotulo="Descrição" erro={campos.descricao}>
          <Input id="rec-descricao" value={descricao} maxLength={200} autoFocus={!edicao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <CampoValor id="rec-valor" rotulo="Valor de cada ocorrência" inicial={edicao?.valor_centavos ?? null} aoMudar={setValor} erro={campos.valor_centavos} />
        <Campo id="rec-conta" rotulo="Conta" erro={campos.conta_id}>
          <Select id="rec-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas
              .filter((c) => !c.arquivada || c.id === edicao?.conta_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Select>
        </Campo>
        <Campo id="rec-categoria" rotulo="Categoria" erro={campos.categoria_id}>
          <Select id="rec-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {opcoesCategoria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="rec-frequencia" rotulo="Frequência" erro={campos.frequencia}>
          <Select id="rec-frequencia" value={frequencia} onChange={(e) => setFrequencia(e.target.value)}>
            {FREQUENCIAS.map((f) => (
              <option key={f} value={f}>
                {ROTULOS_FREQUENCIA[f]}
              </option>
            ))}
          </Select>
        </Campo>
        {frequencia === 'mensal' ? (
          <p className="text-sm text-muted-foreground">Em meses sem o dia escolhido (ex.: 31), vale o último dia do mês.</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="rec-inicio" rotulo="Primeira ocorrência" erro={campos.data_inicio}>
            <Input id="rec-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo id="rec-fim" rotulo="Até (opcional)" erro={campos.data_fim}>
            <Input id="rec-fim" type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} />
          </Campo>
        </div>
        {inicio < hojeIso(fuso) && !edicao ? (
          <p className="text-sm text-muted-foreground">
            A data de início já passou: as ocorrências de lá até hoje entram como pendentes e atrasadas, para você dar baixa ou
            apagar.
          </p>
        ) : null}
        <Campo id="rec-obs" rotulo="Observação" erro={campos.observacao}>
          <Textarea id="rec-obs" rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Campo>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          <span>Ativa (gera novas ocorrências)</span>
        </label>
        {tipo === 'despesa' ? (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5" checked={assinatura} onChange={(e) => setAssinatura(e.target.checked)} />
            <span>É uma assinatura (aparece em Assinaturas, com o custo por mês e por ano)</span>
          </label>
        ) : null}
        {edicao ? (
          <p className="text-sm text-muted-foreground">
            Mudanças valem daqui para frente: as ocorrências pendentes futuras são refeitas; o que já venceu ou foi liquidado não
            muda.
          </p>
        ) : null}
        {geral ? <p role="alert" className="text-sm font-medium text-destructive">{geral}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvar.isPending || valor == null || !contaId}>
            Salvar
          </Button>
          <Button asChild variant="ghost">
            <Link to={cancelarPara}>Cancelar</Link>
          </Button>
        </div>
      </form>
    </Pagina>
  );
}

/** Rotas `/app/recorrencias/nova` e `/app/recorrencias/:id`. */
export default function FormularioRecorrencia() {
  const { id } = useParams();
  const { sessao } = useSessao();
  const contas = useContas();
  const categorias = useCategorias();
  const origem = useQuery({ queryKey: ['recorrencia', id], queryFn: () => api<Recorrencia>(`/recorrencias/${id}`), enabled: Boolean(id) });

  const erro = contas.error ?? categorias.error ?? origem.error;
  if (erro) return <ErroDeTela erro={erro} />;
  if (!contas.data || !categorias.data || (id && !origem.data)) return <Carregando />;
  if (contas.data.itens.filter((c) => !c.arquivada).length === 0) {
    return (
      <Pagina titulo="Nova recorrência">
        <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
          <p>Para cadastrar uma recorrência, crie uma conta.</p>
          <Button asChild>
            <Link to="/app/contas">Ir para Contas</Link>
          </Button>
        </div>
      </Pagina>
    );
  }
  return <Formulario key={id ?? 'nova'} edicao={id ? (origem.data ?? null) : null} contas={contas.data.itens} categorias={categorias.data.itens} fuso={sessao?.fuso} />;
}
