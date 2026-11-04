import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { porId, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';
import { StatusFatura, rotuloFatura } from './comum.jsx';

const CHAVE_ULTIMA_CONTA = 'tracker.ultimaConta';

function ultimaContaUsada() {
  try {
    return Number(localStorage.getItem(CHAVE_ULTIMA_CONTA));
  } catch {
    return 0;
  }
}

function Pagar({ fatura, contas, fuso }) {
  const invalidar = useInvalidarDados();
  const ativas = contas.filter((c) => !c.arquivada);
  const padrao =
    ativas.find((c) => c.id === fatura.cartao.conta_pagamento_id) ??
    ativas.find((c) => c.id === ultimaContaUsada()) ??
    ativas[0];
  const [valor, setValor] = useState(fatura.saldo_centavos);
  const [contaId, setContaId] = useState(String(padrao?.id ?? ''));
  const [data, setData] = useState(hojeIso(fuso));

  const pagar = useMutation({
    mutationFn: () =>
      api(`/faturas/${fatura.id}/pagamentos`, {
        metodo: 'POST',
        corpo: { valor_centavos: valor ?? 0, conta_id: Number(contaId), data_pagamento: data },
      }),
    onSuccess: invalidar,
  });
  const campos = pagar.error?.campos ?? {};

  if (ativas.length === 0) {
    return (
      <div className="cartao vazio">
        <p>Para pagar a fatura, crie uma conta.</p>
        <Link className="botao-primario" to="/contas">Ir para Contas</Link>
      </div>
    );
  }

  return (
    <form
      className="cartao"
      onSubmit={(e) => {
        e.preventDefault();
        pagar.mutate();
      }}
    >
      <h2>Pagar fatura</h2>
      <p className="suave pequeno">
        O valor sai da conta escolhida e abate a fatura. Não vira despesa nova: a compra já foi contada.
      </p>
      <CampoValor
        key={fatura.saldo_centavos}
        id="pagamento-valor"
        rotulo="Valor (o que falta pagar já vem preenchido)"
        inicial={fatura.saldo_centavos}
        aoMudar={setValor}
        erro={campos.valor_centavos}
      />
      <div className="campo">
        <label htmlFor="pagamento-conta">Pagar com a conta</label>
        <select id="pagamento-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {ativas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        {campos.conta_id && <p role="alert" className="erro campo-erro">{campos.conta_id}</p>}
      </div>
      <div className="campo">
        <label htmlFor="pagamento-data">Data do pagamento</label>
        <input id="pagamento-data" type="date" max={hojeIso(fuso)} value={data} onChange={(e) => setData(e.target.value)} />
        {campos.data_pagamento && <p role="alert" className="erro campo-erro">{campos.data_pagamento}</p>}
      </div>
      {pagar.error && !pagar.error.campos && <p role="alert" className="erro">{pagar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={pagar.isPending || valor == null || !contaId}>
          Pagar
        </button>
      </div>
    </form>
  );
}

function LinhaPagamento({ pagamento, contas }) {
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const excluir = useMutation({
    mutationFn: () => api(`/pagamentos-fatura/${pagamento.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setConfirmando(false),
  });
  return (
    <div className="linha-fatura">
      <div>
        <strong>Pagamento em {formatarData(pagamento.data_pagamento)}</strong>
        <p className="suave pequeno">Conta: {contas.get(pagamento.conta_id)?.nome ?? '—'}</p>
        {excluir.error && <p role="alert" className="erro">{excluir.error.message}</p>}
      </div>
      <div className="direita">
        <Valor centavos={pagamento.valor_centavos} />
        <div>
          {confirmando ? (
            <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
              Confirmar exclusão
            </button>
          ) : (
            <button type="button" className="botao" onClick={() => setConfirmando(true)}>Excluir</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Fatura({ fuso }) {
  const { id } = useParams();
  const fatura = useQuery({ queryKey: ['fatura', id], queryFn: () => api(`/faturas/${id}`) });
  const contas = useContas();

  if (fatura.isPending || contas.isPending) return <p className="carregando">Carregando…</p>;
  const erro = fatura.error ?? contas.error;
  if (erro) return <p className="erro">{erro.message}</p>;

  const f = fatura.data;
  const mapaContas = porId(contas.data.itens);
  return (
    <section>
      <h1>{rotuloFatura(f.referencia)}</h1>
      <p className="suave">
        <Link to={`/cartoes/${f.cartao.id}`}>{f.cartao.nome}</Link> · fecha em {formatarData(f.data_fechamento)} · vence em{' '}
        {formatarData(f.data_vencimento)} · <StatusFatura status={f.status} />
      </p>

      <div className="cartao resumo-fatura">
        <p><span>Compras e parcelas</span> <Valor centavos={f.bruto_centavos} /></p>
        {f.credito_centavos > 0 && (
          <p><span>Créditos de estorno</span> <Valor centavos={f.credito_centavos} tipo="entrada" /></p>
        )}
        <p><strong>Total da fatura</strong> <Valor centavos={f.total_centavos} tipo="saida" /></p>
        <p><span>Já pago</span> <Valor centavos={f.pago_centavos} /></p>
        <p><strong>Falta pagar</strong> <Valor centavos={f.saldo_centavos} tipo="saida" /></p>
        {f.credito_a_transportar_centavos > 0 && (
          <p className="suave pequeno">
            <span>Sobra de crédito que segue para a próxima fatura</span>{' '}
            <Valor centavos={f.credito_a_transportar_centavos} tipo="entrada" />
          </p>
        )}
      </div>

      <h2>Compras nesta fatura</h2>
      <div className="cartao">
        {f.parcelas.length === 0 && <p className="suave">Nenhuma compra nesta fatura.</p>}
        {f.parcelas.map((p) => (
          <div key={`${p.compra_id}-${p.numero}`} className="linha-fatura">
            <div>
              <Link to={`/cartoes/compras/${p.compra_id}`}><strong>{p.descricao || 'Compra no cartão'}</strong></Link>
              <p className="suave pequeno">
                {p.parcelas_total > 1 ? `Parcela ${p.numero} de ${p.parcelas_total} · ` : ''}
                compra em {formatarData(p.data_compra)}
              </p>
            </div>
            <Valor centavos={p.valor_centavos} tipo="saida" />
          </div>
        ))}
      </div>

      {f.estornos.length > 0 && (
        <>
          <h2>Estornos (crédito)</h2>
          <div className="cartao">
            {f.estornos.map((e) => (
              <div key={e.id} className="linha-fatura">
                <div>
                  <Link to={`/cartoes/compras/${e.compra_id}`}><strong>{e.descricao || 'Estorno'}</strong></Link>
                  <p className="suave pequeno">
                    {e.compra_descricao || 'Compra no cartão'} · {formatarData(e.data_estorno)}
                  </p>
                </div>
                <Valor centavos={e.valor_centavos} tipo="entrada" />
              </div>
            ))}
          </div>
        </>
      )}

      {f.pagamentos.length > 0 && (
        <>
          <h2>Pagamentos</h2>
          <div className="cartao">
            {f.pagamentos.map((p) => (
              <LinhaPagamento key={p.id} pagamento={p} contas={mapaContas} />
            ))}
          </div>
        </>
      )}

      {f.saldo_centavos > 0 && <Pagar fatura={f} contas={contas.data.itens} fuso={fuso} />}
    </section>
  );
}
