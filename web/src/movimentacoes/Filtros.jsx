import { useState } from 'react';
import { ROTULOS_STATUS, ROTULOS_TIPO } from '../../../contratos/movimentacoes.js';
import { porId, rotuloCategoria, useCategorias, useContas } from '../compartilhado/dados.js';

const ORDENACOES = [
  ['data', 'Data'],
  ['valor', 'Valor'],
  ['descricao', 'Descrição'],
  ['criada', 'Criação'],
];

/** Filtros da listagem. O estado mora na URL (`params`); aqui só se lê e se grava. */
export function Filtros({ params, mudar }) {
  const contas = useContas();
  const categorias = useCategorias();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(params.get('q') ?? '');
  const mapa = porId(categorias.data?.itens);

  const ativos = ['tipo', 'status', 'conta_id', 'categoria_id', 'de', 'ate'].filter((k) => params.get(k)).length;
  const campo = (nome) => params.get(nome) ?? '';

  return (
    <div className="filtros">
      <form
        className="busca"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          mudar({ q: busca.trim() });
        }}
      >
        <label htmlFor="filtro-q" className="so-leitor">Buscar por descrição ou observação</label>
        <input
          id="filtro-q"
          type="search"
          placeholder="Buscar descrição ou observação"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button type="submit" className="botao">Buscar</button>
      </form>

      <button type="button" className="botao" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        Filtros{ativos > 0 ? ` (${ativos})` : ''}
      </button>

      {aberto && (
        <div className="painel-filtros cartao">
          <div className="campo">
            <label htmlFor="filtro-tipo">Tipo</label>
            <select id="filtro-tipo" value={campo('tipo')} onChange={(e) => mudar({ tipo: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(ROTULOS_TIPO).map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="filtro-status">Situação</label>
            <select id="filtro-status" value={campo('status')} onChange={(e) => mudar({ status: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(ROTULOS_STATUS).map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="filtro-conta">Conta</label>
            <select id="filtro-conta" value={campo('conta_id')} onChange={(e) => mudar({ conta_id: e.target.value })}>
              <option value="">Todas</option>
              {(contas.data?.itens ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="filtro-categoria">Categoria</label>
            <select
              id="filtro-categoria"
              value={campo('categoria_id')}
              onChange={(e) => mudar({ categoria_id: e.target.value })}
            >
              <option value="">Todas</option>
              {(categorias.data?.itens ?? []).map((c) => (
                <option key={c.id} value={c.id}>{rotuloCategoria(c, mapa)}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="filtro-campo-data">Filtrar datas por</label>
            <select
              id="filtro-campo-data"
              value={campo('campo_data') || 'competencia'}
              onChange={(e) => mudar({ campo_data: e.target.value === 'competencia' ? '' : e.target.value })}
            >
              <option value="competencia">Competência</option>
              <option value="vencimento">Vencimento</option>
              <option value="liquidacao">Liquidação</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="filtro-de">De</label>
            <input id="filtro-de" type="date" value={campo('de')} onChange={(e) => mudar({ de: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="filtro-ate">Até</label>
            <input id="filtro-ate" type="date" value={campo('ate')} onChange={(e) => mudar({ ate: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="filtro-ordem">Ordenar por</label>
            <select
              id="filtro-ordem"
              value={campo('ordenar') || 'data'}
              onChange={(e) => mudar({ ordenar: e.target.value === 'data' ? '' : e.target.value })}
            >
              {ORDENACOES.map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="filtro-direcao">Direção</label>
            <select
              id="filtro-direcao"
              value={campo('direcao') || 'desc'}
              onChange={(e) => mudar({ direcao: e.target.value === 'desc' ? '' : e.target.value })}
            >
              <option value="desc">Maior/mais recente primeiro</option>
              <option value="asc">Menor/mais antigo primeiro</option>
            </select>
          </div>
          <button
            type="button"
            className="botao"
            onClick={() => {
              setBusca('');
              mudar({
                q: '', tipo: '', status: '', conta_id: '', categoria_id: '', campo_data: '',
                de: '', ate: '', ordenar: '', direcao: '',
              });
            }}
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}
