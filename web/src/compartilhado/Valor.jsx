import { formatarDinheiro } from '../../../contratos/dinheiro.js';
import { useOcultarValores } from './OcultarValores.jsx';

/**
 * Mostra um valor em centavos. `tipo`: 'entrada' (verde), 'saida' (vermelho) ou 'neutro'.
 * Respeita a preferência de ocultar valores. Só formata: nenhum cálculo acontece aqui.
 */
export function Valor({ centavos, tipo = 'neutro' }) {
  const { oculto } = useOcultarValores();
  return (
    <span className={`valor valor-${tipo}`}>
      {oculto ? 'R$ ••••' : formatarDinheiro(centavos)}
    </span>
  );
}
