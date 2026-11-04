import { ROTULOS_STATUS_FATURA } from '../../../contratos/cartoes.js';
import { nomeDoMes } from '../compartilhado/datas.js';
import { Valor } from '../compartilhado/Valor.jsx';

export function StatusFatura({ status }) {
  return <span className={`etiqueta ${status}`}>{ROTULOS_STATUS_FATURA[status]}</span>;
}

/** 'Fatura de junho de 2026'. */
export const rotuloFatura = (referencia) => `Fatura de ${nomeDoMes(referencia)}`;

/** Limite do cartão. Todos os números vêm prontos da API; aqui só se mostra. */
export function Limite({ limite, detalhado = false }) {
  const negativo = limite.disponivel_centavos < 0;
  return (
    <div className="limite">
      <div className="limite-numeros">
        <span className="suave">{negativo ? 'Acima do limite' : 'Limite disponível'}</span>
        <span className={negativo ? 'limite-negativo' : ''}>
          <Valor centavos={limite.disponivel_centavos} />
        </span>
      </div>
      <progress max={limite.limite_centavos || 1} value={limite.usado_centavos} aria-label="Limite usado" />
      <div className="limite-numeros pequeno suave">
        <span>Limite total</span>
        <Valor centavos={limite.limite_centavos} />
      </div>
      {detalhado && (
        <>
          <div className="limite-numeros pequeno suave">
            <span>Faturas não pagas</span>
            <Valor centavos={limite.faturas_nao_pagas_centavos} />
          </div>
          <div className="limite-numeros pequeno suave">
            <span>Parcelas futuras</span>
            <Valor centavos={limite.parcelas_futuras_centavos} />
          </div>
        </>
      )}
    </div>
  );
}
