import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { nomeDoMes } from '../compartilhado/datas.js';
import { useContas } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

export function Dashboard() {
  const contas = useContas();
  const resumo = useQuery({ queryKey: ['resumo'], queryFn: () => api('/resumo') });

  if (contas.isPending || resumo.isPending) return <p className="carregando">Carregando…</p>;
  const erro = contas.error ?? resumo.error;
  if (erro) return <p className="erro">{erro.message}</p>;

  if (contas.data.itens.length === 0) {
    return (
      <section>
        <h1>Início</h1>
        <div className="cartao vazio">
          <p>Comece criando sua primeira conta.</p>
          <p className="suave">Os saldos e o resumo do mês aparecem aqui assim que houver lançamentos.</p>
          <Link className="botao-primario" to="/contas">Criar conta</Link>
        </div>
      </section>
    );
  }

  const { saldos, realizado, previsto, mes, cartoes } = resumo.data;
  return (
    <section>
      <h1>Início</h1>

      <div className="cartao">
        <h2>Saldo total</h2>
        <p className="destaque"><Valor centavos={saldos.total_centavos} /></p>
        <ul className="lista-limpa saldos-contas">
          {saldos.por_conta.map((c) => (
            <li key={c.id}>
              <span>{c.nome}</span>
              <Valor centavos={c.saldo_centavos} />
            </li>
          ))}
        </ul>
      </div>

      <h2>{nomeDoMes(mes)}</h2>
      <div className="totais-lista">
        <div className="cartao">
          <h3>Realizado</h3>
          <p className="suave">Só o que já foi liquidado</p>
          <p>Receitas <Valor centavos={realizado.receitas} tipo="entrada" /></p>
          <p>Despesas <Valor centavos={realizado.despesas} tipo="saida" /></p>
          <p>Resultado <Valor centavos={realizado.resultado} /></p>
        </div>
        <div className="cartao">
          <h3>Previsto</h3>
          <p className="suave">Pendente, ainda não liquidado</p>
          <p>A receber <Valor centavos={previsto.receitas} tipo="entrada" /></p>
          <p>A pagar <Valor centavos={previsto.despesas} tipo="saida" /></p>
        </div>
      </div>

      {cartoes && (
        <>
          <h2>Cartões</h2>
          <div className="cartao">
            <p className="suave">As despesas realizadas acima incluem as compras no cartão, pela data da compra.</p>
            <div className="totais-lista">
              <p>Faturas não pagas <Valor centavos={cartoes.faturas_nao_pagas_centavos} tipo="saida" /></p>
              <p>Parcelas futuras <Valor centavos={cartoes.parcelas_futuras_centavos} tipo="saida" /></p>
              <p>Limite disponível <Valor centavos={cartoes.limite_disponivel_centavos} /></p>
            </div>
            <Link className="botao" to="/cartoes">Ver cartões</Link>
          </div>
        </>
      )}
    </section>
  );
}
