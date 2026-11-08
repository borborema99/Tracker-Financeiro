import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { formatarData } from '../compartilhado/datas.js';
import { useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const SUFIXO = { semanal: 'por semana', quinzenal: 'a cada 15 dias', mensal: 'por mês', anual: 'por ano' };

function Linha({ a }) {
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const alternar = useMutation({
    mutationFn: () => api(`/assinaturas/${a.id}/${a.ativa ? 'pausar' : 'reativar'}`, { metodo: 'POST' }),
    onSuccess: invalidar,
  });
  const excluir = useMutation({
    mutationFn: () => api(`/recorrencias/${a.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setConfirmando(false),
  });
  const erro = alternar.error ?? excluir.error;

  return (
    <li className={`cartao ${a.ativa ? '' : 'arquivada'}`}>
      <div className="item-topo">
        <div>
          <strong>{a.descricao}</strong> {!a.ativa && <span className="etiqueta">Pausada</span>}
          <p className="suave pequeno">
            <Valor centavos={a.valor_centavos} tipo="saida" /> {SUFIXO[a.frequencia]}
          </p>
          {a.frequencia !== 'mensal' && (
            <p className="suave pequeno">Equivale a <Valor centavos={a.custo_mensal_centavos} /> por mês</p>
          )}
          <p className="suave pequeno">
            {!a.ativa ? 'Sem cobranças futuras enquanto estiver pausada' : a.proximo_vencimento ? `Próxima cobrança: ${formatarData(a.proximo_vencimento)}` : 'Sem próxima cobrança pendente'}
          </p>
        </div>
      </div>
      <div className="acoes acoes-compactas">
        <button type="button" className="botao" onClick={() => alternar.mutate()} disabled={alternar.isPending}>
          {a.ativa ? 'Pausar' : 'Reativar'}
        </button>
        <Link className="botao" to={`/recorrencias/${a.id}`}>Editar</Link>
        {confirmando ? (
          <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>Confirmar exclusão</button>
        ) : (
          <button type="button" className="botao" onClick={() => setConfirmando(true)}>Excluir</button>
        )}
      </div>
      {!a.ativa && <p className="suave pequeno">Ao reativar, só as próximas cobranças voltam; as do período pausado não são recriadas.</p>}
      {erro && <p role="alert" className="erro">{erro.message}</p>}
    </li>
  );
}

export function Assinaturas() {
  const lista = useQuery({ queryKey: ['assinaturas'], queryFn: () => api('/assinaturas') });
  if (lista.isPending) return <p className="carregando">Carregando…</p>;
  if (lista.error) return <p className="erro">{lista.error.message}</p>;
  const { itens, totais } = lista.data;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Assinaturas</h1>
        <Link className="botao-primario" to="/recorrencias/nova?assinatura=1">Nova assinatura</Link>
      </div>
      <p className="suave pequeno">
        Cobranças que se repetem (streaming, academia, software). Cada cobrança vira uma conta a pagar em Compromissos.
      </p>
      {totais.ativas > 0 && (
        <div className="cartao">
          <h2>Quanto custam</h2>
          <p>Por mês (equivalente) <Valor centavos={totais.mensal_centavos} tipo="saida" /></p>
          <p>Por ano <Valor centavos={totais.anual_centavos} tipo="saida" /></p>
          <p className="suave pequeno">
            {totais.ativas} {totais.ativas === 1 ? 'ativa' : 'ativas'}
            {totais.pausadas > 0 && `; ${totais.pausadas} pausada(s) não entram na conta`}.
          </p>
        </div>
      )}
      {itens.length === 0 ? (
        <div className="cartao vazio">
          <p>Nenhuma assinatura cadastrada.</p>
          <p className="suave">Cadastre as suas para ver quanto custam por mês e por ano e quando a próxima cobrança chega.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {itens.map((a) => (
            <Linha key={a.id} a={a} />
          ))}
        </ul>
      )}
    </section>
  );
}
