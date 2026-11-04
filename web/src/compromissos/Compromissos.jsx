import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ROTULOS_SITUACAO } from '../../../contratos/compromissos.js';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { porId, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const TEXTOS = {
  despesa: { aba: 'A pagar', baixa: 'Dar baixa (paguei)', parcial: 'Pagar parte', campo: 'Valor pago', vazio: 'Nenhuma conta a pagar.' },
  receita: { aba: 'A receber', baixa: 'Dar baixa (recebi)', parcial: 'Receber parte', campo: 'Valor recebido', vazio: 'Nenhum recebimento pendente.' },
};

function BaixaParcial({ item, textos, fuso, aoFechar }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState(item.valor_centavos);
  const [data, setData] = useState(hojeIso(fuso));
  const baixar = useMutation({
    mutationFn: () =>
      api(`/compromissos/${item.id}/baixa-parcial`, {
        metodo: 'POST',
        corpo: { valor_centavos: valor ?? 0, data_liquidacao: data },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = baixar.error?.campos ?? {};
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        baixar.mutate();
      }}
    >
      <p className="suave pequeno">
        O que sobrar continua pendente, com o mesmo vencimento. Informe o valor inteiro para dar baixa completa.
      </p>
      <CampoValor
        id={`baixa-valor-${item.id}`}
        rotulo={textos.campo}
        inicial={item.valor_centavos}
        aoMudar={setValor}
        erro={campos.valor_centavos}
        autoFocus
      />
      <div className="campo">
        <label htmlFor={`baixa-data-${item.id}`}>Data</label>
        <input id={`baixa-data-${item.id}`} type="date" max={hojeIso(fuso)} value={data} onChange={(e) => setData(e.target.value)} />
        {campos.data_liquidacao && <p role="alert" className="erro campo-erro">{campos.data_liquidacao}</p>}
      </div>
      {baixar.error && !baixar.error.campos && <p role="alert" className="erro">{baixar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={baixar.isPending || valor == null || !data}>Confirmar</button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function Reagendar({ item, aoFechar }) {
  const invalidar = useInvalidarDados();
  const [data, setData] = useState(item.vencimento);
  const reagendar = useMutation({
    mutationFn: () => api(`/compromissos/${item.id}/reagendar`, { metodo: 'POST', corpo: { data_vencimento: data } }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = reagendar.error?.campos ?? {};
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        reagendar.mutate();
      }}
    >
      <div className="campo">
        <label htmlFor={`reag-data-${item.id}`}>Novo vencimento</label>
        <input id={`reag-data-${item.id}`} type="date" value={data} onChange={(e) => setData(e.target.value)} autoFocus />
        {campos.data_vencimento && <p role="alert" className="erro campo-erro">{campos.data_vencimento}</p>}
      </div>
      {reagendar.error && !reagendar.error.campos && <p role="alert" className="erro">{reagendar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={reagendar.isPending || !data}>Reagendar</button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function Compromisso({ item, contas, textos, fuso }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState(null);
  const liquidar = useMutation({
    mutationFn: () => api(`/movimentacoes/${item.id}/liquidar`, { metodo: 'POST', corpo: {} }),
    onSuccess: invalidar,
  });
  const entrada = item.tipo === 'receita';
  const etiqueta =
    item.situacao === 'atrasada'
      ? `Atrasada há ${item.dias_de_atraso} ${item.dias_de_atraso === 1 ? 'dia' : 'dias'}`
      : ROTULOS_SITUACAO[item.situacao];

  return (
    <li className="cartao compromisso">
      <div className="item-topo">
        <div>
          <strong>{item.descricao || (entrada ? 'Receita' : 'Despesa')}</strong>
          <p className="suave pequeno">
            Vence em {formatarData(item.vencimento)} · {contas.get(item.conta_id)?.nome ?? '—'}
            {item.recorrente && <span className="etiqueta"> Recorrente</span>}
            {item.baixa_de_id && <span className="etiqueta"> Restante</span>}
          </p>
        </div>
        <div className="saldo">
          <Valor centavos={item.valor_centavos} tipo={entrada ? 'entrada' : 'saida'} />
          <span className={`etiqueta ${item.situacao}`}>{etiqueta}</span>
        </div>
      </div>

      {modo === 'baixa' && <BaixaParcial item={item} textos={textos} fuso={fuso} aoFechar={() => setModo(null)} />}
      {modo === 'reagendar' && <Reagendar item={item} aoFechar={() => setModo(null)} />}

      {modo === null && (
        <div className="acoes acoes-compactas">
          <button type="button" className="botao-primario" onClick={() => liquidar.mutate()} disabled={liquidar.isPending}>
            {textos.baixa}
          </button>
          <button type="button" className="botao" onClick={() => setModo('baixa')}>{textos.parcial}</button>
          <button type="button" className="botao" onClick={() => setModo('reagendar')}>Reagendar</button>
          <Link className="botao" to={`/lancamentos/${item.id}`}>Editar</Link>
        </div>
      )}
      {liquidar.error && <p role="alert" className="erro">{liquidar.error.message}</p>}
    </li>
  );
}

export function Compromissos({ fuso }) {
  const [params, setParams] = useSearchParams();
  const tipo = params.get('tipo') === 'receita' ? 'receita' : 'despesa';
  const situacao = ['atrasada', 'a_vencer'].includes(params.get('situacao')) ? params.get('situacao') : '';
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const textos = TEXTOS[tipo];

  const contas = useContas();
  const consulta = useQuery({
    queryKey: ['compromissos', tipo, situacao, pagina],
    queryFn: () =>
      api(`/compromissos?${new URLSearchParams({ tipo, pagina, ...(situacao ? { situacao } : {}) })}`),
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

  if (consulta.isPending || contas.isPending) return <p className="carregando">Carregando…</p>;
  const erro = consulta.error ?? contas.error;
  if (erro) return <p className="erro">{erro.message}</p>;

  const { itens, total, por_pagina: porPagina, totais } = consulta.data;
  const mapaContas = porId(contas.data.itens);
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Compromissos</h1>
        <Link className="botao" to="/recorrencias">Recorrências</Link>
      </div>

      <div className="segmentado" role="group" aria-label="Tipo">
        {['despesa', 'receita'].map((t) => (
          <button key={t} type="button" className={tipo === t ? 'ativo' : ''} aria-pressed={tipo === t} onClick={() => mudar({ tipo: t === 'despesa' ? '' : t, situacao: '' })}>
            {TEXTOS[t].aba}
          </button>
        ))}
      </div>

      <div className="cartao">
        <h2>{textos.aba}</h2>
        <p className="suave pequeno">Pendente, ainda não liquidado. Atrasado é o que já passou do vencimento.</p>
        <div className="resumo-fatura">
          <p><span>Atrasado</span> <Valor centavos={totais.atrasado_centavos} tipo={tipo === 'receita' ? 'entrada' : 'saida'} /></p>
          <p><span>Vence nos próximos 7 dias</span> <Valor centavos={totais.vence_em_breve_centavos} /></p>
          <p><span>Depois disso</span> <Valor centavos={totais.depois_centavos} /></p>
          <p><strong>Total pendente</strong> <Valor centavos={totais.total_centavos} /></p>
        </div>
      </div>

      <div className="segmentado" role="group" aria-label="Situação">
        {[['', 'Todas'], ['atrasada', 'Atrasadas'], ['a_vencer', 'A vencer']].map(([valor, rotulo]) => (
          <button key={rotulo} type="button" className={situacao === valor ? 'ativo' : ''} aria-pressed={situacao === valor} onClick={() => mudar({ situacao: valor })}>
            {rotulo}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="cartao vazio">
          <p>{situacao ? 'Nada nesta situação.' : textos.vazio}</p>
          <p className="suave">
            Para criar um, registre um lançamento como <strong>pendente</strong> ou cadastre uma recorrência.
          </p>
          <div className="acoes">
            <Link className="botao-primario" to="/lancamentos/novo">Novo lançamento</Link>
            <Link className="botao" to="/recorrencias/nova">Nova recorrência</Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="lista-limpa">
            {itens.map((item) => (
              <Compromisso key={item.id} item={item} contas={mapaContas} textos={textos} fuso={fuso} />
            ))}
          </ul>
          <nav className="paginacao" aria-label="Paginação">
            <button type="button" className="botao" disabled={pagina <= 1} onClick={() => mudar({ pagina: String(pagina - 1) })}>Anterior</button>
            <span>Página {pagina} de {paginas} · {total} itens</span>
            <button type="button" className="botao" disabled={pagina >= paginas} onClick={() => mudar({ pagina: String(pagina + 1) })}>Próxima</button>
          </nav>
        </>
      )}
    </section>
  );
}
