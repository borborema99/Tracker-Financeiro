import { Link } from 'react-router-dom';
import { Carregando, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { useAlertas } from '@/lib/dados';
import { caminhoDoTracker } from '@/lib/caminhos';
import { destinoExiste } from '../modulos';

const ROTULOS_NIVEL = { alta: 'Urgente', media: 'Atenção', info: 'Aviso' } as const;

/** Lista de alertas calculados pelo servidor na hora (nada é guardado nem enviado para fora do app). */
export default function Alertas() {
  const { data, isPending, error, refetch } = useAlertas();

  if (isPending) return <Carregando />;
  if (error) return <ErroDeTela erro={error} aoTentar={() => void refetch()} />;

  return (
    <Pagina titulo="Alertas">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Os alertas só aparecem aqui dentro do app: atrasos, vencimentos nos próximos 3 dias, fechamento de fatura e saldo
        projetado negativo.
      </p>
      {data.total === 0 ? (
        <Vazio titulo="Nenhum alerta agora." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.alertas.map((a) => (
            <li key={`${a.codigo}-${a.link}`} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{a.titulo}</strong>
                <span
                  className={`rounded-sm px-2 py-0.5 text-xs font-medium ${
                    a.nivel === 'alta' ? 'bg-saida text-background' : a.nivel === 'media' ? 'bg-aviso text-background' : 'bg-muted'
                  }`}
                >
                  {ROTULOS_NIVEL[a.nivel]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{a.mensagem}</p>
              {destinoExiste(a.link) ? (
                <Button asChild variant="outline">
                  <Link to={caminhoDoTracker(a.link)}>Ver</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  );
}
