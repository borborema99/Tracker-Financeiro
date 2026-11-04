import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ROTULOS_TIPO_CONTA, TIPOS_CONTA } from '../../../contratos/contas.js';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

function FormularioConta({ conta, aoConcluir }) {
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState(conta?.nome ?? '');
  const [tipo, setTipo] = useState(conta?.tipo ?? 'corrente');
  const [saldo, setSaldo] = useState(conta?.saldo_inicial_centavos ?? 0);

  const salvar = useMutation({
    mutationFn: () =>
      api(conta ? `/contas/${conta.id}` : '/contas', {
        metodo: conta ? 'PUT' : 'POST',
        corpo: { nome, tipo, saldo_inicial_centavos: saldo ?? 0, arquivada: conta?.arquivada ?? false },
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
      <h2>{conta ? 'Editar conta' : 'Nova conta'}</h2>
      <div className="campo">
        <label htmlFor="conta-nome">Nome</label>
        <input id="conta-nome" value={nome} maxLength={60} autoFocus onChange={(e) => setNome(e.target.value)} />
        {campos.nome && <p role="alert" className="erro campo-erro">{campos.nome}</p>}
      </div>
      <div className="campo">
        <label htmlFor="conta-tipo">Tipo</label>
        <select id="conta-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_CONTA.map((t) => (
            <option key={t} value={t}>{ROTULOS_TIPO_CONTA[t]}</option>
          ))}
        </select>
      </div>
      <CampoValor
        id="conta-saldo"
        rotulo="Saldo inicial"
        inicial={conta?.saldo_inicial_centavos ?? 0}
        aoMudar={setSaldo}
        permitirNegativo
      />
      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending}>Salvar</button>
        <button type="button" className="botao" onClick={aoConcluir}>Cancelar</button>
      </div>
    </form>
  );
}

function CartaoConta({ conta, aoEditar }) {
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const arquivar = useMutation({
    mutationFn: () =>
      api(`/contas/${conta.id}`, {
        metodo: 'PUT',
        corpo: {
          nome: conta.nome,
          tipo: conta.tipo,
          saldo_inicial_centavos: conta.saldo_inicial_centavos,
          arquivada: !conta.arquivada,
        },
      }),
    onSuccess: invalidar,
  });
  const excluir = useMutation({
    mutationFn: () => api(`/contas/${conta.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setConfirmando(false),
  });
  const erro = arquivar.error?.message ?? excluir.error?.message;

  return (
    <li className={`cartao item-conta${conta.arquivada ? ' arquivada' : ''}`}>
      <div className="item-topo">
        <div>
          <strong>{conta.nome}</strong>
          <p className="suave">
            {ROTULOS_TIPO_CONTA[conta.tipo]}
            {conta.arquivada && <span className="etiqueta"> Arquivada</span>}
          </p>
        </div>
        <div className="saldo">
          <span className="suave">Saldo atual</span>
          <Valor centavos={conta.saldo_centavos} />
        </div>
      </div>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <div className="acoes">
        <button type="button" className="botao" onClick={() => aoEditar(conta)}>Editar</button>
        <button type="button" className="botao" onClick={() => arquivar.mutate()} disabled={arquivar.isPending}>
          {conta.arquivada ? 'Reativar' : 'Arquivar'}
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

export function Contas() {
  const { data, isPending, error } = useContas();
  const [editando, setEditando] = useState(null); // null | 'nova' | conta

  if (isPending) return <p className="carregando">Carregando…</p>;
  if (error) return <p className="erro">{error.message}</p>;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Contas</h1>
        {!editando && (
          <button type="button" className="botao-primario" onClick={() => setEditando('nova')}>Nova conta</button>
        )}
      </div>

      {editando && (
        <FormularioConta
          key={editando === 'nova' ? 'nova' : editando.id}
          conta={editando === 'nova' ? null : editando}
          aoConcluir={() => setEditando(null)}
        />
      )}

      {data.itens.length === 0 && !editando ? (
        <div className="cartao vazio">
          <p>Nenhuma conta ainda.</p>
          <p className="suave">Crie uma conta corrente, poupança ou carteira para começar a lançar.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {data.itens.map((c) => (
            <CartaoConta key={c.id} conta={c} aoEditar={setEditando} />
          ))}
        </ul>
      )}
    </section>
  );
}
