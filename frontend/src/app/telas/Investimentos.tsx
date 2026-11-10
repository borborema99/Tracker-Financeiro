import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ROTULOS_DE_INVESTIMENTO, TIPOS_DE_INVESTIMENTO } from '../../../../contratos/investimentos.js';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { useContas, useInvalidarDados } from '@/lib/dados';
import { formatarData, hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';
import { BotoesDoFormulario, camposDe, ErroGeral, geralDe } from './comumFormulario';

type TipoDeInvestimento = (typeof TIPOS_DE_INVESTIMENTO)[number];

interface InvestimentoDoServidor {
  id: number;
  nome: string;
  tipo: TipoDeInvestimento;
  instituicao: string;
  observacao: string;
  encerrado: boolean;
  atualizado_em: string;
  avaliado: boolean;
  avaliado_em: string | null;
  valor_atual_centavos: number;
  resultado_centavos: number;
  rentabilidade_percentual: number | null;
  aportado_centavos: number;
  resgatado_centavos: number;
}

interface Resposta {
  itens: InvestimentoDoServidor[];
  totais: { valor_atual_centavos: number; aportado_centavos: number; resultado_centavos: number | null; sem_avaliacao: number } | null;
}

const percentual = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const Erro = ErroGeral;
const Botoes = BotoesDoFormulario;

function FormularioInvestimento({ origem, aoFechar }: { origem: InvestimentoDoServidor | null; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const sufixo = origem?.id ?? 'novo';
  const [nome, setNome] = useState(origem?.nome ?? '');
  const [tipo, setTipo] = useState<string>(origem?.tipo ?? 'renda_fixa');
  const [instituicao, setInstituicao] = useState(origem?.instituicao ?? '');
  const [observacao, setObservacao] = useState(origem?.observacao ?? '');
  const salvar = useMutation({
    mutationFn: () =>
      api(origem ? `/investimentos/${origem.id}` : '/investimentos', {
        metodo: origem ? 'PUT' : 'POST',
        corpo: { nome, tipo, instituicao, observacao },
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
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{origem ? 'Editar investimento' : 'Novo investimento'}</h2>
      <Campo id={`inv-nome-${sufixo}`} rotulo="Nome" erro={campos.nome}>
        <Input id={`inv-nome-${sufixo}`} value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo id={`inv-tipo-${sufixo}`} rotulo="Tipo" erro={campos.tipo}>
        <Select id={`inv-tipo-${sufixo}`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_DE_INVESTIMENTO.map((t) => (
            <option key={t} value={t}>
              {ROTULOS_DE_INVESTIMENTO[t]}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id={`inv-inst-${sufixo}`} rotulo="Instituição (opcional)" erro={campos.instituicao}>
        <Input id={`inv-inst-${sufixo}`} value={instituicao} maxLength={120} onChange={(e) => setInstituicao(e.target.value)} />
      </Campo>
      <Campo id={`inv-obs-${sufixo}`} rotulo="Observação" erro={campos.observacao}>
        <Textarea id={`inv-obs-${sufixo}`} rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>
      <Erro texto={geralDe(salvar.error)} />
      <Botoes enviar="Salvar" desabilitado={salvar.isPending || !nome.trim()} cancelar={aoFechar} />
    </form>
  );
}

function FormularioOperacao({ investimento, tipo, fuso, aoFechar }: { investimento: InvestimentoDoServidor; tipo: 'aporte' | 'resgate'; fuso: string | undefined; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const contas = useContas();
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso(fuso));
  const [contaId, setContaId] = useState('');
  const registrar = useMutation({
    mutationFn: () =>
      api(`/investimentos/${investimento.id}/operacoes`, {
        metodo: 'POST',
        corpo: { tipo, valor_centavos: valor ?? 0, data, conta_id: contaId ? Number(contaId) : null, observacao: '' },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = camposDe(registrar.error);
  const ativas = (contas.data?.itens ?? []).filter((c) => !c.arquivada);
  const sufixo = `${investimento.id}-${tipo}`;
  return (
    <form
      noValidate
      className="space-y-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        registrar.mutate();
      }}
    >
      <CampoValor id={`op-valor-${sufixo}`} rotulo={tipo === 'aporte' ? 'Valor aplicado' : 'Valor resgatado'} aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      <Campo id={`op-data-${sufixo}`} rotulo="Data" erro={campos.data}>
        <Input id={`op-data-${sufixo}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <Campo id={`op-conta-${sufixo}`} rotulo={tipo === 'aporte' ? 'Sai de qual conta?' : 'Cai em qual conta?'} erro={campos.conta_id}>
        <Select id={`op-conta-${sufixo}`} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          <option value="">Nenhuma (não mexer no saldo de conta)</option>
          {ativas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </Campo>
      <Erro texto={geralDe(registrar.error)} />
      <Botoes enviar={tipo === 'aporte' ? 'Registrar aporte' : 'Registrar resgate'} desabilitado={registrar.isPending || valor == null || valor === 0} cancelar={aoFechar} />
    </form>
  );
}

function FormularioAvaliacao({ investimento, fuso, aoFechar }: { investimento: InvestimentoDoServidor; fuso: string | undefined; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso(fuso));
  const registrar = useMutation({
    mutationFn: () => api(`/investimentos/${investimento.id}/avaliacoes`, { metodo: 'POST', corpo: { data, valor_centavos: valor ?? 0 } }),
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
      <p className="text-sm text-muted-foreground">Informe quanto o investimento vale hoje, como aparece no extrato da corretora ou do banco.</p>
      <CampoValor id={`av-valor-${investimento.id}`} rotulo="Valor atual" aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      <Campo id={`av-data-${investimento.id}`} rotulo="Data da avaliação" erro={campos.data}>
        <Input id={`av-data-${investimento.id}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <Erro texto={geralDe(registrar.error)} />
      <Botoes enviar="Registrar valor" desabilitado={registrar.isPending || valor == null} cancelar={aoFechar} />
    </form>
  );
}

function Historico({ investimentoId }: { investimentoId: number }) {
  const invalidar = useInvalidarDados();
  const detalhe = useQuery({
    queryKey: ['investimento', investimentoId],
    queryFn: () =>
      api<{
        operacoes: { id: number; tipo: 'aporte' | 'resgate'; data: string; valor_centavos: number; conta_nome: string | null }[];
        avaliacoes: { id: number; data: string; valor_centavos: number }[];
      }>(`/investimentos/${investimentoId}`),
  });
  const removerOperacao = useMutation({
    mutationFn: (id: number) => api(`/investimentos/${investimentoId}/operacoes/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  const removerAvaliacao = useMutation({
    mutationFn: (id: number) => api(`/investimentos/${investimentoId}/avaliacoes/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  if (detalhe.error) return <ErroDeTela erro={detalhe.error} />;
  if (!detalhe.data) return <Carregando />;
  const { operacoes, avaliacoes } = detalhe.data;
  return (
    <div className="space-y-3 border-t pt-3">
      <h3 className="font-semibold">Aportes e resgates</h3>
      {operacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma operação ainda.</p>
      ) : (
        <ul className="divide-y">
          {operacoes.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {o.tipo === 'aporte' ? 'Aporte' : 'Resgate'} em {formatarData(o.data)}
                {o.conta_nome ? `, ${o.tipo === 'aporte' ? 'saiu de' : 'caiu em'} ${o.conta_nome}` : ''}
              </span>
              <span className="flex items-center gap-2">
                <Valor centavos={o.valor_centavos} />
                <Button variant="outline" disabled={removerOperacao.isPending} aria-label={`Remover ${o.tipo} de ${formatarData(o.data)}`} onClick={() => removerOperacao.mutate(o.id)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="font-semibold">Valores informados</h3>
      {avaliacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum valor informado. Sem ele, o investimento aparece pelo valor aplicado e não há resultado.</p>
      ) : (
        <ul className="divide-y">
          {avaliacoes.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>Em {formatarData(a.data)}</span>
              <span className="flex items-center gap-2">
                <Valor centavos={a.valor_centavos} />
                <Button variant="outline" disabled={removerAvaliacao.isPending} aria-label={`Remover valor de ${formatarData(a.data)}`} onClick={() => removerAvaliacao.mutate(a.id)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErroDeAcao erro={removerOperacao.error ?? removerAvaliacao.error} />
    </div>
  );
}

function Investimento({ investimento: inv, fuso }: { investimento: InvestimentoDoServidor; fuso: string | undefined }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState<'aporte' | 'resgate' | 'valor' | 'editar' | 'historico' | null>(null);
  const excluir = useMutation({ mutationFn: () => api(`/investimentos/${inv.id}`, { metodo: 'DELETE' }), onSuccess: invalidar });
  const fechar = () => setModo(null);

  if (modo === 'editar') return <li><FormularioInvestimento origem={inv} aoFechar={fechar} /></li>;
  return (
    <li className="space-y-2 rounded-lg border bg-card p-4">
      <div>
        <strong>{inv.nome}</strong>
        {inv.encerrado ? <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium">Encerrado</span> : null}
        <p className="text-sm text-muted-foreground">
          {ROTULOS_DE_INVESTIMENTO[inv.tipo]}
          {inv.instituicao ? `, ${inv.instituicao}` : ''}
        </p>
      </div>
      <p>
        {inv.avaliado ? 'Vale' : 'Aplicado'} <Valor centavos={inv.valor_atual_centavos} />
      </p>
      {inv.avaliado ? (
        <p>
          Resultado <Valor centavos={inv.resultado_centavos} tipo={inv.resultado_centavos >= 0 ? 'entrada' : 'saida'} />
          {inv.rentabilidade_percentual != null ? <span className="text-sm text-muted-foreground"> ({percentual(inv.rentabilidade_percentual)})</span> : null}
          <span className="text-sm text-muted-foreground"> · valor de {formatarData(inv.avaliado_em)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Sem valor informado: o resultado só aparece depois que você informar quanto vale.</p>
      )}
      <p className="text-sm text-muted-foreground">
        Aportado <Valor centavos={inv.aportado_centavos} />
        {inv.resgatado_centavos > 0 ? (
          <>
            {' '}· resgatado <Valor centavos={inv.resgatado_centavos} />
          </>
        ) : null}
      </p>
      {inv.observacao ? <p className="text-sm text-muted-foreground">{inv.observacao}</p> : null}

      {modo === 'aporte' || modo === 'resgate' ? <FormularioOperacao investimento={inv} tipo={modo} fuso={fuso} aoFechar={fechar} /> : null}
      {modo === 'valor' ? <FormularioAvaliacao investimento={inv} fuso={fuso} aoFechar={fechar} /> : null}
      {modo === 'historico' ? <Historico investimentoId={inv.id} /> : null}
      <p className="text-sm text-muted-foreground">
        Só dá para excluir investimento sem aportes nem resgates. Para encerrar um que já teve movimento, registre o resgate total.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setModo('aporte')}>Aportar</Button>
        <Button variant="outline" disabled={inv.valor_atual_centavos <= 0} onClick={() => setModo('resgate')}>
          Resgatar
        </Button>
        <Button variant="outline" onClick={() => setModo('valor')}>
          Informar valor
        </Button>
        <Button variant="outline" aria-pressed={modo === 'historico'} onClick={() => setModo(modo === 'historico' ? null : 'historico')}>
          Histórico
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

export default function Investimentos() {
  const { sessao } = useSessao();
  const lista = useQuery({ queryKey: ['investimentos'], queryFn: () => api<Resposta>('/investimentos') });
  const [criando, setCriando] = useState(false);
  if (lista.error) return <ErroDeTela erro={lista.error} aoTentar={() => void lista.refetch()} />;
  if (!lista.data) return <Carregando />;
  const { itens, totais } = lista.data;

  return (
    <Pagina titulo="Investimentos" acao={criando ? null : <Button onClick={() => setCriando(true)}>Novo investimento</Button>}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Carteira de controle manual: você registra os aportes, os resgates e, de tempos em tempos, quanto o investimento vale.
        Aporte e resgate com conta mexem no saldo dela, mas não são despesa nem receita. Não há cotação automática.
      </p>
      {totais ? (
        <div className="max-w-xl space-y-1 rounded-lg border bg-card p-4">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Carteira</h2>
          <p className="flex justify-between">Vale hoje <Valor centavos={totais.valor_atual_centavos} /></p>
          <p className="flex justify-between text-sm text-muted-foreground">Aportado no total <Valor centavos={totais.aportado_centavos} /></p>
          {totais.resultado_centavos != null ? (
            <p className="flex justify-between">
              Resultado dos que têm valor informado
              <Valor centavos={totais.resultado_centavos} tipo={totais.resultado_centavos >= 0 ? 'entrada' : 'saida'} />
            </p>
          ) : null}
          {totais.sem_avaliacao > 0 ? (
            <p className="text-sm text-muted-foreground">
              {totais.sem_avaliacao} {totais.sem_avaliacao === 1 ? 'investimento está' : 'investimentos estão'} sem valor informado e
              {totais.sem_avaliacao === 1 ? ' entra' : ' entram'} pelo valor aplicado.
            </p>
          ) : null}
        </div>
      ) : null}
      {criando ? <FormularioInvestimento origem={null} aoFechar={() => setCriando(false)} /> : null}
      {itens.length === 0 ? (
        criando ? null : <Vazio titulo="Nenhum investimento cadastrado.">Tesouro, CDB, ações, fundos: cadastre, registre os aportes e acompanhe o resultado.</Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {itens.map((i) => (
            <Investimento key={`${i.id}-${i.atualizado_em}-${i.valor_atual_centavos}`} investimento={i} fuso={sessao?.fuso} />
          ))}
        </ul>
      )}
    </Pagina>
  );
}
