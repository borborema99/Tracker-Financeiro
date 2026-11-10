import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { useInvalidarDados } from '@/lib/dados';
import { formatarData } from '@/lib/datas';

interface Assinatura {
  id: number;
  descricao: string;
  valor_centavos: number;
  frequencia: 'semanal' | 'quinzenal' | 'mensal' | 'anual';
  custo_mensal_centavos: number;
  ativa: boolean;
  proximo_vencimento: string | null;
}

interface Resposta {
  itens: Assinatura[];
  totais: { ativas: number; pausadas: number; mensal_centavos: number; anual_centavos: number };
}

const SUFIXO = { semanal: 'por semana', quinzenal: 'a cada 15 dias', mensal: 'por mês', anual: 'por ano' } as const;

function Linha({ a }: { a: Assinatura }) {
  const invalidar = useInvalidarDados();
  const alternar = useMutation({
    mutationFn: () => api(`/assinaturas/${a.id}/${a.ativa ? 'pausar' : 'reativar'}`, { metodo: 'POST' }),
    onSuccess: invalidar,
  });
  const excluir = useMutation({ mutationFn: () => api(`/recorrencias/${a.id}`, { metodo: 'DELETE' }), onSuccess: invalidar });

  return (
    <li className={`space-y-2 rounded-lg border bg-card p-4 ${a.ativa ? '' : 'opacity-70'}`}>
      <div>
        <strong>{a.descricao}</strong>
        {!a.ativa ? <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium">Pausada</span> : null}
        <p className="text-sm text-muted-foreground">
          <Valor centavos={a.valor_centavos} tipo="saida" /> {SUFIXO[a.frequencia]}
        </p>
        {a.frequencia !== 'mensal' ? (
          <p className="text-sm text-muted-foreground">
            Equivale a <Valor centavos={a.custo_mensal_centavos} /> por mês
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {!a.ativa
            ? 'Sem cobranças futuras enquanto estiver pausada'
            : a.proximo_vencimento
              ? `Próxima cobrança: ${formatarData(a.proximo_vencimento)}`
              : 'Sem próxima cobrança pendente'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={alternar.isPending} onClick={() => alternar.mutate()}>
          {a.ativa ? 'Pausar' : 'Reativar'}
        </Button>
        <Button asChild variant="outline">
          <Link to={`/app/recorrencias/${a.id}`}>Editar</Link>
        </Button>
        <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      </div>
      {!a.ativa ? (
        <p className="text-sm text-muted-foreground">Ao reativar, só as próximas cobranças voltam; as do período pausado não são recriadas.</p>
      ) : null}
      <ErroDeAcao erro={alternar.error ?? excluir.error} />
    </li>
  );
}

export default function Assinaturas() {
  const lista = useQuery({ queryKey: ['assinaturas'], queryFn: () => api<Resposta>('/assinaturas') });
  if (lista.error) return <ErroDeTela erro={lista.error} aoTentar={() => void lista.refetch()} />;
  if (!lista.data) return <Carregando />;
  const { itens, totais } = lista.data;

  return (
    <Pagina
      titulo="Assinaturas"
      acao={
        <Button asChild>
          <Link to="/app/recorrencias/nova?assinatura=1">Nova assinatura</Link>
        </Button>
      }
    >
      <p className="max-w-2xl text-sm text-muted-foreground">
        Cobranças que se repetem (streaming, academia, software). Cada cobrança vira uma conta a pagar em Compromissos.
      </p>
      {totais.ativas > 0 ? (
        <div className="max-w-xl space-y-1 rounded-lg border bg-card p-4">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Quanto custam</h2>
          <p className="flex justify-between">Por mês (equivalente) <Valor centavos={totais.mensal_centavos} tipo="saida" /></p>
          <p className="flex justify-between">Por ano <Valor centavos={totais.anual_centavos} tipo="saida" /></p>
          <p className="text-sm text-muted-foreground">
            {totais.ativas} {totais.ativas === 1 ? 'ativa' : 'ativas'}
            {totais.pausadas > 0 ? `; ${totais.pausadas} pausada(s) não entram na conta` : ''}.
          </p>
        </div>
      ) : null}
      {itens.length === 0 ? (
        <Vazio titulo="Nenhuma assinatura cadastrada.">
          Cadastre as suas para ver quanto custam por mês e por ano e quando a próxima cobrança chega.
        </Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {itens.map((a) => (
            <Linha key={a.id} a={a} />
          ))}
        </ul>
      )}
    </Pagina>
  );
}
