import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import { porId, useContas, useInvalidarDados, type Conta, type StatusDaFatura } from '@/lib/dados';
import { formatarData, hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';
import { LinhaDeLista, rotuloFatura, StatusFatura } from './cartoesComum';

const CHAVE_ULTIMA_CONTA = 'tracker.ultimaConta';

function ultimaContaUsada(): number {
  try {
    return Number(localStorage.getItem(CHAVE_ULTIMA_CONTA));
  } catch {
    return 0;
  }
}

interface FaturaCompleta {
  id: number;
  referencia: string;
  data_fechamento: string;
  data_vencimento: string;
  status: StatusDaFatura;
  cartao: { id: number; nome: string; conta_pagamento_id: number | null };
  bruto_centavos: number;
  credito_centavos: number;
  total_centavos: number;
  pago_centavos: number;
  saldo_centavos: number;
  credito_a_transportar_centavos: number;
  parcelas: { compra_id: number; numero: number; parcelas_total: number; descricao: string; data_compra: string; valor_centavos: number }[];
  estornos: { id: number; compra_id: number; descricao: string; compra_descricao: string; data_estorno: string; valor_centavos: number }[];
  pagamentos: { id: number; conta_id: number; data_pagamento: string; valor_centavos: number }[];
}

const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{titulo}</h2>
    <div className="rounded-lg border bg-card px-4 py-1">{children}</div>
  </section>
);

function Pagar({ fatura, contas, fuso }: { fatura: FaturaCompleta; contas: Conta[]; fuso: string | undefined }) {
  const invalidar = useInvalidarDados();
  const ativas = contas.filter((c) => !c.arquivada);
  const padrao =
    ativas.find((c) => c.id === fatura.cartao.conta_pagamento_id) ?? ativas.find((c) => c.id === ultimaContaUsada()) ?? ativas[0];
  const [valor, setValor] = useState<number | null>(fatura.saldo_centavos);
  const [contaId, setContaId] = useState(String(padrao?.id ?? ''));
  const [data, setData] = useState(hojeIso(fuso));

  const pagar = useMutation({
    mutationFn: () =>
      api(`/faturas/${fatura.id}/pagamentos`, {
        metodo: 'POST',
        corpo: { valor_centavos: valor ?? 0, conta_id: Number(contaId), data_pagamento: data },
      }),
    onSuccess: invalidar,
  });
  const campos = pagar.error instanceof ErroApi ? (pagar.error.campos ?? {}) : {};
  const geral = pagar.error && !(pagar.error instanceof ErroApi && pagar.error.campos) ? pagar.error.message : null;

  if (ativas.length === 0) {
    return (
      <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
        <p>Para pagar a fatura, crie uma conta.</p>
        <Button asChild>
          <Link to="/app/contas">Ir para Contas</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        pagar.mutate();
      }}
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Pagar fatura</h2>
      <p className="text-sm text-muted-foreground">
        O valor sai da conta escolhida e abate a fatura. Não vira despesa nova: a compra já foi contada.
      </p>
      <CampoValor
        key={fatura.saldo_centavos}
        id="pagamento-valor"
        rotulo="Valor (o que falta pagar já vem preenchido)"
        inicial={fatura.saldo_centavos}
        aoMudar={setValor}
        erro={campos.valor_centavos}
      />
      <Campo id="pagamento-conta" rotulo="Pagar com a conta" erro={campos.conta_id}>
        <Select id="pagamento-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {ativas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="pagamento-data" rotulo="Data do pagamento" erro={campos.data_pagamento}>
        <Input id="pagamento-data" type="date" max={hojeIso(fuso)} value={data} onChange={(e) => setData(e.target.value)} />
      </Campo>
      {geral ? <p role="alert" className="text-sm font-medium text-destructive">{geral}</p> : null}
      <Button type="submit" disabled={pagar.isPending || valor == null || !contaId}>
        Pagar
      </Button>
    </form>
  );
}

