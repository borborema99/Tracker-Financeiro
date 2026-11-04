import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData } from '../compartilhado/datas.js';
import { useCartoes, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';
import { Limite, StatusFatura, rotuloFatura } from './comum.jsx';

function corpoDe(cartao, mudancas) {
  return {
    nome: cartao.nome,
    limite_centavos: cartao.limite_centavos,
    dia_fechamento: cartao.dia_fechamento,
    dia_vencimento: cartao.dia_vencimento,
    conta_pagamento_id: cartao.conta_pagamento_id,
    arquivado: cartao.arquivado,
    ...mudancas,
  };
}

function FormularioCartao({ cartao, contas, aoConcluir }) {
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState(cartao?.nome ?? '');
  const [limite, setLimite] = useState(cartao?.limite_centavos ?? null);
  const [fechamento, setFechamento] = useState(String(cartao?.dia_fechamento ?? ''));
  const [vencimento, setVencimento] = useState(String(cartao?.dia_vencimento ?? ''));
  const [contaId, setContaId] = useState(String(cartao?.conta_pagamento_id ?? ''));

  const salvar = useMutation({
    mutationFn: () =>
      api(cartao ? `/cartoes/${cartao.id}` : '/cartoes', {
        metodo: cartao ? 'PUT' : 'POST',
        corpo: {
          nome,
          limite_centavos: limite ?? 0,
          dia_fechamento: Number(fechamento),
          dia_vencimento: Number(vencimento),
          conta_pagamento_id: contaId ? Number(contaId) : null,
          arquivado: cartao?.arquivado ?? false,
        },
      }),
    onSuccess: async () => {
      await invalidar();
      aoConcluir();
    },
  });
  const campos = salvar.error?.campos ?? {};

  return (
    <form
      className="cartao"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h2>{cartao ? 'Editar cartão' : 'Novo cartão'}</h2>
      <div className="campo">
        <label htmlFor="cartao-nome">Nome</label>
        <input id="cartao-nome" value={nome} maxLength={60} autoFocus onChange={(e) => setNome(e.target.value)} />
        {campos.nome && <p role="alert" className="erro campo-erro">{campos.nome}</p>}
      </div>
      <CampoValor
        id="cartao-limite"
        rotulo="Limite"
        inicial={cartao?.limite_centavos ?? null}
        aoMudar={setLimite}
        erro={campos.limite_centavos}
      />
      <div className="campos-lado">
        <div className="campo">
          <label htmlFor="cartao-fechamento">Dia do fechamento</label>
          <input
            id="cartao-fechamento"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            value={fechamento}
            onChange={(e) => setFechamento(e.target.value)}
          />
          {campos.dia_fechamento && <p role="alert" className="erro campo-erro">{campos.dia_fechamento}</p>}
        </div>
        <div className="campo">
          <label htmlFor="cartao-vencimento">Dia do vencimento</label>
          <input
            id="cartao-vencimento"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
          />
          {campos.dia_vencimento && <p role="alert" className="erro campo-erro">{campos.dia_vencimento}</p>}
        </div>
      </div>
      <p className="suave pequeno">
        Os dias vão de 1 a 28, para existirem em todos os meses. Mudar o fechamento só vale para as faturas novas.
      </p>
      <div className="campo">
        <label htmlFor="cartao-conta">Conta que paga a fatura (padrão)</label>
        <select id="cartao-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
          <option value="">Escolher na hora de pagar</option>
          {contas
            .filter((c) => !c.arquivada || String(c.id) === contaId)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
        </select>
      </div>
      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      <div className="acoes">
        <button
          type="submit"
          className="botao-primario"
          disabled={salvar.isPending || !nome.trim() || limite == null || !fechamento || !vencimento}
        >
          Salvar
        </button>
        <button type="button" className="botao" onClick={aoConcluir}>Cancelar</button>
      </div>
    </form>
  );
}

function ItemCartao({ cartao, aoEditar }) {
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const arquivar = useMutation({
    mutationFn: () =>
      api(`/cartoes/${cartao.id}`, { metodo: 'PUT', corpo: corpoDe(cartao, { arquivado: !cartao.arquivado }) }),
    onSuccess: invalidar,
  });
  const excluir = useMutation({
    mutationFn: () => api(`/cartoes/${cartao.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setConfirmando(false),
  });
  const erro = arquivar.error?.message ?? excluir.error?.message;
  const atual = cartao.fatura_atual;

  return (
    <li className={`cartao${cartao.arquivado ? ' arquivada' : ''}`}>
      <div className="item-topo">
        <div>
          <strong>{cartao.nome}</strong>
          <p className="suave">
            Fecha dia {cartao.dia_fechamento} · vence dia {cartao.dia_vencimento}
            {cartao.arquivado && <span className="etiqueta"> Arquivado</span>}
          </p>
        </div>
      </div>

      <Limite limite={cartao.limite} />

      <div className="linha-fatura">
        <div>
          <strong>{rotuloFatura(cartao.ciclo_atual.referencia)}</strong>
          <p className="suave pequeno">
            Fecha em {formatarData(cartao.ciclo_atual.data_fechamento)} · vence em{' '}
            {formatarData(cartao.ciclo_atual.data_vencimento)}
          </p>
        </div>
        <div className="direita">
          {atual ? (
            <>
              <Valor centavos={atual.total_centavos} tipo="saida" />
              <div><StatusFatura status={atual.status} /></div>
            </>
          ) : (
            <span className="suave pequeno">Sem compras</span>
          )}
        </div>
      </div>

      {erro && <p role="alert" className="erro">{erro}</p>}
      <div className="acoes">
        <Link className="botao-primario" to={`/cartoes/${cartao.id}`}>Faturas e compras</Link>
        {!cartao.arquivado && (
          <Link className="botao" to={`/cartoes/compras/nova?cartao=${cartao.id}`}>Nova compra</Link>
        )}
        <button type="button" className="botao" onClick={() => aoEditar(cartao)}>Editar</button>
        <button type="button" className="botao" onClick={() => arquivar.mutate()} disabled={arquivar.isPending}>
          {cartao.arquivado ? 'Reativar' : 'Arquivar'}
        </button>
        {confirmando ? (
          <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
            Confirmar exclusão
          </button>
        ) : (
          <button type="button" className="botao" onClick={() => setConfirmando(true)}>Excluir</button>
        )}
      </div>
    </li>
  );
}

export function Cartoes() {
  const cartoes = useCartoes();
  const contas = useContas();
  const [editando, setEditando] = useState(null); // null | 'novo' | cartão

  if (cartoes.isPending || contas.isPending) return <p className="carregando">Carregando…</p>;
  const erro = cartoes.error ?? contas.error;
  if (erro) return <p className="erro">{erro.message}</p>;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Cartões</h1>
        {!editando && (
          <button type="button" className="botao-primario" onClick={() => setEditando('novo')}>Novo cartão</button>
        )}
      </div>

      {editando && (
        <FormularioCartao
          key={editando === 'novo' ? 'novo' : editando.id}
          cartao={editando === 'novo' ? null : editando}
          contas={contas.data.itens}
          aoConcluir={() => setEditando(null)}
        />
      )}

      {cartoes.data.itens.length === 0 && !editando ? (
        <div className="cartao vazio">
          <p>Nenhum cartão ainda.</p>
          <p className="suave">Cadastre o limite e os dias de fechamento e vencimento para lançar compras e acompanhar as faturas.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {cartoes.data.itens.map((c) => (
            <ItemCartao key={c.id} cartao={c} aoEditar={setEditando} />
          ))}
        </ul>
      )}
    </section>
  );
}
