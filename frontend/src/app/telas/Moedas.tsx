import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CODIGOS_DE_MOEDA,
  MOEDAS,
  OPERACOES_COM_CONTA,
  ROTULOS_DE_OPERACAO_MOEDA,
  TIPOS_DE_OPERACAO_MOEDA,
  formatarMoeda,
  formatarTaxa,
  parseTaxa,
} from '../../../../contratos/moedas.js';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { useContas, useInvalidarDados } from '@/lib/dados';
import { formatarData, hojeIso } from '@/lib/datas';
import { useOcultarValores } from '@/lib/ocultar-valores';
import { useSessao } from '@/lib/sessao';
import { BotoesDoFormulario, camposDe, ErroGeral, geralDe } from './comumFormulario';

type CodigoDeMoeda = keyof typeof MOEDAS;
type TipoDeOperacao = (typeof TIPOS_DE_OPERACAO_MOEDA)[number];

interface ContaMoedaDoServidor {
  id: number;
  nome: string;
  moeda: CodigoDeMoeda;
  encerrada: boolean;
  atualizado_em: string;
  saldo_centavos: number;
  valor_brl_centavos: number | null;
  cotacao: { taxa_micros: number; data: string } | null;
}

interface Cotacao {
  id: number;
  moeda: CodigoDeMoeda;
  data: string;
  taxa_micros: number;
}

interface Resposta {
  itens: ContaMoedaDoServidor[];
  cotacoes: Cotacao[];
  totais: { valor_brl_centavos: number; com_cotacao: number; sem_cotacao: number } | null;
}

/** Valor na moeda da conta. Só formata; respeita "Valores ocultos". */
function ValorMoeda({ centavos, moeda }: { centavos: number; moeda: CodigoDeMoeda }) {
  const { oculto } = useOcultarValores();
  return <span className="font-semibold tabular-nums">{oculto ? `${moeda} ••••` : formatarMoeda(centavos, moeda)}</span>;
}

const OpcoesDeMoeda = () =>
  CODIGOS_DE_MOEDA.map((c) => (
    <option key={c} value={c}>
      {c} · {MOEDAS[c as CodigoDeMoeda]}
    </option>
  ));

