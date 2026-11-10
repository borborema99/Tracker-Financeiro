import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Carregando, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import type { Cartao, Lista, StatusDaFatura } from '@/lib/dados';
import { formatarData } from '@/lib/datas';
import { LinhaDeLista, Limite, rotuloFatura, StatusFatura } from './cartoesComum';

interface FaturaResumo {
  id: number;
  referencia: string;
  data_fechamento: string;
  data_vencimento: string;
  total_centavos: number;
  pago_centavos: number;
  status: StatusDaFatura;
}

interface FaturaProjetada {
  fatura_id: number;
  referencia: string;
  data_vencimento: string;
  saldo_centavos: number;
}

interface CompraResumo {
  id: number;
  descricao: string;
  data_compra: string;
  parcelas_total: number;
  estornado_centavos: number;
  valor_total_centavos: number;
  valor_liquido_centavos: number;
}

const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{titulo}</h2>
    {children}
  </section>
);

const Caixa = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border bg-card px-4 py-1">{children}</div>
);

export default function CartaoDetalhe() {
  const { id } = useParams();
  const cartao = useQuery({ queryKey: ['cartao', id], queryFn: () => api<Cartao>(`/cartoes/${id}`) });
  const faturas = useQuery({ queryKey: ['faturas', id], queryFn: () => api<Lista<FaturaResumo>>(`/cartoes/${id}/faturas`) });
  const projecao = useQuery({
    queryKey: ['projecao', id],
    queryFn: () => api<Lista<FaturaProjetada> & { total_centavos: number }>(`/cartoes/${id}/projecao`),
  });
  const compras = useQuery({
    queryKey: ['compras', id],
    queryFn: () => api<Lista<CompraResumo> & { total: number }>(`/cartoes/${id}/compras?por_pagina=50`),
  });

  const erro = cartao.error ?? faturas.error ?? projecao.error ?? compras.error;
  if (erro) return <ErroDeTela erro={erro} />;
  if (!cartao.data || !faturas.data || !projecao.data || !compras.data) return <Carregando />;

  const c = cartao.data;
  return (
    <Pagina
      titulo={c.nome}
      acao={
        !c.arquivado ? (
          <Button asChild>
            <Link to={`/app/cartoes/compras/nova?cartao=${c.id}`}>Nova compra</Link>
          </Button>
        ) : null
      }
    >
      <p className="text-muted-foreground">
        Fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}.{' '}
        <Link className="underline underline-offset-4" to="/app/cartoes">
          Voltar aos cartões
        </Link>
      </p>

      <div className="max-w-xl rounded-lg border bg-card p-4">
        <Limite limite={c.limite} detalhado />
      </div>

      <Secao titulo="Faturas">
        {faturas.data.itens.length === 0 ? (
          <Vazio titulo="Nenhuma fatura ainda: ela nasce na primeira compra." />
        ) : (
          <Caixa>
            <ul className="divide-y">
              {faturas.data.itens.map((f) => (
                <LinhaDeLista
                  key={f.id}
                  direita={
                    <>
                      <Valor centavos={f.total_centavos} tipo="saida" />
                      <p>
                        <StatusFatura status={f.status} />
                      </p>
                    </>
                  }
                >
                  <Link className="underline underline-offset-4" to={`/app/faturas/${f.id}`}>
                    <strong>{rotuloFatura(f.referencia)}</strong>
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Fecha em {formatarData(f.data_fechamento)} · vence em {formatarData(f.data_vencimento)}
                  </p>
                  {f.pago_centavos > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Pago <Valor centavos={f.pago_centavos} />
                    </p>
                  ) : null}
                </LinhaDeLista>
              ))}
            </ul>
          </Caixa>
        )}
      </Secao>

      <Secao titulo="Próximas faturas (projeção)">
        {projecao.data.itens.length === 0 ? (
          <Vazio titulo="Nada a vencer nos próximos meses." />
        ) : (
          <Caixa>
            <p className="py-2 text-sm text-muted-foreground">
              Projeção do que ainda vai vencer. Não é despesa realizada: a compra já foi contada na data em que foi feita.
            </p>
            <ul className="divide-y border-t">
              {projecao.data.itens.map((p) => (
                <LinhaDeLista key={p.fatura_id} direita={<Valor centavos={p.saldo_centavos} tipo="saida" />}>
                  <Link className="underline underline-offset-4" to={`/app/faturas/${p.fatura_id}`}>
                    {rotuloFatura(p.referencia)}
                  </Link>
                  <p className="text-sm text-muted-foreground">Vence em {formatarData(p.data_vencimento)}</p>
                </LinhaDeLista>
              ))}
              <LinhaDeLista direita={<Valor centavos={projecao.data.total_centavos} tipo="saida" className="font-semibold" />}>
                <strong>A pagar nas próximas faturas</strong>
              </LinhaDeLista>
            </ul>
          </Caixa>
        )}
      </Secao>

      <Secao titulo="Compras">
        {compras.data.itens.length === 0 ? (
          <Vazio titulo="Nenhuma compra neste cartão." />
        ) : (
          <Caixa>
            <ul className="divide-y">
              {compras.data.itens.map((m) => (
                <LinhaDeLista
                  key={m.id}
                  direita={
                    <>
                      <Valor centavos={m.valor_liquido_centavos} tipo="saida" />
                      {m.estornado_centavos > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          de <Valor centavos={m.valor_total_centavos} />
                        </p>
                      ) : null}
                    </>
                  }
                >
                  <Link className="underline underline-offset-4" to={`/app/cartoes/compras/${m.id}`}>
                    <strong>{m.descricao || 'Compra no cartão'}</strong>
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatarData(m.data_compra)}
                    {m.parcelas_total > 1 ? ` · ${m.parcelas_total}x` : ' · à vista'}
                    {m.estornado_centavos > 0 ? ' · com estorno' : ''}
                  </p>
                </LinhaDeLista>
              ))}
            </ul>
            {compras.data.total > compras.data.itens.length ? (
              <p className="border-t py-2 text-sm text-muted-foreground">
                Mostrando as {compras.data.itens.length} compras mais recentes de {compras.data.total}.
              </p>
            ) : null}
          </Caixa>
        )}
      </Secao>
    </Pagina>
  );
}
