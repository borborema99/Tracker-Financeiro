import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ROTULOS_DE_INVESTIMENTO, TIPOS_DE_INVESTIMENTO } from '../../../contratos/investimentos.js';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const percentual = (n) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function FormularioInvestimento({ origem, aoFechar }) {
  const invalidar = useInvalidarDados();
  const sufixo = origem?.id ?? 'novo';
  const [nome, setNome] = useState(origem?.nome ?? '');
  const [tipo, setTipo] = useState(origem?.tipo ?? 'renda_fixa');
  const [instituicao, setInstituicao] = useState(origem?.instituicao ?? '');
  const [observacao, setObservacao] = useState(origem?.observacao ?? '');
  const salvar = useMutation({
    mutationFn: () =>
      api(origem ? `/investimentos/${origem.id}` : '/investimentos', {
        metodo: origem ? 'PUT' : 'POST',
        corpo: { nome, tipo, instituicao, observacao },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = salvar.error?.campos ?? {};
  const erroDe = (c) => campos[c] && <p role="alert" className="erro campo-erro">{campos[c]}</p>;

  return (
    <form
      className="cartao"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h2>{origem ? 'Editar investimento' : 'Novo investimento'}</h2>
      <div className="campo">
        <label htmlFor={`inv-nome-${sufixo}`}>Nome</label>
        <input id={`inv-nome-${sufixo}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
        {erroDe('nome')}
      </div>
      <div className="campo">
        <label htmlFor={`inv-tipo-${sufixo}`}>Tipo</label>
        <select id={`inv-tipo-${sufixo}`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_DE_INVESTIMENTO.map((t) => (
            <option key={t} value={t}>{ROTULOS_DE_INVESTIMENTO[t]}</option>
          ))}
        </select>
        {erroDe('tipo')}
      </div>
      <div className="campo">
        <label htmlFor={`inv-inst-${sufixo}`}>Instituição (opcional)</label>
        <input id={`inv-inst-${sufixo}`} value={instituicao} onChange={(e) => setInstituicao(e.target.value)} maxLength={120} />
        {erroDe('instituicao')}
      </div>
      <div className="campo">
        <label htmlFor={`inv-obs-${sufixo}`}>Observação</label>
        <textarea id={`inv-obs-${sufixo}`} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
      </div>
      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending || !nome.trim()}>Salvar</button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormularioOperacao({ investimento, tipo, fuso, aoFechar }) {
  const invalidar = useInvalidarDados();
  const contas = useContas();
  const [valor, setValor] = useState(null);
  const [data, setData] = useState(hojeIso(fuso));
  const [contaId, setContaId] = useState('');
  const registrar = useMutation({
    mutationFn: () =>
      api(`/investimentos/${investimento.id}/operacoes`, {
        metodo: 'POST',
        corpo: { tipo, valor_centavos: valor ?? 0, data, conta_id: contaId ? Number(contaId) : null, observacao: '' },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = registrar.error?.campos ?? {};
  const ativas = (contas.data?.itens ?? []).filter((c) => !c.arquivada);
  const sufixo = `${investimento.id}-${tipo}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        registrar.mutate();
      }}
    >
      <CampoValor id={`op-valor-${sufixo}`} rotulo={tipo === 'aporte' ? 'Valor aplicado' : 'Valor resgatado'} aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      <div className="campo">
        <label htmlFor={`op-data-${sufixo}`}>Data</label>
        <input id={`op-data-${sufixo}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
        {campos.data && <p role="alert" className="erro campo-erro">{campos.data}</p>}
      </div>
      <div className="campo">
        <label htmlFor={`op-conta-${sufixo}`}>{tipo === 'aporte' ? 'Sai de qual conta?' : 'Cai em qual conta?'}</label>
        <select id={`op-conta-${sufixo}`} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          <option value="">Nenhuma (não mexer no saldo de conta)</option>
          {ativas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        {campos.conta_id && <p role="alert" className="erro campo-erro">{campos.conta_id}</p>}
      </div>
      {registrar.error && !registrar.error.campos && <p role="alert" className="erro">{registrar.error.message}</p>}
      <div className="acoes acoes-compactas">
        <button type="submit" className="botao-primario" disabled={registrar.isPending || valor == null || valor === 0}>
          {tipo === 'aporte' ? 'Registrar aporte' : 'Registrar resgate'}
        </button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormularioAvaliacao({ investimento, fuso, aoFechar }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState(null);
  const [data, setData] = useState(hojeIso(fuso));
  const registrar = useMutation({
    mutationFn: () => api(`/investimentos/${investimento.id}/avaliacoes`, { metodo: 'POST', corpo: { data, valor_centavos: valor ?? 0 } }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = registrar.error?.campos ?? {};
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        registrar.mutate();
      }}
    >
      <p className="suave pequeno">Informe quanto o investimento vale hoje, como aparece no extrato da corretora ou do banco.</p>
      <CampoValor id={`av-valor-${investimento.id}`} rotulo="Valor atual" aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      <div className="campo">
        <label htmlFor={`av-data-${investimento.id}`}>Data da avaliação</label>
        <input id={`av-data-${investimento.id}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
        {campos.data && <p role="alert" className="erro campo-erro">{campos.data}</p>}
      </div>
      {registrar.error && !registrar.error.campos && <p role="alert" className="erro">{registrar.error.message}</p>}
      <div className="acoes acoes-compactas">
        <button type="submit" className="botao-primario" disabled={registrar.isPending || valor == null}>Registrar valor</button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function Historico({ investimentoId }) {
  const invalidar = useInvalidarDados();
  const detalhe = useQuery({ queryKey: ['investimento', investimentoId], queryFn: () => api(`/investimentos/${investimentoId}`) });
  const removerOperacao = useMutation({
    mutationFn: (id) => api(`/investimentos/${investimentoId}/operacoes/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  const removerAvaliacao = useMutation({
    mutationFn: (id) => api(`/investimentos/${investimentoId}/avaliacoes/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  if (detalhe.isPending) return <p className="carregando">Carregando…</p>;
  if (detalhe.error) return <p className="erro">{detalhe.error.message}</p>;
  const { operacoes, avaliacoes } = detalhe.data;
  const erro = removerOperacao.error ?? removerAvaliacao.error;
  return (
    <div>
      <h3>Aportes e resgates</h3>
      {operacoes.length === 0 ? (
        <p className="suave pequeno">Nenhuma operação ainda.</p>
      ) : (
        <ul className="lista-limpa">
          {operacoes.map((o) => (
            <li key={o.id} className="linha-parcela">
              <span className="linha-parcela-texto">
                {o.tipo === 'aporte' ? 'Aporte' : 'Resgate'} em {formatarData(o.data)}
                {o.conta_nome ? `, ${o.tipo === 'aporte' ? 'saiu de' : 'caiu em'} ${o.conta_nome}` : ''}
              </span>
              <Valor centavos={o.valor_centavos} />
              <button type="button" className="botao" onClick={() => removerOperacao.mutate(o.id)} disabled={removerOperacao.isPending} aria-label={`Remover ${o.tipo} de ${formatarData(o.data)}`}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Valores informados</h3>
      {avaliacoes.length === 0 ? (
        <p className="suave pequeno">Nenhum valor informado. Sem ele, o investimento aparece pelo valor aplicado e não há resultado.</p>
      ) : (
        <ul className="lista-limpa">
          {avaliacoes.map((a) => (
            <li key={a.id} className="linha-parcela">
              <span className="linha-parcela-texto">Em {formatarData(a.data)}</span>
              <Valor centavos={a.valor_centavos} />
              <button type="button" className="botao" onClick={() => removerAvaliacao.mutate(a.id)} disabled={removerAvaliacao.isPending} aria-label={`Remover valor de ${formatarData(a.data)}`}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="erro">{erro.message}</p>}
    </div>
  );
}

function Investimento({ investimento: inv, fuso }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState(null); // 'aporte' | 'resgate' | 'valor' | 'editar' | 'historico' | 'excluir'
  const excluir = useMutation({
    mutationFn: () => api(`/investimentos/${inv.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setModo(null),
  });
  const fechar = () => setModo(null);

  if (modo === 'editar') return <li><FormularioInvestimento origem={inv} aoFechar={fechar} /></li>;
  return (
    <li className="cartao">
      <div className="item-topo">
        <div>
          <strong>{inv.nome}</strong> {inv.encerrado && <span className="etiqueta">Encerrado</span>}
          <p className="suave pequeno">
            {ROTULOS_DE_INVESTIMENTO[inv.tipo]}
            {inv.instituicao ? `, ${inv.instituicao}` : ''}
          </p>
        </div>
      </div>
      <p>
        {inv.avaliado ? 'Vale' : 'Aplicado'} <Valor centavos={inv.valor_atual_centavos} />
      </p>
      {inv.avaliado ? (
        <p>
          Resultado <Valor centavos={inv.resultado_centavos} tipo={inv.resultado_centavos >= 0 ? 'entrada' : 'saida'} />
          {inv.rentabilidade_percentual != null && <span className="suave pequeno"> ({percentual(inv.rentabilidade_percentual)})</span>}
          <span className="suave pequeno"> · valor de {formatarData(inv.avaliado_em)}</span>
        </p>
      ) : (
        <p className="suave pequeno">Sem valor informado: o resultado só aparece depois que você informar quanto vale.</p>
      )}
      <p className="suave pequeno">
        Aportado <Valor centavos={inv.aportado_centavos} />
        {inv.resgatado_centavos > 0 && <> · resgatado <Valor centavos={inv.resgatado_centavos} /></>}
      </p>
      {inv.observacao && <p className="suave pequeno">{inv.observacao}</p>}

      {(modo === 'aporte' || modo === 'resgate') && <FormularioOperacao investimento={inv} tipo={modo} fuso={fuso} aoFechar={fechar} />}
      {modo === 'valor' && <FormularioAvaliacao investimento={inv} fuso={fuso} aoFechar={fechar} />}
      {modo === 'historico' && <Historico investimentoId={inv.id} />}
      {modo === 'excluir' && (
        <p className="suave pequeno">Só dá para excluir investimento sem aportes nem resgates. Para encerrar um que já teve movimento, registre o resgate total.</p>
      )}
      <div className="acoes acoes-compactas">
        <button type="button" className="botao-primario" onClick={() => setModo('aporte')}>Aportar</button>
        <button type="button" className="botao" onClick={() => setModo('resgate')} disabled={inv.valor_atual_centavos <= 0}>Resgatar</button>
        <button type="button" className="botao" onClick={() => setModo('valor')}>Informar valor</button>
        <button type="button" className="botao" onClick={() => setModo(modo === 'historico' ? null : 'historico')}>Histórico</button>
        <button type="button" className="botao" onClick={() => setModo('editar')}>Editar</button>
        {modo === 'excluir' ? (
          <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>Confirmar exclusão</button>
        ) : (
          <button type="button" className="botao" onClick={() => setModo('excluir')}>Excluir</button>
        )}
      </div>
      {excluir.error && <p role="alert" className="erro">{excluir.error.message}</p>}
    </li>
  );
}

export function Investimentos({ fuso }) {
  const lista = useQuery({ queryKey: ['investimentos'], queryFn: () => api('/investimentos') });
  const [criando, setCriando] = useState(false);
  if (lista.isPending) return <p className="carregando">Carregando…</p>;
  if (lista.error) return <p className="erro">{lista.error.message}</p>;
  const { itens, totais } = lista.data;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Investimentos</h1>
        {!criando && <button type="button" className="botao-primario" onClick={() => setCriando(true)}>Novo investimento</button>}
      </div>
      <p className="suave pequeno">
        Carteira de controle manual: você registra os aportes, os resgates e, de tempos em tempos, quanto o investimento vale.
        Aporte e resgate com conta mexem no saldo dela, mas não são despesa nem receita. Não há cotação automática.
      </p>
      {totais && (
        <div className="cartao">
          <h2>Carteira</h2>
          <p>Vale hoje <Valor centavos={totais.valor_atual_centavos} /></p>
          <p className="suave pequeno">Aportado no total <Valor centavos={totais.aportado_centavos} /></p>
          {totais.resultado_centavos != null && (
            <p>
              Resultado dos que têm valor informado{' '}
              <Valor centavos={totais.resultado_centavos} tipo={totais.resultado_centavos >= 0 ? 'entrada' : 'saida'} />
            </p>
          )}
          {totais.sem_avaliacao > 0 && (
            <p className="suave pequeno">
              {totais.sem_avaliacao} {totais.sem_avaliacao === 1 ? 'investimento está' : 'investimentos estão'} sem valor informado e
              {totais.sem_avaliacao === 1 ? ' entra' : ' entram'} pelo valor aplicado.
            </p>
          )}
        </div>
      )}
      {criando && <FormularioInvestimento origem={null} aoFechar={() => setCriando(false)} />}
      {itens.length === 0 ? (
        !criando && (
          <div className="cartao vazio">
            <p>Nenhum investimento cadastrado.</p>
            <p className="suave">Tesouro, CDB, ações, fundos: cadastre, registre os aportes e acompanhe o resultado.</p>
          </div>
        )
      ) : (
        <ul className="lista-limpa">
          {itens.map((i) => (
            <Investimento key={`${i.id}-${i.atualizado_em}-${i.valor_atual_centavos}`} investimento={i} fuso={fuso} />
          ))}
        </ul>
      )}
    </section>
  );
}
