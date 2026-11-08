import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { formatarData, nomeDoMes } from '../compartilhado/datas.js';
import { useAlertas, useContas } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const GraficoProjecao = lazy(() => import('../fluxo/GraficoProjecao.jsx'));

/** Os alertas mais importantes; a lista completa fica em /alertas. */
function Alertas() {
  const { data } = useAlertas();
  if (!data || data.total === 0) return null;
  const topo = data.alertas.slice(0, 3);
  return (
    <div className="cartao alerta alerta-alta" role="status">
      <h2>Alertas</h2>
      <ul className="lista-limpa">
        {topo.map((a) => (
          <li key={`${a.codigo}-${a.link}`}>
            <Link to={a.link}><strong>{a.titulo}</strong></Link>
            <p className="suave pequeno">{a.mensagem}</p>
          </li>
        ))}
      </ul>
      {data.total > topo.length && <Link className="botao" to="/alertas">Ver todos ({data.total})</Link>}
    </div>
  );
}

/** Projeção de 30 dias: só quando há o que projetar (compromissos ou cartões), para não desenhar uma reta vazia. */
function Projecao() {
  const projecao = useQuery({ queryKey: ['projecao-saldo', 30], queryFn: () => api('/fluxo/projecao?dias=30') });
  if (!projecao.data) return null;
  const p = projecao.data;
  return (
    <>
      <h2>Próximos 30 dias</h2>
      <div className="cartao">
        <p className="suave pequeno">Saldo projetado: saldo de hoje + compromissos pendentes + faturas em aberto.</p>
        <div className="resumo-fatura">
          <p><span>Menor saldo (em {formatarData(p.saldo_minimo.data)})</span> <Valor centavos={p.saldo_minimo.centavos} /></p>
          <p><span>Saldo em {formatarData(p.serie.at(-1).data)}</span> <Valor centavos={p.saldo_final_centavos} /></p>
        </div>
        <Suspense fallback={<p className="carregando">Carregando gráfico…</p>}>
          <GraficoProjecao serie={p.serie} />
        </Suspense>
        <Link className="botao" to="/fluxo?aba=projecao">Ver fluxo de caixa</Link>
      </div>
    </>
  );
}

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

  const { saldos, realizado, previsto, mes, cartoes, compromissos, orcamento, metas, dividas, assinaturas } = resumo.data;
  return (
    <section>
      <h1>Início</h1>

      <Alertas />

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

      {compromissos && (
        <>
          <h2>Compromissos</h2>
          <div className="totais-lista">
            {[['a_pagar', 'A pagar', 'saida', 'despesa'], ['a_receber', 'A receber', 'entrada', 'receita']].map(([chave, titulo, tipo, param]) => (
              <div key={chave} className="cartao">
                <h3>{titulo}</h3>
                <p className="suave">Pendente, ainda não liquidado</p>
                <p>Atrasado <Valor centavos={compromissos[chave].atrasado_centavos} tipo={tipo} /></p>
                <p>Próximos 7 dias <Valor centavos={compromissos[chave].vence_em_breve_centavos} /></p>
                <p>Depois <Valor centavos={compromissos[chave].depois_centavos} /></p>
                <Link className="botao" to={`/compromissos${param === 'despesa' ? '' : `?tipo=${param}`}`}>Ver {titulo.toLowerCase()}</Link>
              </div>
            ))}
          </div>
        </>
      )}

      {(orcamento || metas || dividas || assinaturas) && <h2>Planejamento</h2>}
      {(orcamento || metas || dividas || assinaturas) && (
        <div className="totais-lista">
          {orcamento && (
            <div className="cartao">
              <h3>Orçamento de {nomeDoMes(mes)}</h3>
              <p>Limites <Valor centavos={orcamento.limite_centavos} /></p>
              <p>Gasto <Valor centavos={orcamento.realizado_centavos} tipo="saida" /></p>
              <p>{orcamento.restante_centavos >= 0 ? 'Resta' : 'Passou'} <Valor centavos={Math.abs(orcamento.restante_centavos)} /></p>
              {orcamento.estourados > 0 && <p className="suave pequeno">{orcamento.estourados} categoria(s) acima do limite.</p>}
              <Link className="botao" to="/orcamento">Ver orçamento</Link>
            </div>
          )}
          {metas && (
            <div className="cartao">
              <h3>Metas</h3>
              <p>{metas.abertas} em aberto{metas.atrasadas > 0 ? `, ${metas.atrasadas} com prazo vencido` : ''}</p>
              <p>Guardado <Valor centavos={metas.acumulado_centavos} tipo="entrada" /></p>
              <p>Alvo <Valor centavos={metas.alvo_centavos} /></p>
              <Link className="botao" to="/metas">Ver metas</Link>
            </div>
          )}
          {dividas && (
            <div className="cartao">
              <h3>Dívidas</h3>
              <p>{dividas.abertas} em aberto{dividas.atrasadas > 0 ? `, ${dividas.atrasadas} em atraso` : ''}</p>
              <p>Falta pagar <Valor centavos={dividas.restante_centavos} tipo="saida" /></p>
              {dividas.atrasado_centavos > 0 && <p>Em atraso <Valor centavos={dividas.atrasado_centavos} tipo="saida" /></p>}
              <Link className="botao" to="/dividas">Ver dívidas</Link>
            </div>
          )}
          {assinaturas && (
            <div className="cartao">
              <h3>Assinaturas</h3>
              <p>{assinaturas.ativas} {assinaturas.ativas === 1 ? 'ativa' : 'ativas'}</p>
              <p>Por mês <Valor centavos={assinaturas.mensal_centavos} tipo="saida" /></p>
              <p>Por ano <Valor centavos={assinaturas.anual_centavos} tipo="saida" /></p>
              <Link className="botao" to="/assinaturas">Ver assinaturas</Link>
            </div>
          )}
        </div>
      )}

      {(compromissos || cartoes) && <Projecao />}

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
