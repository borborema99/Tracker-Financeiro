import { Link } from 'react-router-dom';
import { useAlertas } from '../compartilhado/dados.js';

const ROTULOS_NIVEL = { alta: 'Urgente', media: 'Atenção', info: 'Aviso' };

/** Lista de alertas calculados pelo servidor na hora (nada é guardado nem enviado fora do app). */
export function Alertas() {
  const { data, isPending, error } = useAlertas();

  if (isPending) return <p className="carregando">Carregando…</p>;
  if (error) return <p className="erro">{error.message}</p>;

  return (
    <section>
      <h1>Alertas</h1>
      <p className="suave pequeno">
        Os alertas só aparecem aqui dentro do app: atrasos, vencimentos nos próximos 3 dias, fechamento de fatura e saldo
        projetado negativo.
      </p>
      {data.total === 0 ? (
        <div className="cartao vazio">
          <p>Nenhum alerta agora.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {data.alertas.map((a) => (
            <li key={`${a.codigo}-${a.link}`} className={`cartao alerta alerta-${a.nivel}`}>
              <div className="item-topo">
                <strong>{a.titulo}</strong>
                <span className={`etiqueta nivel-${a.nivel}`}>{ROTULOS_NIVEL[a.nivel]}</span>
              </div>
              <p className="suave">{a.mensagem}</p>
              <Link className="botao" to={a.link}>Ver</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
