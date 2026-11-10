import { formatarDinheiro } from '../../../contratos/dinheiro.js';
import { useOcultarValores } from '@/lib/ocultar-valores';
import { cn } from '@/lib/utils';

interface Props {
  centavos: number;
  /** 'entrada' (verde), 'saida' (vermelho) ou 'neutro'. */
  tipo?: 'entrada' | 'saida' | 'neutro';
  /** Com `sinal`, entrada e saída levam + ou − na frente: a cor nunca é o único sinal. */
  sinal?: boolean;
  className?: string;
}

/** Mostra um valor em centavos. Respeita "ocultar valores". Só formata: nenhum cálculo acontece aqui. */
export function Valor({ centavos, tipo = 'neutro', sinal = false, className }: Props) {
  const { oculto } = useOcultarValores();
  const prefixo = sinal && tipo === 'entrada' ? '+ ' : sinal && tipo === 'saida' ? '− ' : '';
  const absoluto = sinal && tipo !== 'neutro' ? Math.abs(centavos) : centavos;
  return (
    <span
      className={cn(
        'tabular whitespace-nowrap',
        tipo === 'entrada' && 'text-entrada',
        tipo === 'saida' && 'text-saida',
        className,
      )}
    >
      {oculto ? 'R$ ••••' : `${prefixo}${formatarDinheiro(absoluto)}`}
    </span>
  );
}
