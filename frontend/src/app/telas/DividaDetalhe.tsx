import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { Carregando, ErroDeAcao, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import { useContas, useInvalidarDados } from '@/lib/dados';
import { formatarData } from '@/lib/datas';
import { EtiquetaDeDivida, ResumoDeDivida, type DividaDoServidor } from './Dividas';

interface Parcela {
  lancamento_id: number;
  numero: number;
  valor_centavos: number;
  data_vencimento: string;
  data_liquidacao: string | null;
  status: 'pendente' | 'liquidada';
  situacao: 'atrasada' | 'vence_hoje' | 'a_vencer';
}

function LinhaDeParcela({ p }: { p: Parcela }) {
  const invalidar = useInvalidarDados();
  const pagar = useMutation({
    mutationFn: () => api(`/movimentacoes/${p.lancamento_id}/liquidar`, { metodo: 'POST', corpo: {} }),
    onSuccess: invalidar,
  });
  const paga = p.status === 'liquidada';
  const rotulo = paga
    ? `Paga em ${formatarData(p.data_liquidacao)}`
    : p.situacao === 'atrasada'
      ? 'Atrasada'
      : p.situacao === 'vence_hoje'
        ? 'Vence hoje'
        : 'A vencer';
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div>
        <strong>Parcela {p.numero}</strong>
        <span className={`ml-2 rounded-sm px-1.5 py-0.5 text-xs font-medium ${!paga && p.situacao === 'atrasada' ? 'bg-saida text-background' : 'bg-muted'}`}>{rotulo}</span>
        <p className="text-sm text-muted-foreground">Vence em {formatarData(p.data_vencimento)}</p>
        <ErroDeAcao erro={pagar.error} />
      </div>
      <div className="space-y-2 text-right">
        <Valor centavos={p.valor_centavos} tipo={paga ? 'neutro' : 'saida'} />
        {!paga ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={pagar.isPending} onClick={() => pagar.mutate()}>
              Paguei
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/compromissos">Pagar parte</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Edicao({ d, aoFechar }: { d: DividaDoServidor; aoFechar: () => void }) {
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState(d.nome);
  const [credor, setCredor] = useState(d.credor);
  const [observacao, setObservacao] = useState(d.observacao);
  const salvar = useMutation({
    mutationFn: () => api(`/dividas/${d.id}`, { metodo: 'PUT', corpo: { nome, credor, observacao } }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = salvar.error instanceof ErroApi ? (salvar.error.campos ?? {}) : {};
  const geral = salvar.error && !(salvar.error instanceof ErroApi && salvar.error.campos) ? salvar.error.message : null;
  return (
    <form
      noValidate
      className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Editar dívida</h2>
      <Campo id="div-ed-nome" rotulo="Nome" erro={campos.nome}>
        <Input id="div-ed-nome" value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo id="div-ed-credor" rotulo="Credor" erro={campos.credor}>
        <Input id="div-ed-credor" value={credor} maxLength={120} onChange={(e) => setCredor(e.target.value)} />
      </Campo>
      <Campo id="div-ed-obs" rotulo="Observação" erro={campos.observacao}>
        <Textarea id="div-ed-obs" rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>
      <p className="text-sm text-muted-foreground">
        O valor e as datas das parcelas mudam pelo lançamento de cada uma (por exemplo, se o banco cobrou juros a mais).
      </p>
      {geral ? <p role="alert" className="text-sm font-medium text-destructive">{geral}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending || !nome.trim()}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default function DividaDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const [editando, setEditando] = useState(false);
  const consulta = useQuery({ queryKey: ['divida', id], queryFn: () => api<DividaDoServidor & { parcelas: Parcela[] }>(`/dividas/${id}`) });
  const contas = useContas();
  const excluir = useMutation({
    mutationFn: () => api(`/dividas/${id}`, { metodo: 'DELETE' }),
    onSuccess: async () => {
      await invalidar();
      navegar('/app/dividas');
    },
  });

  const erro = consulta.error ?? contas.error;
  if (erro) return <ErroDeTela erro={erro} />;
  if (!consulta.data || !contas.data) return <Carregando />;
  const d = consulta.data;
  const conta = contas.data.itens.find((c) => c.id === d.conta_id);

  return (
    <Pagina titulo={d.nome}>
      <p>
        <Link className="underline underline-offset-4" to="/app/dividas">
          ‹ Dívidas
        </Link>
        <EtiquetaDeDivida situacao={d.situacao} />
      </p>
      {editando ? (
        <Edicao d={d} aoFechar={() => setEditando(false)} />
      ) : (
        <div className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
          {d.credor ? <p className="text-sm text-muted-foreground">{d.credor}</p> : null}
          <ResumoDeDivida d={d} />
          <p className="text-sm text-muted-foreground">
            Contratado <Valor centavos={d.valor_total_centavos} /> em {d.parcelas_total}x · sai de {conta?.nome ?? '—'}
          </p>
          {d.observacao ? <p className="text-sm text-muted-foreground">{d.observacao}</p> : null}
          <p className="text-sm text-muted-foreground">
            Excluir apaga a dívida e as parcelas que ainda estão pendentes. O que já foi pago continua nos lançamentos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
          </div>
          <ErroDeAcao erro={excluir.error} />
        </div>
      )}
      <section className="space-y-2">
        <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Parcelas</h2>
        <ul className="divide-y rounded-lg border bg-card px-4">
          {d.parcelas.map((p) => (
            <LinhaDeParcela key={p.lancamento_id} p={p} />
          ))}
        </ul>
      </section>
    </Pagina>
  );
}
