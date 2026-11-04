import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { formatarData } from '../compartilhado/datas.js';
import { Valor } from '../compartilhado/Valor.jsx';
import { Limite, StatusFatura, rotuloFatura } from './comum.jsx';

export function CartaoDetalhe() {
  const { id } = useParams();
  const cartao = useQuery({ queryKey: ['cartao', id], queryFn: () => api(`/cartoes/${id}`) });
  const faturas = useQuery({ queryKey: ['faturas', id], queryFn: () => api(`/cartoes/${id}/faturas`) });
  const projecao = useQuery({ queryKey: ['projecao', id], queryFn: () => api(`/cartoes/${id}/projecao`) });
  const compras = useQuery({ queryKey: ['compras', id], queryFn: () => api(`/cartoes/${id}/compras?por_pagina=50`) });

  if (cartao.isPending || faturas.isPending || projecao.isPending || compras.isPending) {
    return <p className="carregando">Carregando…</p>;
  }
  const erro = cartao.error ?? faturas.error ?? projecao.error ?? compras.error;
  if (erro) return <p className="erro">{erro.message}</p>;

  const c = cartao.data;
  return (
    <section>
      <div className="titulo-com-acao">
        <h1>{c.nome}</h1>
        {!c.arquivado && (
          <Link className="botao-primario" to={`/cartoes/compras/nova?cartao=${c.id}`}>Nova compra</Link>
        )}
      </div>
      <p className="suave">
        Fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}. <Link to="/cartoes">Voltar aos cartões</Link>
      </p>

      <div className="cartao">
        <Limite limite={c.limite} detalhado />
      </div>

      <h2>Faturas</h2>
      {faturas.data.itens.length === 0 ? (
        <div className="cartao vazio"><p className="suave">Nenhuma fatura ainda: ela nasce na primeira compra.</p></div>
      ) : (
        <div className="cartao">
          {faturas.data.itens.map((f) => (
            <div key={f.id} className="linha-fatura">
              <div>
                <Link to={`/faturas/${f.id}`}><strong>{rotuloFatura(f.referencia)}</strong></Link>
                <p className="suave pequeno">
                  Fecha em {formatarData(f.data_fechamento)} · vence em {formatarData(f.data_vencimento)}
                </p>
                {f.pago_centavos > 0 && (
                  <p className="suave pequeno">Pago <Valor centavos={f.pago_centavos} /></p>
                )}
              </div>
              <div className="direita">
                <Valor centavos={f.total_centavos} tipo="saida" />
                <div><StatusFatura status={f.status} /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Próximas faturas (projeção)</h2>
      {projecao.data.itens.length === 0 ? (
        <div className="cartao vazio"><p className="suave">Nada a vencer nos próximos meses.</p></div>
      ) : (
        <div className="cartao">
          <p className="suave pequeno">
            Projeção do que ainda vai vencer. Não é despesa realizada: a compra já foi contada na data em que foi feita.
          </p>
          {projecao.data.itens.map((p) => (
            <div key={p.fatura_id} className="linha-fatura">
              <div>
                <Link to={`/faturas/${p.fatura_id}`}>{rotuloFatura(p.referencia)}</Link>
                <p className="suave pequeno">Vence em {formatarData(p.data_vencimento)}</p>
              </div>
              <Valor centavos={p.saldo_centavos} tipo="saida" />
            </div>
          ))}
          <div className="linha-fatura">
            <strong>A pagar nas próximas faturas</strong>
            <Valor centavos={projecao.data.total_centavos} tipo="saida" />
          </div>
        </div>
      )}

      <h2>Compras</h2>
      {compras.data.itens.length === 0 ? (
        <div className="cartao vazio"><p className="suave">Nenhuma compra neste cartão.</p></div>
      ) : (
        <div className="cartao">
          {compras.data.itens.map((m) => (
            <div key={m.id} className="linha-fatura">
              <div>
                <Link to={`/cartoes/compras/${m.id}`}><strong>{m.descricao || 'Compra no cartão'}</strong></Link>
                <p className="suave pequeno">
                  {formatarData(m.data_compra)}
                  {m.parcelas_total > 1 ? ` · ${m.parcelas_total}x` : ' · à vista'}
                  {m.estornado_centavos > 0 && ' · com estorno'}
                </p>
              </div>
              <div className="direita">
                <Valor centavos={m.valor_liquido_centavos} tipo="saida" />
                {m.estornado_centavos > 0 && <p className="suave pequeno">de <Valor centavos={m.valor_total_centavos} /></p>}
              </div>
            </div>
          ))}
          {compras.data.total > compras.data.itens.length && (
            <p className="suave pequeno">Mostrando as {compras.data.itens.length} compras mais recentes de {compras.data.total}.</p>
          )}
        </div>
      )}
    </section>
  );
}
