import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ROTULOS_STATUS, ROTULOS_TIPO } from '../../../contratos/movimentacoes.js';
import { api } from '../compartilhado/api.js';
import { formatarData } from '../compartilhado/datas.js';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';
import { Filtros } from './Filtros.jsx';

const CHAVES = [
  'q', 'tipo', 'status', 'conta_id', 'categoria_id', 'campo_data', 'de', 'ate', 'ordenar', 'direcao', 'pagina',
];

function Acoes({ m }) {
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const mutar = (caminho, metodo = 'POST') => ({
    mutationFn: () => api(caminho, { metodo }),
    onSuccess: invalidar,
    onError: () => setConfirmando(false),
  });
  const liquidar = useMutation(mutar(`/movimentacoes/${m.id}/liquidar`));
  const reabrir = useMutation(mutar(`/movimentacoes/${m.id}/reabrir`));
  const excluir = useMutation(mutar(`/movimentacoes/${m.id}`, 'DELETE'));
  const erro = liquidar.error ?? reabrir.error ?? excluir.error;

  if (m.transferencia_id) {
    return (
      <div className="acoes acoes-compactas">
        <Link className="botao" to={`/lancamentos/${m.transferencia_id}`}>Abrir transferência</Link>
      </div>
    );
  }
  return (
    <div className="acoes acoes-compactas">
      <Link className="botao" to={`/lancamentos/${m.id}`}>Editar</Link>
      <Link className="botao" to={`/lancamentos/novo?duplicar=${m.id}`}>Duplicar</Link>
      {m.tipo === 'despesa' && m.reembolsavel_centavos > 0 && (
        <Link className="botao" to={`/lancamentos/novo?reembolso=${m.id}`}>Registrar reembolso</Link>
      )}
      <Link className="botao" to={`/lancamentos/${m.id}/historico`}>Histórico</Link>
      {m.status === 'pendente' ? (
        <button type="button" className="botao" onClick={() => liquidar.mutate()} disabled={liquidar.isPending}>
          Liquidar
        </button>
      ) : (
        <button type="button" className="botao" onClick={() => reabrir.mutate()} disabled={reabrir.isPending}>
          Reabrir
        </button>
      )}
      {confirmando ? (
        <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
          Confirmar exclusão
        </button>
      ) : (
        <button type="button" className="botao" onClick={() => setConfirmando(true)}>Excluir</button>
      )}
      {erro && <p role="alert" className="erro">{erro.message}</p>}
    </div>
  );
}

function Linha({ m, contas, categorias }) {
  const entrada = m.tipo === 'receita';
  const saida = m.tipo === 'despesa';
  const categoria = m.categoria_id
    ? rotuloCategoria(categorias.get(m.categoria_id) ?? { nome: '—' }, categorias)
    : m.divisoes?.length
      ? 'Dividida'
      : '—';
  const conta = contas.get(m.conta_id)?.nome ?? '—';
  const destino = m.conta_destino_id ? contas.get(m.conta_destino_id)?.nome : null;

  return (
    <tr className={m.status === 'pendente' ? 'pendente' : ''}>
      <td data-label="Data">{formatarData(m.data_competencia)}</td>
      <td data-label="Descrição">
        <strong>{m.descricao || ROTULOS_TIPO[m.tipo]}</strong>
        {m.transferencia_id && <span className="etiqueta"> Tarifa</span>}
        {m.reembolso_de_id && <span className="etiqueta"> Reembolso</span>}
        {m.reembolsado_centavos > 0 && (
          <span className="etiqueta"> Reembolsado <Valor centavos={m.reembolsado_centavos} tipo="entrada" /></span>
        )}
      </td>
      <td data-label="Categoria">{m.tipo === 'transferencia' ? 'Transferência' : categoria}</td>
      <td data-label="Conta">{destino ? `${conta} → ${destino}` : conta}</td>
      <td data-label="Situação">
        <span className={`etiqueta ${m.status}`}>{ROTULOS_STATUS[m.status]}</span>
      </td>
      <td data-label="Valor" className="coluna-valor">
        <Valor centavos={m.valor_centavos} tipo={entrada ? 'entrada' : saida ? 'saida' : 'neutro'} />
      </td>
      <td className="coluna-acoes">
        <Acoes m={m} />
      </td>
    </tr>
  );
}

export function Lancamentos() {
  const [params, setParams] = useSearchParams();
  const contas = useContas();
  const categorias = useCategorias();

  const filtros = Object.fromEntries(CHAVES.filter((k) => params.get(k)).map((k) => [k, params.get(k)]));
  const consulta = useQuery({
    queryKey: ['movimentacoes', filtros],
    queryFn: () => api(`/movimentacoes?${new URLSearchParams(filtros)}`),
    placeholderData: (anterior) => anterior,
  });

  function mudar(mudancas) {
    const novo = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) novo.set(k, v);
      else novo.delete(k);
    }
    if (!('pagina' in mudancas)) novo.delete('pagina');
    setParams(novo);
  }

  if (consulta.isPending || contas.isPending || categorias.isPending) return <p className="carregando">Carregando…</p>;
  const erro = consulta.error ?? contas.error ?? categorias.error;
  if (erro) return <p className="erro">{erro.message}</p>;

  const { itens, total, pagina, por_pagina: porPagina, totais } = consulta.data;
  const mapaContas = porId(contas.data.itens);
  const mapaCategorias = porId(categorias.data.itens);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const filtrando = Object.keys(filtros).some((k) => k !== 'pagina');

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Lançamentos</h1>
        <Link className="botao-primario" to="/lancamentos/novo">Novo lançamento</Link>
      </div>

      <Filtros params={params} mudar={mudar} />

      {total === 0 ? (
        <div className="cartao vazio">
          <p>{filtrando ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento ainda.'}</p>
          {!filtrando && <p className="suave">Use o botão “Novo lançamento” para registrar o primeiro.</p>}
        </div>
      ) : (
        <>
          <div className="totais-lista">
            <div className="cartao">
              <h2>Realizado (liquidado)</h2>
              <p>Receitas <Valor centavos={totais.realizado.receitas} tipo="entrada" /></p>
              <p>Despesas <Valor centavos={totais.realizado.despesas} tipo="saida" /></p>
              <p>Resultado <Valor centavos={totais.realizado.resultado} /></p>
            </div>
            <div className="cartao">
              <h2>Previsto (pendente)</h2>
              <p>A receber <Valor centavos={totais.previsto.receitas} tipo="entrada" /></p>
              <p>A pagar <Valor centavos={totais.previsto.despesas} tipo="saida" /></p>
            </div>
          </div>

          <table className="tabela-mov">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Descrição</th>
                <th scope="col">Categoria</th>
                <th scope="col">Conta</th>
                <th scope="col">Situação</th>
                <th scope="col" className="coluna-valor">Valor</th>
                <th scope="col"><span className="so-leitor">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((m) => (
                <Linha key={m.id} m={m} contas={mapaContas} categorias={mapaCategorias} />
              ))}
            </tbody>
          </table>

          <nav className="paginacao" aria-label="Paginação">
            <button type="button" className="botao" disabled={pagina <= 1} onClick={() => mudar({ pagina: String(pagina - 1) })}>
              Anterior
            </button>
            <span>Página {pagina} de {paginas} · {total} lançamentos</span>
            <button
              type="button"
              className="botao"
              disabled={pagina >= paginas}
              onClick={() => mudar({ pagina: String(pagina + 1) })}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