function FormularioConta({ aoFechar }: { aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState('');
  const [moeda, setMoeda] = useState('USD');
  const [saldo, setSaldo] = useState<number | null>(0);
  const salvar = useMutation({
    mutationFn: () => api('/moedas/contas', { metodo: 'POST', corpo: { nome, moeda, saldo_inicial_centavos: saldo ?? 0, observacao: '' } }),
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
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Nova conta em moeda estrangeira</h2>
      <Campo id="moeda-nome" rotulo="Nome" erro={campos.nome}>
        <Input id="moeda-nome" value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo id="moeda-codigo" rotulo="Moeda" erro={campos.moeda}>
        <Select id="moeda-codigo" value={moeda} onChange={(e) => setMoeda(e.target.value)}>
          <OpcoesDeMoeda />
        </Select>
      </Campo>
      <CampoValor id="moeda-saldo" rotulo={`Saldo inicial em ${moeda} (opcional)`} aoMudar={setSaldo} erro={campos.saldo_inicial_centavos} />
      <ErroGeral texto={geralDe(salvar.error)} />
      <BotoesDoFormulario enviar="Salvar" desabilitado={salvar.isPending || !nome.trim()} cancelar={aoFechar} />
    </form>
  );
}

function FormularioOperacao({ conta, fuso, aoFechar }: { conta: ContaMoedaDoServidor; fuso: string | undefined; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const contas = useContas();
  const [tipo, setTipo] = useState<string>('deposito');
  const [valor, setValor] = useState<number | null>(null);
  const [valorBrl, setValorBrl] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso(fuso));
  const [contaId, setContaId] = useState('');
  const comConta = (OPERACOES_COM_CONTA as readonly string[]).includes(tipo);
  const registrar = useMutation({
    mutationFn: () =>
      api(`/moedas/contas/${conta.id}/operacoes`, {
        metodo: 'POST',
        corpo: {
          tipo,
          valor_centavos: valor ?? 0,
          valor_brl_centavos: comConta ? (valorBrl ?? null) : null,
          data,
          conta_id: comConta && contaId ? Number(contaId) : null,
          observacao: '',
        },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = camposDe(registrar.error);
  const ativas = (contas.data?.itens ?? []).filter((c) => !c.arquivada);
  const sufixo = String(conta.id);
  return (
    <form
      noValidate
      className="space-y-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        registrar.mutate();
      }}
    >
      <Campo id={`mop-tipo-${sufixo}`} rotulo="Operação" erro={campos.tipo}>
        <Select id={`mop-tipo-${sufixo}`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_DE_OPERACAO_MOEDA.map((t) => (
            <option key={t} value={t}>
              {ROTULOS_DE_OPERACAO_MOEDA[t]}
            </option>
          ))}
        </Select>
      </Campo>
      <CampoValor id={`mop-valor-${sufixo}`} rotulo={`Valor em ${conta.moeda}`} aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      {comConta ? (
        <>
          <CampoValor
            id={`mop-brl-${sufixo}`}
            rotulo={tipo === 'compra' ? 'Quanto você pagou, em reais' : 'Quanto você recebeu, em reais'}
            aoMudar={setValorBrl}
            erro={campos.valor_brl_centavos}
          />
          <Campo id={`mop-conta-${sufixo}`} rotulo={tipo === 'compra' ? 'Sai de qual conta?' : 'Cai em qual conta?'} erro={campos.conta_id}>
            <Select id={`mop-conta-${sufixo}`} value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">Escolha a conta</option>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
        </>
      ) : null}
      <Campo id={`mop-data-${sufixo}`} rotulo="Data" erro={campos.data}>
        <Input id={`mop-data-${sufixo}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
      </Campo>
      <ErroGeral texto={geralDe(registrar.error)} />
      <BotoesDoFormulario
        enviar="Registrar"
        desabilitado={registrar.isPending || !valor || (comConta && (!valorBrl || !contaId))}
        cancelar={aoFechar}
      />
    </form>
  );
}

function Historico({ contaId }: { contaId: number }) {
  const invalidar = useInvalidarDados();
  const detalhe = useQuery({
    queryKey: ['moeda', contaId],
    queryFn: () =>
      api<{
        moeda: CodigoDeMoeda;
        operacoes: { id: number; tipo: TipoDeOperacao; data: string; valor_centavos: number; taxa_micros: number | null; conta_nome: string | null }[];
      }>(`/moedas/contas/${contaId}`),
  });
  const remover = useMutation({
    mutationFn: (id: number) => api(`/moedas/contas/${contaId}/operacoes/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  if (detalhe.error) return <ErroDeTela erro={detalhe.error} />;
  if (!detalhe.data) return <Carregando />;
  const { operacoes, moeda } = detalhe.data;
  return (
    <div className="space-y-2 border-t pt-3">
      <h3 className="font-semibold">Operações</h3>
      {operacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma operação ainda.</p>
      ) : (
        <ul className="divide-y">
          {operacoes.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {ROTULOS_DE_OPERACAO_MOEDA[o.tipo]} em {formatarData(o.data)}
                {o.conta_nome ? `, ${o.tipo === 'compra' ? 'saiu de' : 'caiu em'} ${o.conta_nome}` : ''}
                {o.taxa_micros != null ? (
                  <span className="text-sm text-muted-foreground">
                    {' '}
                    · R$ {formatarTaxa(o.taxa_micros)} por {moeda}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <ValorMoeda centavos={o.valor_centavos} moeda={moeda} />
                <Button
                  variant="outline"
                  disabled={remover.isPending}
                  aria-label={`Remover ${ROTULOS_DE_OPERACAO_MOEDA[o.tipo].toLowerCase()} de ${formatarData(o.data)}`}
                  onClick={() => remover.mutate(o.id)}
                >
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

function ContaMoeda({ conta, fuso }: { conta: ContaMoedaDoServidor; fuso: string | undefined }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState<'operacao' | 'historico' | null>(null);
  const excluir = useMutation({ mutationFn: () => api(`/moedas/contas/${conta.id}`, { metodo: 'DELETE' }), onSuccess: invalidar });
  return (
    <li className="space-y-2 rounded-lg border bg-card p-4">
      <div>
        <strong>{conta.nome}</strong>
        {conta.encerrada ? <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium">Encerrada</span> : null}
        <p className="text-sm text-muted-foreground">
          {conta.moeda} · {MOEDAS[conta.moeda]}
        </p>
      </div>
      <p>
        Saldo <ValorMoeda centavos={conta.saldo_centavos} moeda={conta.moeda} />
      </p>
      {conta.cotacao && conta.valor_brl_centavos != null ? (
        <p className="text-sm text-muted-foreground">
          Em reais <Valor centavos={conta.valor_brl_centavos} /> · cotação R$ {formatarTaxa(conta.cotacao.taxa_micros)} de {formatarData(conta.cotacao.data)}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Sem cotação de {conta.moeda}: informe uma abaixo para ver o valor em reais.</p>
      )}
      {modo === 'operacao' ? <FormularioOperacao conta={conta} fuso={fuso} aoFechar={() => setModo(null)} /> : null}
      {modo === 'historico' ? <Historico contaId={conta.id} /> : null}
      <p className="text-sm text-muted-foreground">Só dá para excluir conta sem operações. Para encerrar uma que já teve movimento, saque ou venda todo o saldo.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setModo('operacao')}>Registrar operação</Button>
        <Button variant="outline" aria-pressed={modo === 'historico'} onClick={() => setModo(modo === 'historico' ? null : 'historico')}>
          Histórico
        </Button>
        <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      </div>
      <ErroDeAcao erro={excluir.error} />
    </li>
  );
}

function Cotacoes({ cotacoes, fuso }: { cotacoes: Cotacao[]; fuso: string | undefined }) {
  const invalidar = useInvalidarDados();
  const [moeda, setMoeda] = useState('USD');
  const [taxa, setTaxa] = useState('');
  const [data, setData] = useState(hojeIso(fuso));
  const micros = taxa.trim() === '' ? null : (parseTaxa(taxa) as number | null);
  const registrar = useMutation({
    mutationFn: () => api('/moedas/cotacoes', { metodo: 'POST', corpo: { moeda, data, taxa_micros: micros } }),
    onSuccess: async () => {
      setTaxa('');
      await invalidar();
    },
  });
  const remover = useMutation({ mutationFn: (id: number) => api(`/moedas/cotacoes/${id}`, { metodo: 'DELETE' }), onSuccess: invalidar });
  const campos = camposDe(registrar.error);
  const mensagem = taxa.trim() !== '' && micros == null ? 'Cotação inválida. Exemplo: 5,4321' : campos.taxa_micros;
  return (
    <section className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Cotações</h2>
      <p className="text-sm text-muted-foreground">
        Quantos reais vale 1 unidade da moeda, como você viu no banco ou na casa de câmbio. O app não busca cotação sozinho.
      </p>
      <form
        noValidate
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          registrar.mutate();
        }}
      >
        <Campo id="cot-moeda" rotulo="Moeda">
          <Select id="cot-moeda" value={moeda} onChange={(e) => setMoeda(e.target.value)}>
            <OpcoesDeMoeda />
          </Select>
        </Campo>
        <Campo id="cot-taxa" rotulo={`Reais por 1 ${moeda}`} erro={mensagem}>
          <Input id="cot-taxa" type="text" inputMode="decimal" autoComplete="off" placeholder="5,4321" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
        </Campo>
        <Campo id="cot-data" rotulo="Data" erro={campos.data}>
          <Input id="cot-data" type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <ErroGeral texto={geralDe(registrar.error)} />
        <Button type="submit" disabled={registrar.isPending || micros == null}>
          Registrar cotação
        </Button>
      </form>
      {cotacoes.length > 0 ? (
        <ul className="divide-y">
          {cotacoes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {c.moeda} em {formatarData(c.data)}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">R$ {formatarTaxa(c.taxa_micros)}</span>
                <Button variant="outline" disabled={remover.isPending} aria-label={`Remover cotação de ${c.moeda} de ${formatarData(c.data)}`} onClick={() => remover.mutate(c.id)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ErroDeAcao erro={remover.error} />
    </section>
  );
}

export default function Moedas() {
  const { sessao } = useSessao();
  const lista = useQuery({ queryKey: ['moedas'], queryFn: () => api<Resposta>('/moedas') });
  const [criando, setCriando] = useState(false);
  if (lista.error) return <ErroDeTela erro={lista.error} aoTentar={() => void lista.refetch()} />;
  if (!lista.data) return <Carregando />;
  const { itens, cotacoes, totais } = lista.data;
  const fuso = sessao?.fuso;

  return (
    <Pagina titulo="Moedas" acao={criando ? null : <Button onClick={() => setCriando(true)}>Nova conta em moeda</Button>}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Dinheiro em outra moeda fica em contas próprias, com saldo na própria moeda. Comprar ou vender moeda mexe na conta em reais, mas não é
        despesa nem receita. Lançamentos, orçamento e relatórios continuam só em reais.
      </p>
      {totais ? (
        <div className="max-w-xl space-y-1 rounded-lg border bg-card p-4">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Em reais</h2>
          {totais.com_cotacao > 0 ? (
            <p className="font-display text-4xl font-black tracking-tight">
              <Valor centavos={totais.valor_brl_centavos} />
            </p>
          ) : null}
          {totais.sem_cotacao > 0 ? (
            <p className="text-sm text-muted-foreground">
              {totais.sem_cotacao} {totais.sem_cotacao === 1 ? 'conta está' : 'contas estão'} sem cotação e
              {totais.sem_cotacao === 1 ? ' fica' : ' ficam'} fora deste valor e do patrimônio.
            </p>
          ) : null}
        </div>
      ) : null}
      {criando ? <FormularioConta aoFechar={() => setCriando(false)} /> : null}
      {itens.length === 0 ? (
        criando ? null : <Vazio titulo="Nenhuma conta em moeda estrangeira.">Dólar de viagem, euro guardado: cadastre a conta, registre compras e informe a cotação.</Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {itens.map((c) => (
            <ContaMoeda key={`${c.id}-${c.atualizado_em}-${c.saldo_centavos}`} conta={c} fuso={fuso} />
          ))}
        </ul>
      )}
      <Cotacoes cotacoes={cotacoes} fuso={fuso} />
    </Pagina>
  );
}
