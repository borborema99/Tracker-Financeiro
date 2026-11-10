import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ROTULOS_FREQUENCIA } from '../../../../contratos/recorrencias.js';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { porId, useContas, useInvalidarDados, type Conta, type Lista } from '@/lib/dados';
import { formatarData } from '@/lib/datas';

export interface Recorrencia {
  id: number;
  tipo: 'despesa' | 'receita';
  descricao: string;
  valor_centavos: number;
  conta_id: number;
  categoria_id: number | null;
  frequencia: keyof typeof ROTULOS_FREQUENCIA;
  data_inicio: string;
  data_fim: string | null;
  ativa: boolean;
  assinatura: boolean;
  observacao: string;
  proximo_vencimento: string | null;
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium">{children}</span>;
}

function Linha({ r, contas }: { r: Recorrencia; contas: Map<number, Conta> }) {
  const invalidar = useInvalidarDados();
  const excluir = useMutation({
    mutationFn: () => api(`/recorrencias/${r.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  return (
    <li className={`space-y-3 rounded-lg border bg-card p-4 ${r.ativa ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong>{r.descricao}</strong>
          {r.assinatura ? <Etiqueta>Assinatura</Etiqueta> : null}
          {!r.ativa ? <Etiqueta>Pausada</Etiqueta> : null}
          <p className="text-sm text-muted-foreground">
            {ROTULOS_FREQUENCIA[r.frequencia]} · {r.tipo === 'receita' ? 'receita' : 'despesa'} ·{' '}
            {contas.get(r.conta_id)?.nome ?? '—'}
          </p>
          <p className="text-sm text-muted-foreground">
            {r.proximo_vencimento ? `Próximo: ${formatarData(r.proximo_vencimento)}` : 'Sem próxima ocorrência pendente'}
            {r.data_fim ? ` · até ${formatarData(r.data_fim)}` : ''}
          </p>
        </div>
        <Valor centavos={r.valor_centavos} tipo={r.tipo === 'receita' ? 'entrada' : 'saida'} className="text-lg font-semibold" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to={`/app/recorrencias/${r.id}`}>Editar</Link>
        </Button>
        <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      </div>
      <ErroDeAcao erro={excluir.error} />
    </li>
  );
}

export default function Recorrencias() {
  const lista = useQuery({ queryKey: ['recorrencias'], queryFn: () => api<Lista<Recorrencia>>('/recorrencias') });
  const contas = useContas();

  const erro = lista.error ?? contas.error;
  if (erro) return <ErroDeTela erro={erro} aoTentar={() => void lista.refetch()} />;
  if (!lista.data || !contas.data) return <Carregando />;
  const mapaContas = porId(contas.data.itens);

  return (
    <Pagina
      titulo="Recorrências"
      acao={
        <Button asChild>
          <Link to="/app/recorrencias/nova">Nova recorrência</Link>
        </Button>
      }
    >
      <p className="max-w-2xl text-sm text-muted-foreground">
        Contas e recebimentos que se repetem. As ocorrências viram compromissos pendentes quando você abre o app, até 90 dias
        à frente. Apagar uma ocorrência não a recria.
      </p>
      {lista.data.itens.length === 0 ? (
        <Vazio titulo="Nenhuma recorrência cadastrada.">
          Aluguel, salário, assinaturas: cadastre uma vez e acompanhe em Compromissos.
        </Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.data.itens.map((r) => (
            <Linha key={r.id} r={r} contas={mapaContas} />
          ))}
        </ul>
      )}
    </Pagina>
  );
}
