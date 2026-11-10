import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Carregando, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';

interface Resposta {
  patrimonio_liquido_centavos: number;
  ativos: { contas_centavos: number; investimentos_centavos: number | null; moedas_centavos: number | null; total_centavos: number };
  passivos: { cartoes_centavos: number | null; dividas_centavos: number | null; total_centavos: number };
  contas: { id: number; nome: string; saldo_centavos: number }[];
  moedas_sem_cotacao: number;
}

const Linha = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <p className="flex justify-between gap-3">
    <span>{rotulo}</span>
    {children}
  </p>
);

const Quadro = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
    <h3 className="font-display text-xl font-extrabold tracking-wide uppercase">{titulo}</h3>
    {children}
  </div>
);

export default function Patrimonio() {
  const consulta = useQuery({ queryKey: ['patrimonio'], queryFn: () => api<Resposta>('/patrimonio') });
  if (consulta.error) return <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} />;
  if (!consulta.data) return <Carregando />;
  const { ativos, passivos, patrimonio_liquido_centavos: liquido, contas, moedas_sem_cotacao: semCotacao } = consulta.data;

  return (
    <Pagina titulo="Patrimônio líquido">
      <p className="max-w-2xl text-sm text-muted-foreground">
        O que você tem menos o que deve. Entram só os módulos que você usa; contas arquivadas e contas a pagar comuns ficam de fora.
      </p>

      <div className="max-w-xl rounded-lg border bg-card p-4">
        <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Patrimônio líquido</h2>
        <p className="font-display text-5xl font-black tracking-tight">
          <Valor centavos={liquido} />
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Quadro titulo="O que você tem">
          <Linha rotulo="Contas"><Valor centavos={ativos.contas_centavos} /></Linha>
          {ativos.investimentos_centavos != null ? <Linha rotulo="Investimentos"><Valor centavos={ativos.investimentos_centavos} /></Linha> : null}
          {ativos.moedas_centavos != null ? <Linha rotulo="Moedas (pela cotação informada)"><Valor centavos={ativos.moedas_centavos} /></Linha> : null}
          <Linha rotulo="Total"><Valor centavos={ativos.total_centavos} tipo="entrada" className="font-semibold" /></Linha>
          {semCotacao > 0 ? (
            <p className="text-sm text-muted-foreground">
              {semCotacao} {semCotacao === 1 ? 'conta em moeda estrangeira está' : 'contas em moeda estrangeira estão'} sem cotação e
              {semCotacao === 1 ? ' ficou' : ' ficaram'} fora do total.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            {ativos.investimentos_centavos != null ? (
              <Button asChild variant="outline">
                <Link to="/app/investimentos">Ver investimentos</Link>
              </Button>
            ) : null}
            {ativos.moedas_centavos != null || semCotacao > 0 ? (
              <Button asChild variant="outline">
                <Link to="/app/moedas">Ver moedas</Link>
              </Button>
            ) : null}
          </div>
        </Quadro>
        <Quadro titulo="O que você deve">
          {passivos.cartoes_centavos == null && passivos.dividas_centavos == null ? (
            <p className="text-muted-foreground">Nenhuma fatura de cartão nem dívida em aberto.</p>
          ) : (
            <>
              {passivos.cartoes_centavos != null ? <Linha rotulo="Cartões (faturas e parcelas futuras)"><Valor centavos={passivos.cartoes_centavos} /></Linha> : null}
              {passivos.dividas_centavos != null ? <Linha rotulo="Dívidas"><Valor centavos={passivos.dividas_centavos} /></Linha> : null}
              <Linha rotulo="Total"><Valor centavos={passivos.total_centavos} tipo="saida" className="font-semibold" /></Linha>
            </>
          )}
        </Quadro>
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Saldo por conta</h2>
        {contas.length === 0 ? (
          <Vazio titulo="Nenhuma conta cadastrada.">
            <Button asChild>
              <Link to="/app/contas">Criar conta</Link>
            </Button>
          </Vazio>
        ) : (
          <ul className="max-w-xl divide-y rounded-lg border bg-card px-4">
            {contas.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-3">
                <span>{c.nome}</span>
                <Valor centavos={c.saldo_centavos} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Pagina>
  );
}
