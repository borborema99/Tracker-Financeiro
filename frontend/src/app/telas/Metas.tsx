import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import { useInvalidarDados, type Lista } from '@/lib/dados';
import { formatarData, hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';

type Situacao = 'em_andamento' | 'concluida' | 'atrasada';

interface MetaDoServidor {
  id: number;
  nome: string;
  valor_alvo_centavos: number;
  prazo: string | null;
  observacao: string;
  atualizada_em: string;
  situacao: Situacao;
  percentual: number;
  acumulado_centavos: number;
  falta_centavos: number;
  necessario_por_mes_centavos: number | null;
  meses_restantes: number | null;
}

const ROTULO_SITUACAO: Record<Situacao, string> = { em_andamento: 'Em andamento', concluida: 'Concluída', atrasada: 'Prazo vencido' };
const COR_DO_MEDIDOR: Record<Situacao, string> = { em_andamento: 'text-primary', concluida: 'text-entrada', atrasada: 'text-saida' };

const camposDe = (erro: Error | null) => (erro instanceof ErroApi ? (erro.campos ?? {}) : {});
const geralDe = (erro: Error | null) => (erro && !(erro instanceof ErroApi && erro.campos) ? erro.message : null);
const Erro = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm font-medium text-destructive">{texto}</p> : null);

function FormularioMeta({ origem, aoFechar }: { origem: MetaDoServidor | null; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const sufixo = origem?.id ?? 'nova';
  const [nome, setNome] = useState(origem?.nome ?? '');
  const [valor, setValor] = useState<number | null>(origem?.valor_alvo_centavos ?? null);
  const [prazo, setPrazo] = useState(origem?.prazo ?? '');
  const [observacao, setObservacao] = useState(origem?.observacao ?? '');
  const salvar = useMutation({
    mutationFn: () =>
      api(origem ? `/metas/${origem.id}` : '/metas', {
        metodo: origem ? 'PUT' : 'POST',
        corpo: { nome, valor_alvo_centavos: valor ?? 0, prazo: prazo || null, observacao },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = camposDe(salvar.error);

  return (
    <form
      noValidate
      className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{origem ? 'Editar meta' : 'Nova meta'}</h2>
      <Campo id={`meta-nome-${sufixo}`} rotulo="Nome" erro={campos.nome}>
        <Input id={`meta-nome-${sufixo}`} value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <CampoValor id={`meta-valor-${sufixo}`} rotulo="Valor que quero juntar" inicial={origem?.valor_alvo_centavos ?? null} aoMudar={setValor} erro={campos.valor_alvo_centavos} />
      <Campo id={`meta-prazo-${sufixo}`} rotulo="Prazo (opcional)" erro={campos.prazo}>
        <Input id={`meta-prazo-${sufixo}`} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
      </Campo>
      <Campo id={`meta-obs-${sufixo}`} rotulo="Observação" erro={campos.observacao}>
        <Textarea id={`meta-obs-${sufixo}`} rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>
      <Erro texto={geralDe(salvar.error)} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending || !nome.trim() || valor == null || valor === 0}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FormularioAporte({ meta, tipo, fuso, aoFechar }: { meta: MetaDoServidor; tipo: 'aporte' | 'resgate'; fuso: string | undefined; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso(fuso));
  const registrar = useMutation({
    mutationFn: () => api(`/metas/${meta.id}/aportes`, { metodo: 'POST', corpo: { tipo, valor_centavos: valor ?? 0, data, observacao: '' } }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = camposDe(registrar.error);
  return (
    <form
      noValidate
      className="space-y-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        registrar.mutate();
      }}
    >
      <CampoValor id={`ap-${meta.id}-${tipo}`} rotulo={tipo === 'aporte' ? 'Valor guardado' : 'Valor retirado'} aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      <Campo id={`ap-data-${meta.id}-${tipo}`} rotulo="Data" erro={campos.data}>
        <Input id={`ap-data-${meta.id}-${tipo}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <Erro texto={geralDe(registrar.error)} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={registrar.isPending || valor == null || valor === 0}>
          {tipo === 'aporte' ? 'Registrar aporte' : 'Registrar resgate'}
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Movimentos({ metaId }: { metaId: number }) {
  const invalidar = useInvalidarDados();
  const detalhe = useQuery({
    queryKey: ['meta', metaId],
    queryFn: () => api<{ aportes: { id: number; tipo: 'aporte' | 'resgate'; data: string; valor_centavos: number }[] }>(`/metas/${metaId}`),
  });
  const remover = useMutation({
    mutationFn: (aporteId: number) => api(`/metas/${metaId}/aportes/${aporteId}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  if (detalhe.error) return <ErroDeTela erro={detalhe.error} />;
  if (!detalhe.data) return <Carregando />;
  const { aportes } = detalhe.data;
  return (
    <div className="border-t pt-3">
      {aportes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum aporte ainda.</p>
      ) : (
        <ul className="divide-y">
          {aportes.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{a.tipo === 'aporte' ? 'Aporte' : 'Resgate'} em {formatarData(a.data)}</span>
              <span className="flex items-center gap-2">
                <Valor centavos={a.valor_centavos} tipo={a.tipo === 'aporte' ? 'entrada' : 'saida'} />
                <Button variant="outline" disabled={remover.isPending} aria-label={`Remover ${a.tipo} de ${formatarData(a.data)}`} onClick={() => remover.mutate(a.id)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErroDeAcao erro={remover.error} />
    </div>
  );
}

function Meta({ meta, fuso }: { meta: MetaDoServidor; fuso: string | undefined }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState<'aporte' | 'resgate' | 'editar' | 'movimentos' | null>(null);
  const excluir = useMutation({ mutationFn: () => api(`/metas/${meta.id}`, { metodo: 'DELETE' }), onSuccess: invalidar });
  const fechar = () => setModo(null);

  if (modo === 'editar') return <li><FormularioMeta origem={meta} aoFechar={fechar} /></li>;
  return (
    <li className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong>{meta.nome}</strong>
          <span className={`ml-2 rounded-sm px-1.5 py-0.5 text-xs font-medium ${meta.situacao === 'atrasada' ? 'bg-saida text-background' : 'bg-muted'}`}>{ROTULO_SITUACAO[meta.situacao]}</span>
          {meta.prazo ? <p className="text-sm text-muted-foreground">Prazo: {formatarData(meta.prazo)}</p> : null}
        </div>
        <span className="text-sm text-muted-foreground">{meta.percentual}%</span>
      </div>
      <progress className={`medidor ${COR_DO_MEDIDOR[meta.situacao]}`} max={100} value={Math.min(meta.percentual, 100)} aria-label={`${meta.percentual}% da meta ${meta.nome}`} />
      <p>
        Guardado <Valor centavos={meta.acumulado_centavos} tipo="entrada" /> de <Valor centavos={meta.valor_alvo_centavos} />
      </p>
      {meta.situacao !== 'concluida' ? <p>Falta <Valor centavos={meta.falta_centavos} /></p> : null}
      {meta.necessario_por_mes_centavos != null ? (
        <p className="text-sm text-muted-foreground">
          Para chegar no prazo: <Valor centavos={meta.necessario_por_mes_centavos} /> por mês, em {meta.meses_restantes} {meta.meses_restantes === 1 ? 'mês' : 'meses'}.
        </p>
      ) : null}
      {meta.observacao ? <p className="text-sm text-muted-foreground">{meta.observacao}</p> : null}

      {modo === 'aporte' || modo === 'resgate' ? <FormularioAporte meta={meta} tipo={modo} fuso={fuso} aoFechar={fechar} /> : null}
      {modo === 'movimentos' ? <Movimentos metaId={meta.id} /> : null}
      <p className="text-sm text-muted-foreground">Excluir a meta não mexe em nenhuma conta. O histórico fica registrado.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setModo('aporte')}>Guardar</Button>
        <Button variant="outline" disabled={meta.acumulado_centavos <= 0} onClick={() => setModo('resgate')}>
          Retirar
        </Button>
        <Button variant="outline" aria-pressed={modo === 'movimentos'} onClick={() => setModo(modo === 'movimentos' ? null : 'movimentos')}>
          Movimentos
        </Button>
        <Button variant="outline" onClick={() => setModo('editar')}>
          Editar
        </Button>
        <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      </div>
      <ErroDeAcao erro={excluir.error} />
    </li>
  );
}

export default function Metas() {
  const { sessao } = useSessao();
  const lista = useQuery({ queryKey: ['metas'], queryFn: () => api<Lista<MetaDoServidor>>('/metas') });
  const [criando, setCriando] = useState(false);
  if (lista.error) return <ErroDeTela erro={lista.error} aoTentar={() => void lista.refetch()} />;
  if (!lista.data) return <Carregando />;

  return (
    <Pagina titulo="Metas" acao={criando ? null : <Button onClick={() => setCriando(true)}>Nova meta</Button>}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Uma meta é uma reserva de controle: guardar numa meta não tira dinheiro de nenhuma conta nem entra como despesa. O dinheiro
        continua onde está; aqui você só acompanha quanto já separou.
      </p>
      {criando ? <FormularioMeta origem={null} aoFechar={() => setCriando(false)} /> : null}
      {lista.data.itens.length === 0 ? (
        criando ? null : (
          <Vazio titulo="Nenhuma meta cadastrada.">Reserva de emergência, viagem, troca de carro: defina o valor e acompanhe o progresso.</Vazio>
        )
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.data.itens.map((m) => (
            <Meta key={`${m.id}-${m.atualizada_em}`} meta={m} fuso={sessao?.fuso} />
          ))}
        </ul>
      )}
    </Pagina>
  );
}
