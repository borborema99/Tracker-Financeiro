import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Carregando, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import type { Lista } from '@/lib/dados';
import { formatarData } from '@/lib/datas';

export type SituacaoDivida = 'em_dia' | 'atrasada' | 'quitada' | 'sem_parcelas';

export interface DividaDoServidor {
  id: number;
  nome: string;
  credor: string;
  observacao: string;
  conta_id: number;
  valor_total_centavos: number;
  situacao: SituacaoDivida;
  percentual_pago: number;
  pago_centavos: number;
  restante_centavos: number;
  atrasado_centavos: number;
  parcelas_total: number;
  parcelas_pagas: number;
  parcelas_atrasadas: number;
  proxima: { numero: number; data_vencimento: string } | null;
}

export const ROTULO_SITUACAO_DIVIDA: Record<SituacaoDivida, string> = {
  em_dia: 'Em dia',
  atrasada: 'Em atraso',
  quitada: 'Quitada',
  sem_parcelas: 'Sem parcelas',
};

export function EtiquetaDeDivida({ situacao }: { situacao: SituacaoDivida }) {
  return (
    <span className={`ml-2 rounded-sm px-1.5 py-0.5 text-xs font-medium ${situacao === 'atrasada' ? 'bg-saida text-background' : 'bg-muted'}`}>
      {ROTULO_SITUACAO_DIVIDA[situacao]}
    </span>
  );
}

export function ResumoDeDivida({ d }: { d: DividaDoServidor }) {
  const cor = d.situacao === 'atrasada' ? 'text-saida' : d.situacao === 'quitada' ? 'text-entrada' : 'text-primary';
  return (
    <div className="space-y-1">
      <progress className={`medidor ${cor}`} max={100} value={d.percentual_pago} aria-label={`${d.percentual_pago}% pago`} />
      <p>
        Pago <Valor centavos={d.pago_centavos} tipo="entrada" /> · Falta <Valor centavos={d.restante_centavos} tipo="saida" />
      </p>
      <p className="text-sm text-muted-foreground">
        {d.parcelas_pagas} de {d.parcelas_total} parcelas pagas
        {d.proxima ? ` · próxima: parcela ${d.proxima.numero} em ${formatarData(d.proxima.data_vencimento)}` : ''}
      </p>
      {d.atrasado_centavos > 0 ? (
        <p className="font-medium text-destructive">
          Em atraso: <Valor centavos={d.atrasado_centavos} tipo="saida" /> ({d.parcelas_atrasadas} {d.parcelas_atrasadas === 1 ? 'parcela' : 'parcelas'})
        </p>
      ) : null}
    </div>
  );
}

export default function Dividas() {
  const lista = useQuery({ queryKey: ['dividas'], queryFn: () => api<Lista<DividaDoServidor>>('/dividas') });
  if (lista.error) return <ErroDeTela erro={lista.error} aoTentar={() => void lista.refetch()} />;
  if (!lista.data) return <Carregando />;

  return (
    <Pagina
      titulo="Dívidas"
      acao={
        <Button asChild>
          <Link to="/app/dividas/nova">Nova dívida</Link>
        </Button>
      }
    >
      <p className="max-w-2xl text-sm text-muted-foreground">
        Cada parcela vira uma conta a pagar em Compromissos: o atraso, a projeção do fluxo e os alertas já contam com elas. Quanto
        você pagou e quanto falta é calculado dessas parcelas.
      </p>
      {lista.data.itens.length === 0 ? (
        <Vazio titulo="Nenhuma dívida cadastrada.">
          Financiamento, empréstimo, acordo: informe o valor total e as parcelas e acompanhe até quitar.
        </Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.data.itens.map((d) => (
            <li key={d.id} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <strong>{d.nome}</strong>
                  <EtiquetaDeDivida situacao={d.situacao} />
                  {d.credor ? <p className="text-sm text-muted-foreground">{d.credor}</p> : null}
                </div>
                <span className="text-sm text-muted-foreground">{d.percentual_pago}%</span>
              </div>
              <ResumoDeDivida d={d} />
              <Button asChild variant="outline">
                <Link to={`/app/dividas/${d.id}`}>Ver parcelas</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  );
}
