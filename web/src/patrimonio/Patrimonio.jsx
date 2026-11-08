import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../compartilhado/api.js';
import { Valor } from '../compartilhado/Valor.jsx';

export function Patrimonio() {
  const consulta = useQuery({ queryKey: ['patrimonio'], queryFn: () => api('/patrimonio') });
  if (consulta.isPending) return <p className="carregando">Carregando…</p>;
  if (consulta.error) return <p className="erro">{consulta.error.message}</p>;
  const { ativos, passivos, patrimonio_liquido_centavos: liquido, contas } = consulta.data;

  return (
    <section>
      <h1>Patrimônio líquido</h1>
      <p className="suave pequeno">
        O que você tem menos o que deve. Entram só os módulos que você usa; contas arquivadas e contas a pagar comuns ficam de fora.
      </p>

      <div className="cartao">
        <h2>Patrimônio líquido</h2>
        <p className="destaque"><Valor centavos={liquido} /></p>
      </div>

      <div className="totais-lista">
        <div className="cartao">
          <h3>O que você tem</h3>
          <p>Contas <Valor centavos={ativos.contas_centavos} /></p>
          {ativos.investimentos_centavos != null && (
            <p>Investimentos <Valor centavos={ativos.investimentos_centavos} /></p>
          )}
          <p>Total <Valor centavos={ativos.total_centavos} tipo="entrada" /></p>
          {ativos.investimentos_centavos != null && <Link className="botao" to="/investimentos">Ver investimentos</Link>}
        </div>
        <div className="cartao">
          <h3>O que você deve</h3>
          {passivos.cartoes_centavos == null && passivos.dividas_centavos == null ? (
            <p className="suave">Nenhuma fatura de cartão nem dívida em aberto.</p>
          ) : (
            <>
              {passivos.cartoes_centavos != null && (
                <p>Cartões (faturas e parcelas futuras) <Valor centavos={passivos.cartoes_centavos} /></p>
              )}
              {passivos.dividas_centavos != null && <p>Dívidas <Valor centavos={passivos.dividas_centavos} /></p>}
              <p>Total <Valor centavos={passivos.total_centavos} tipo="saida" /></p>
            </>
          )}
        </div>
      </div>

      <h2>Saldo por conta</h2>
      {contas.length === 0 ? (
        <div className="cartao vazio">
          <p>Nenhuma conta cadastrada.</p>
          <Link className="botao-primario" to="/contas">Criar conta</Link>
        </div>
      ) : (
        <ul className="lista-limpa saldos-contas cartao">
          {contas.map((c) => (
            <li key={c.id}>
              <span>{c.nome}</span>
              <Valor centavos={c.saldo_centavos} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
