import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { diasDoMes, formatarData, hojeIso, nomeDoMes, somarMesesIso } from '../compartilhado/datas.js';
import { Valor } from '../compartilhado/Valor.jsx';

const PERIODOS = [
  { id: 'mes', rotulo: 'Este mês', meses: 1, atras: 0 },
  { id: 'passado', rotulo: 'Mês passado', meses: 1, atras: 1 },
  { id: 'trimestre', rotulo: 'Últimos 3 meses', meses: 3, atras: 0 },
  { id: 'ano', rotulo: 'Últimos 12 meses', meses: 12, atras: 0 },
];

/** Meses cheios: só navegação de calendário para montar as datas da consulta; o cálculo é do servidor. */
function intervaloDoPreset(preset, hoje) {
  const fim = somarMesesIso(hoje.slice(0, 7), -preset.atras);
  const inicio = somarMesesIso(fim, -(preset.meses - 1));
  return { de: `${inicio}-01`, ate: `${fim}-${String(diasDoMes(fim)).padStart(2, '0')}` };
}

const rotuloMes = (mes) => nomeDoMes(mes).replace(' de ', ' ');

function Variacao({ percentual }) {
  if (percentual == null) return <span className="suave pequeno">sem base de comparação</span>;
  if (percentual === 0) return <span className="suave pequeno">igual ao período anterior</span>;
  return (
    <span className="suave pequeno">
      {percentual > 0 ? 'alta' : 'queda'} de {Math.abs(percentual).toLocaleString('pt-BR')}% sobre o período anterior
    </span>
  );
}

