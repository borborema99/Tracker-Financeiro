import { Suspense, lazy, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AGRUPAMENTOS, HORIZONTES, ROTULOS_AGRUPAMENTO } from '../../../contratos/fluxo.js';
import { api } from '../compartilhado/api.js';
import { diaDaSemana, diasDoMes, formatarData, hojeIso, nomeDoMes, rotuloDoPeriodo, somarMesesIso } from '../compartilhado/datas.js';
import { Valor } from '../compartilhado/Valor.jsx';

const GraficoFluxo = lazy(() => import('./GraficoFluxo.jsx'));
const GraficoProjecao = lazy(() => import('./GraficoProjecao.jsx'));

const ABAS = [
  ['realizado', 'Realizado'],
  ['projecao', 'Projeção'],
  ['calendario', 'Calendário'],
];

function Realizado({ fuso }) {
  const hoje = hojeIso(fuso);
  const [agrupar, setAgrupar] = useState('mes');
  const [de, setDe] = useState(`${hoje.slice(0, 4)}-01-01`);
  const [ate, setAte] = useState(hoje);
  const valido = de && ate && de <= ate;
  const consulta = useQuery({
    queryKey: ['fluxo', de, ate, agrupar],
    queryFn: () => api(`/fluxo?${new URLSearchParams({ de, ate, agrupar })}`),
    enabled: Boolean(valido),
    placeholderData: (anterior) => anterior,
  });

  return (
    <>
      <p className="suave pequeno">
        O que de fato entrou e saiu das contas (só liquidado). Compra no cartão só aparece quando a fatura é paga.
        Transferência entre suas contas não conta.
      </p>
      <div className="cartao filtros">
        <div className="painel-filtros">
          <div className="campo">
            <label htmlFor="fluxo-agrupar">Agrupar por</label>
            <select id="fluxo-agrupar" value={agrupar} onChange={(e) => setAgrupar(e.target.value)}>
              {AGRUPAMENTOS.map((a) => (
                <option key={a} value={a}>{ROTULOS_AGRUPAMENTO[a]}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fluxo-de">De</label>
            <input id="fluxo-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="fluxo-ate">Até</label>
            <input id="fluxo-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>
        {!valido && <p role="alert" className="erro">A data final não pode ser antes da inicial.</p>}
      </div>

      {consulta.isPending && valido && <p className="carregando">Carregando…</p>}
      {consulta.error && <p role="alert" className="erro">{consulta.error.message}</p>}
      {consulta.data && valido && (
        <>
          <div className="cartao resumo-fatura">
            <p><span>Entradas</span> <Valor centavos={consulta.data.totais.entradas_centavos} tipo="entrada" /></p>
            <p><span>Saídas</span> <Valor centavos={consulta.data.totais.saidas_centavos} tipo="saida" /></p>
            <p><strong>Resultado</strong> <Valor centavos={consulta.data.totais.resultado_centavos} /></p>
          </div>
          {consulta.data.periodos.length === 0 ? (
            <div className="cartao vazio"><p>Nada liquidado neste período.</p></div>
          ) : (
            <>
              <div className="cartao">
                <Suspense fallback={<p className="carregando">Carregando gráfico…</p>}>
                  <GraficoFluxo periodos={consulta.data.periodos} agrupar={agrupar} />
                </Suspense>
              </div>
              <table className="tabela-mov">
                <thead>
                  <tr>
                    <th scope="col">Período</th>
                    <th scope="col" className="coluna-valor">Entradas</th>
                    <th scope="col" className="coluna-valor">Saídas</th>
                    <th scope="col" className="coluna-valor">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.periodos.map((p) => (
                    <tr key={p.periodo}>
                      <td data-label="Período">{rotuloDoPeriodo(p.periodo, agrupar)}</td>
                      <td data-label="Entradas" className="coluna-valor"><Valor centavos={p.entradas_centavos} tipo="entrada" /></td>
                      <td data-label="Saídas" className="coluna-valor"><Valor centavos={p.saidas_centavos} tipo="saida" /></td>
                      <td data-label="Resultado" className="coluna-valor"><Valor centavos={p.resultado_centavos} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  );
}

function Projecao() {
  const [dias, setDias] = useState(30);
  const consulta = useQuery({
    queryKey: ['projecao-saldo', dias],
    queryFn: () => api(`/fluxo/projecao?dias=${dias}`),
    placeholderData: (anterior) => anterior,
  });
  const p = consulta.data;

  return (
    <>
      <p className="suave pequeno">
        Previsão do saldo total das contas: parte do saldo de hoje e aplica compromissos pendentes e faturas de cartão em aberto,
        no dia do vencimento. O que já venceu e não foi baixado pesa em hoje.
      </p>
      <div className="segmentado" role="group" aria-label="Horizonte">
        {HORIZONTES.map((h) => (
          <button key={h} type="button" className={dias === h ? 'ativo' : ''} aria-pressed={dias === h} onClick={() => setDias(h)}>
            {h} dias
          </button>
        ))}
      </div>
      {consulta.isPending && <p className="carregando">Carregando…</p>}
      {consulta.error && <p role="alert" className="erro">{consulta.error.message}</p>}
      {p && (
        <>
          <div className="cartao resumo-fatura">
            <p><span>Saldo hoje</span> <Valor centavos={p.saldo_inicial_centavos} /></p>
            <p><span>Menor saldo (em {formatarData(p.saldo_minimo.data)})</span> <Valor centavos={p.saldo_minimo.centavos} /></p>
            <p><strong>Saldo em {formatarData(p.serie.at(-1).data)}</strong> <Valor centavos={p.saldo_final_centavos} /></p>
            {(p.atrasados.saidas_centavos > 0 || p.atrasados.entradas_centavos > 0) && (
              <p className="suave pequeno">
                <span>Já considerando atrasados: a pagar</span> <Valor centavos={p.atrasados.saidas_centavos} tipo="saida" />
                <span> · a receber</span> <Valor centavos={p.atrasados.entradas_centavos} tipo="entrada" />
              </p>
            )}
          </div>

          {p.periodos_negativos.length > 0 && (
            <div className="cartao alerta alerta-alta" role="status">
              <strong>Saldo projetado negativo</strong>
              <ul className="lista-limpa">
                {p.periodos_negativos.map((n) => (
                  <li key={n.de}>
                    {n.de === n.ate ? formatarData(n.de) : `${formatarData(n.de)} a ${formatarData(n.ate)}`}: chega a{' '}
                    <Valor centavos={n.minimo_centavos} tipo="saida" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="cartao">
            <Suspense fallback={<p className="carregando">Carregando gráfico…</p>}>
              <GraficoProjecao serie={p.serie} />
            </Suspense>
          </div>

          <details className="mais-opcoes">
            <summary>Dias com movimento previsto</summary>
            {p.serie.filter((d) => d.entradas_centavos > 0 || d.saidas_centavos > 0).length === 0 ? (
              <p className="suave">Nada previsto neste período.</p>
            ) : (
              <ul className="lista-limpa">
                {p.serie
                  .filter((d) => d.entradas_centavos > 0 || d.saidas_centavos > 0)
                  .map((d) => (
                    <li key={d.data} className="linha-fatura">
                      <span>{formatarData(d.data)}</span>
                      <span className="direita">
                        {d.entradas_centavos > 0 && <Valor centavos={d.entradas_centavos} tipo="entrada" />}{' '}
                        {d.saidas_centavos > 0 && <Valor centavos={d.saidas_centavos} tipo="saida" />}
                        <span className="suave pequeno"> saldo </span>
                        <Valor centavos={d.saldo_centavos} />
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </details>
        </>
      )}
    </>
  );
}

const ROTULOS_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function Calendario({ fuso }) {
  const hoje = hojeIso(fuso);
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [escolhido, setEscolhido] = useState(null);
  const consulta = useQuery({
    queryKey: ['calendario', mes],
    queryFn: () => api(`/calendario?mes=${mes}`),
    placeholderData: (anterior) => anterior,
  });
  const porDia = new Map((consulta.data?.dias ?? []).map((d) => [d.data, d]));
  const total = diasDoMes(mes);
  const dias = Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
  const escolha = escolhido && escolhido.startsWith(mes) ? porDia.get(escolhido) : null;

  return (
    <>
      <p className="suave pequeno">Vencimentos do mês: compromissos pendentes e faturas de cartão em aberto.</p>
      <div className="navegacao-mes">
        <button type="button" className="botao" onClick={() => setMes(somarMesesIso(mes, -1))} aria-label="Mês anterior">‹</button>
        <strong>{nomeDoMes(mes)}</strong>
        <button type="button" className="botao" onClick={() => setMes(somarMesesIso(mes, 1))} aria-label="Próximo mês">›</button>
      </div>
      {consulta.error && <p role="alert" className="erro">{consulta.error.message}</p>}
      <div className="calendario" role="group" aria-label={`Calendário de ${nomeDoMes(mes)}`}>
        {ROTULOS_DIA.map((r) => (
          <span key={r} className="cab-dia">{r}</span>
        ))}
        {dias.map((data, i) => {
          const d = porDia.get(data);
          const atrasado = d?.itens.some((x) => x.situacao === 'atrasada');
          return (
            <button
              key={data}
              type="button"
              className={[
                'dia-cal',
                i === 0 ? `inicio-${diaDaSemana(data)}` : '',
                data === hoje ? 'hoje' : '',
                d ? 'com-itens' : '',
                atrasado ? 'com-atraso' : '',
                escolhido === data ? 'escolhido' : '',
              ].join(' ')}
              onClick={() => setEscolhido(data)}
              aria-pressed={escolhido === data}
              aria-label={`${formatarData(data)}${d ? `: ${d.itens.length} ${d.itens.length === 1 ? 'item' : 'itens'}` : ''}`}
            >
              <span>{i + 1}</span>
              {d && <span className="marca-dia" aria-hidden="true">{d.itens.length}</span>}
            </button>
          );
        })}
      </div>

      {escolhido && escolhido.startsWith(mes) && (
        <div className="cartao">
          <h2>{formatarData(escolhido)}</h2>
          {!escolha ? (
            <p className="suave">Nada vence neste dia.</p>
          ) : (
            <>
              <ul className="lista-limpa">
                {escolha.itens.map((item) => (
                  <li key={`${item.tipo}-${item.id}`} className="linha-fatura">
                    <div>
                      <Link to={item.tipo === 'fatura' ? `/faturas/${item.id}` : `/lancamentos/${item.id}`}>
                        <strong>{item.descricao || (item.tipo === 'receita' ? 'Receita' : 'Despesa')}</strong>
                      </Link>
                      <p className="suave pequeno">
                        {item.tipo === 'fatura' ? 'Fatura de cartão' : item.tipo === 'receita' ? 'A receber' : 'A pagar'}
                        {item.situacao === 'atrasada' && <span className="etiqueta atrasada"> Atrasada</span>}
                      </p>
                    </div>
                    <Valor centavos={item.valor_centavos} tipo={item.tipo === 'receita' ? 'entrada' : 'saida'} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function Fluxo({ fuso }) {
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some(([k]) => k === params.get('aba')) ? params.get('aba') : 'realizado';

  return (
    <section>
      <h1>Fluxo de caixa</h1>
      <div className="segmentado" role="group" aria-label="Visão">
        {ABAS.map(([k, rotulo]) => (
          <button key={k} type="button" className={aba === k ? 'ativo' : ''} aria-pressed={aba === k} onClick={() => setParams(k === 'realizado' ? {} : { aba: k })}>
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'realizado' && <Realizado fuso={fuso} />}
      {aba === 'projecao' && <Projecao />}
      {aba === 'calendario' && <Calendario fuso={fuso} />}
    </section>
  );
}
