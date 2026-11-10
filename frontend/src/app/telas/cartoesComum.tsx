import { ROTULOS_STATUS_FATURA } from '../../../../contratos/cartoes.js';
import { Valor } from '@/components/Valor';
import { nomeDoMes } from '@/lib/datas';
import type { LimiteDoCartao, StatusDaFatura } from '@/lib/dados';

// Peças compartilhadas pelas telas de cartão (lista, detalhe, fatura, compra).

export function StatusFatura({ status }: { status: StatusDaFatura }) {
  return (
    <span
      className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${status === 'atrasada' ? 'bg-saida text-background' : 'bg-muted'}`}
    >
      {ROTULOS_STATUS_FATURA[status]}
    </span>
  );
}

/** 'Fatura de junho de 2026'. */
export const rotuloFatura = (referencia: string): string => `Fatura de ${nomeDoMes(referencia)}`;

const Numeros = ({ rotulo, children, pequeno }: { rotulo: string; children: React.ReactNode; pequeno?: boolean }) => (
  <div className={`flex justify-between gap-3 ${pequeno ? 'text-sm text-muted-foreground' : ''}`}>
    <span>{rotulo}</span>
    {children}
  </div>
);

/** Limite do cartão. Todos os números vêm prontos da API; aqui só se mostra. */
export function Limite({ limite, detalhado = false }: { limite: LimiteDoCartao; detalhado?: boolean }) {
  const negativo = limite.disponivel_centavos < 0;
  return (
    <div className="space-y-1">
      <Numeros rotulo={negativo ? 'Acima do limite' : 'Limite disponível'}>
        <Valor centavos={limite.disponivel_centavos} tipo={negativo ? 'saida' : 'neutro'} className="font-semibold" />
      </Numeros>
      <progress
        className="h-2 w-full accent-primary"
        max={limite.limite_centavos || 1}
        value={limite.usado_centavos}
        aria-label="Limite usado"
      />
      <Numeros rotulo="Limite total" pequeno>
        <Valor centavos={limite.limite_centavos} />
      </Numeros>
      {detalhado ? (
        <>
          <Numeros rotulo="Faturas não pagas" pequeno>
            <Valor centavos={limite.faturas_nao_pagas_centavos} />
          </Numeros>
          <Numeros rotulo="Parcelas futuras" pequeno>
            <Valor centavos={limite.parcelas_futuras_centavos} />
          </Numeros>
        </>
      ) : null}
    </div>
  );
}

/** Linha de lista com texto à esquerda e valor à direita (faturas, compras, parcelas, pagamentos). */
export function LinhaDeLista({ children, direita }: { children: React.ReactNode; direita: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">{children}</div>
      <div className="shrink-0 text-right">{direita}</div>
    </li>
  );
}