function Evolucao() {
  const [meses, setMeses] = useState(6);
  const consulta = useQuery({ queryKey: ['relatorios', 'evolucao', meses], queryFn: () => api(`/relatorios/evolucao?meses=${meses}`) });
  const maior = consulta.data ? Math.max(1, ...consulta.data.meses.flatMap((m) => [m.receitas, m.despesas])) : 1;

  return (
    <div>
      <div className="titulo-com-acao">
        <h2>Evolução mês a mês</h2>
        <div className="acoes acoes-compactas">
          {[6, 12].map((n) => (
            <button key={n} type="button" className={n === meses ? 'botao-primario' : 'botao'} aria-pressed={n === meses} onClick={() => setMeses(n)}>
              {n} meses
            </button>
          ))}
        </div>
      </div>
      <p className="suave pequeno">Só o que foi liquidado, pela data de liquidação. Compras no cartão entram pela data da compra.</p>
      {consulta.isPending && <p className="carregando">Carregando…</p>}
      {consulta.error && <p className="erro">{consulta.error.message}</p>}
      {consulta.data && (
        <>
          {consulta.data.media ? (
            <div className="cartao">
              <h3>Média por mês</h3>
              <p className="suave pequeno">
                Desde o primeiro mês com movimento ({consulta.data.media.meses_considerados}{' '}
                {consulta.data.media.meses_considerados === 1 ? 'mês' : 'meses'}).
              </p>
              <p>Receitas <Valor centavos={consulta.data.media.receitas_centavos} tipo="entrada" /></p>
              <p>Despesas <Valor centavos={consulta.data.media.despesas_centavos} tipo="saida" /></p>
              <p>Resultado <Valor centavos={consulta.data.media.resultado_centavos} /></p>
            </div>
          ) : (
            <div className="cartao vazio">
              <p>Nenhum lançamento liquidado nesse período.</p>
            </div>
          )}
          <ul className="lista-limpa">
            {[...consulta.data.meses].reverse().map((m) => (
              <li key={m.mes} className="cartao">
                <strong>{rotuloMes(m.mes)}</strong>
                <p>Receitas <Valor centavos={m.receitas} tipo="entrada" /></p>
                <progress className="medidor concluida" max={maior} value={m.receitas} aria-label={`Receitas de ${rotuloMes(m.mes)}`} />
                <p>Despesas <Valor centavos={m.despesas} tipo="saida" /></p>
                <progress className="medidor estourado" max={maior} value={Math.max(m.despesas, 0)} aria-label={`Despesas de ${rotuloMes(m.mes)}`} />
                <p>Resultado <Valor centavos={m.resultado} /></p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PorCategoria({ periodo }) {
  const [tipo, setTipo] = useState('despesa');
  const consulta = useQuery({
    queryKey: ['relatorios', 'categorias', periodo.de, periodo.ate, tipo],
    queryFn: () => api(`/relatorios/categorias?de=${periodo.de}&ate=${periodo.ate}&tipo=${tipo}`),
  });
  const rotulo = tipo === 'despesa' ? 'Despesas' : 'Receitas';
  const sinal = tipo === 'despesa' ? 'saida' : 'entrada';

  return (
    <div>
      <div className="titulo-com-acao">
        <h2>{rotulo} por categoria</h2>
        <div className="acoes acoes-compactas">
          {[['despesa', 'Despesas'], ['receita', 'Receitas']].map(([id, nome]) => (
            <button key={id} type="button" className={id === tipo ? 'botao-primario' : 'botao'} aria-pressed={id === tipo} onClick={() => setTipo(id)}>
              {nome}
            </button>
          ))}
        </div>
      </div>
      {consulta.isPending && <p className="carregando">Carregando…</p>}
      {consulta.error && <p className="erro">{consulta.error.message}</p>}
      {consulta.data && (
        <>
          <div className="cartao">
            <h3>Total realizado</h3>
            <p className="destaque"><Valor centavos={consulta.data.total_centavos} tipo={sinal} /></p>
            <p className="suave pequeno">
              Período anterior ({formatarData(consulta.data.periodo_anterior.de)} a {formatarData(consulta.data.periodo_anterior.ate)}):{' '}
              <Valor centavos={consulta.data.total_anterior_centavos} />
            </p>
            <Variacao percentual={consulta.data.variacao_percentual} />
          </div>
          {consulta.data.itens.length === 0 ? (
            <div className="cartao vazio"><p>Nenhum lançamento liquidado nesse período.</p></div>
          ) : (
            <ul className="lista-limpa">
              {consulta.data.itens.map((i) => (
                <li key={i.categoria_id ?? 'sem'} className="cartao">
                  <div className="item-topo">
                    <strong>{i.nome}</strong>
                    {i.percentual != null && <span className="suave pequeno">{i.percentual.toLocaleString('pt-BR')}%</span>}
                  </div>
                  <p><Valor centavos={i.valor_centavos} tipo={sinal} /></p>
                  {i.percentual != null && (
                    <progress className="medidor" max={100} value={i.percentual} aria-label={`${i.percentual}% do total em ${i.nome}`} />
                  )}
                  <p className="suave pequeno">
                    Antes: <Valor centavos={i.anterior_centavos} /> · <Variacao percentual={i.variacao_percentual} />
                  </p>
                  {i.subcategorias.length > 0 && (
                    <ul className="lista-limpa">
                      {i.subcategorias.map((s) => (
                        <li key={s.categoria_id} className="linha-parcela">
                          <span className="linha-parcela-texto">{s.nome}</span>
                          <Valor centavos={s.valor_centavos} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function MaioresDespesas({ periodo }) {
  const consulta = useQuery({
    queryKey: ['relatorios', 'maiores', periodo.de, periodo.ate],
    queryFn: () => api(`/relatorios/maiores-despesas?de=${periodo.de}&ate=${periodo.ate}&limite=10`),
  });
  return (
    <div>
      <h2>Maiores despesas</h2>
      {consulta.isPending && <p className="carregando">Carregando…</p>}
      {consulta.error && <p className="erro">{consulta.error.message}</p>}
      {consulta.data &&
        (consulta.data.itens.length === 0 ? (
          <div className="cartao vazio"><p>Nenhuma despesa liquidada nesse período.</p></div>
        ) : (
          <ul className="lista-limpa">
            {consulta.data.itens.map((d, indice) => (
              <li key={`${d.origem}-${d.data}-${indice}`} className="cartao">
                <div className="item-topo">
                  <strong>{d.descricao || 'Sem descrição'}</strong>
                  <Valor centavos={d.valor_centavos} tipo="saida" />
                </div>
                <p className="suave pequeno">
                  {formatarData(d.data)} · {d.dividida ? 'Várias categorias' : (d.categoria_nome ?? 'Sem categoria')}
                  {d.origem === 'cartao' ? ' · compra no cartão' : ''}
                </p>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

export function Relatorios({ fuso }) {
  const hoje = hojeIso(fuso);
  const [presetId, setPresetId] = useState('mes');
  const [livre, setLivre] = useState(null); // { de, ate } do período personalizado
  const preset = PERIODOS.find((p) => p.id === presetId);
  const periodo = presetId === 'livre' && livre?.de && livre?.ate && livre.de <= livre.ate ? livre : preset ? intervaloDoPreset(preset, hoje) : intervaloDoPreset(PERIODOS[0], hoje);
  const personalizado = presetId === 'livre';

  return (
    <section>
      <h1>Relatórios</h1>
      <p className="suave pequeno">
        Os relatórios leem os mesmos números do Início: só o que já foi liquidado. Pagar fatura de cartão e transferir entre contas não são despesa.
      </p>

      <h2>Período</h2>
      <div className="acoes acoes-compactas">
        {PERIODOS.map((p) => (
          <button key={p.id} type="button" className={p.id === presetId ? 'botao-primario' : 'botao'} aria-pressed={p.id === presetId} onClick={() => setPresetId(p.id)}>
            {p.rotulo}
          </button>
        ))}
        <button type="button" className={personalizado ? 'botao-primario' : 'botao'} aria-pressed={personalizado} onClick={() => { setPresetId('livre'); setLivre((l) => l ?? intervaloDoPreset(PERIODOS[0], hoje)); }}>
          Personalizado
        </button>
      </div>
      {personalizado && (
        <div className="filtros">
          <div className="campo">
            <label htmlFor="rel-de">De</label>
            <input id="rel-de" type="date" value={livre?.de ?? ''} onChange={(e) => setLivre({ ...livre, de: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="rel-ate">Até</label>
            <input id="rel-ate" type="date" value={livre?.ate ?? ''} min={livre?.de} onChange={(e) => setLivre({ ...livre, ate: e.target.value })} />
          </div>
        </div>
      )}
      <p className="suave pequeno">
        {formatarData(periodo.de)} a {formatarData(periodo.ate)}
      </p>

      <PorCategoria periodo={periodo} />
      <MaioresDespesas periodo={periodo} />
      <Evolucao />
    </section>
  );
}