function LinhaPagamento({ pagamento, contas }: { pagamento: FaturaCompleta['pagamentos'][number]; contas: Map<number, Conta> }) {
  const invalidar = useInvalidarDados();
  const excluir = useMutation({
    mutationFn: () => api(`/pagamentos-fatura/${pagamento.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  return (
    <LinhaDeLista
      direita={
        <>
          <Valor centavos={pagamento.valor_centavos} />
          <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
        </>
      }
    >
      <strong>Pagamento em {formatarData(pagamento.data_pagamento)}</strong>
      <p className="text-sm text-muted-foreground">Conta: {contas.get(pagamento.conta_id)?.nome ?? '—'}</p>
      <ErroDeAcao erro={excluir.error} />
    </LinhaDeLista>
  );
}

const Resumo = ({ rotulo, children, forte, pequeno }: { rotulo: string; children: React.ReactNode; forte?: boolean; pequeno?: boolean }) => (
  <p className={`flex justify-between gap-3 ${forte ? 'font-semibold' : ''} ${pequeno ? 'text-sm text-muted-foreground' : ''}`}>
    <span>{rotulo}</span>
    {children}
  </p>
);

export default function Fatura() {
  const { id } = useParams();
  const { sessao } = useSessao();
  const fatura = useQuery({ queryKey: ['fatura', id], queryFn: () => api<FaturaCompleta>(`/faturas/${id}`) });
  const contas = useContas();

  const erro = fatura.error ?? contas.error;
  if (erro) return <ErroDeTela erro={erro} />;
  if (!fatura.data || !contas.data) return <Carregando />;

  const f = fatura.data;
  const mapaContas = porId(contas.data.itens);
  return (
    <Pagina titulo={rotuloFatura(f.referencia)}>
      <p className="text-muted-foreground">
        <Link className="underline underline-offset-4" to={`/app/cartoes/${f.cartao.id}`}>
          {f.cartao.nome}
        </Link>{' '}
        · fecha em {formatarData(f.data_fechamento)} · vence em {formatarData(f.data_vencimento)} · <StatusFatura status={f.status} />
      </p>

      <div className="max-w-xl space-y-1 rounded-lg border bg-card p-4">
        <Resumo rotulo="Compras e parcelas">
          <Valor centavos={f.bruto_centavos} />
        </Resumo>
        {f.credito_centavos > 0 ? (
          <Resumo rotulo="Créditos de estorno">
            <Valor centavos={f.credito_centavos} tipo="entrada" />
          </Resumo>
        ) : null}
        <Resumo rotulo="Total da fatura" forte>
          <Valor centavos={f.total_centavos} tipo="saida" />
        </Resumo>
        <Resumo rotulo="Já pago">
          <Valor centavos={f.pago_centavos} />
        </Resumo>
        <Resumo rotulo="Falta pagar" forte>
          <Valor centavos={f.saldo_centavos} tipo="saida" />
        </Resumo>
        {f.credito_a_transportar_centavos > 0 ? (
          <Resumo rotulo="Sobra de crédito que segue para a próxima fatura" pequeno>
            <Valor centavos={f.credito_a_transportar_centavos} tipo="entrada" />
          </Resumo>
        ) : null}
      </div>

      <Secao titulo="Compras nesta fatura">
        {f.parcelas.length === 0 ? (
          <Vazio titulo="Nenhuma compra nesta fatura." />
        ) : (
          <ul className="divide-y">
            {f.parcelas.map((p) => (
              <LinhaDeLista key={`${p.compra_id}-${p.numero}`} direita={<Valor centavos={p.valor_centavos} tipo="saida" />}>
                <Link className="underline underline-offset-4" to={`/app/cartoes/compras/${p.compra_id}`}>
                  <strong>{p.descricao || 'Compra no cartão'}</strong>
                </Link>
                <p className="text-sm text-muted-foreground">
                  {p.parcelas_total > 1 ? `Parcela ${p.numero} de ${p.parcelas_total} · ` : ''}compra em {formatarData(p.data_compra)}
                </p>
              </LinhaDeLista>
            ))}
          </ul>
        )}
      </Secao>

      {f.estornos.length > 0 ? (
        <Secao titulo="Estornos (crédito)">
          <ul className="divide-y">
            {f.estornos.map((e) => (
              <LinhaDeLista key={e.id} direita={<Valor centavos={e.valor_centavos} tipo="entrada" />}>
                <Link className="underline underline-offset-4" to={`/app/cartoes/compras/${e.compra_id}`}>
                  <strong>{e.descricao || 'Estorno'}</strong>
                </Link>
                <p className="text-sm text-muted-foreground">
                  {e.compra_descricao || 'Compra no cartão'} · {formatarData(e.data_estorno)}
                </p>
              </LinhaDeLista>
            ))}
          </ul>
        </Secao>
      ) : null}

      {f.pagamentos.length > 0 ? (
        <Secao titulo="Pagamentos">
          <ul className="divide-y">
            {f.pagamentos.map((p) => (
              <LinhaPagamento key={p.id} pagamento={p} contas={mapaContas} />
            ))}
          </ul>
        </Secao>
      ) : null}

      {f.saldo_centavos > 0 ? <Pagar fatura={f} contas={contas.data.itens} fuso={sessao?.fuso} /> : null}
    </Pagina>
  );
}
