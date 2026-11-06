import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const ROTULO_SITUACAO = { em_andamento: 'Em andamento', concluida: 'Concluída', atrasada: 'Prazo vencido' };

function FormularioMeta({ origem, aoFechar }) {
  const invalidar = useInvalidarDados();
  const sufixo = origem?.id ?? 'nova';
  const [nome, setNome] = useState(origem?.nome ?? '');
  const [valor, setValor] = useState(origem?.valor_alvo_centavos ?? null);
  const [prazo, setPrazo] = useState(origem?.prazo ?? '');
  const [observacao, setObservacao] = useState(origem?.observacao ?? '');
  const salvar = useMutation({
    mutationFn: () =>
      api(origem ? `/metas/${origem.id}` : '/metas', {
        metodo: origem ? 'PUT' : 'POST',
        corpo: { nome, valor_alvo_centavos: valor ?? 0, prazo: prazo || null, observacao },
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
      <h2>{origem ? 'Editar meta' : 'Nova meta'}</h2>
      <div className="campo">
        <label htmlFor={`meta-nome-${sufixo}`}>Nome</label>
        <input id={`meta-nome-${sufixo}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
        {erroDe('nome')}
      </div>
      <CampoValor id={`meta-valor-${sufixo}`} rotulo="Valor que quero juntar" inicial={origem?.valor_alvo_centavos ?? null} aoMudar={setValor} erro={campos.valor_alvo_centavos} />
      <div className="campo">
        <label htmlFor={`meta-prazo-${sufixo}`}>Prazo (opcional)</label>
        <input id={`meta-prazo-${sufixo}`} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        {erroDe('prazo')}
      </div>
      <div className="campo">
        <label htmlFor={`meta-obs-${sufixo}`}>Observação</label>
        <textarea id={`meta-obs-${sufixo}`} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
      </div>
      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending || !nome.trim() || valor == null || valor === 0}>Salvar</button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormularioAporte({ meta, tipo, fuso, aoFechar }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState(null);
  const [data, setData] = useState(hojeIso(fuso));
  const registrar = useMutation({
    mutationFn: () =>
      api(`/metas/${meta.id}/aportes`, { metodo: 'POST', corpo: { tipo, valor_centavos: valor ?? 0, data, observacao: '' } }),
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
      <CampoValor id={`ap-${meta.id}-${tipo}`} rotulo={tipo === 'aporte' ? 'Valor guardado' : 'Valor retirado'} aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      <div className="campo">
        <label htmlFor={`ap-data-${meta.id}-${tipo}`}>Data</label>
        <input id={`ap-data-${meta.id}-${tipo}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
        {campos.data && <p role="alert" className="erro campo-erro">{campos.data}</p>}
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

function Movimentos({ metaId }) {
  const invalidar = useInvalidarDados();
  const detalhe = useQuery({ queryKey: ['meta', metaId], queryFn: () => api(`/metas/${metaId}`) });
  const remover = useMutation({
    mutationFn: (aporteId) => api(`/metas/${metaId}/aportes/${aporteId}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  if (detalhe.isPending) return <p className="carregando">Carregando…</p>;
  if (detalhe.error) return <p className="erro">{detalhe.error.message}</p>;
  const { aportes } = detalhe.data;
  return (
    <div>
      {aportes.length === 0 ? (
        <p className="suave pequeno">Nenhum aporte ainda.</p>
      ) : (
        <ul className="lista-limpa">
          {aportes.map((a) => (
            <li key={a.id} className="linha-parcela">
              <span className="linha-parcela-texto">
                {a.tipo === 'aporte' ? 'Aporte' : 'Resgate'} em {formatarData(a.data)}
              </span>
              <Valor centavos={a.valor_centavos} tipo={a.tipo === 'aporte' ? 'entrada' : 'saida'} />
              <button type="button" className="botao" onClick={() => remover.mutate(a.id)} disabled={remover.isPending} aria-label={`Remover ${a.tipo} de ${formatarData(a.data)}`}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {remover.error && <p role="alert" className="erro">{remover.error.message}</p>}
    </div>
  );
}

function Meta({ meta, fuso }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState(null); // 'aporte' | 'resgate' | 'editar' | 'movimentos' | 'excluir'
  const excluir = useMutation({
    mutationFn: () => api(`/metas/${meta.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setModo(null),
  });
  const fechar = () => setModo(null);

  if (modo === 'editar') return <li><FormularioMeta origem={meta} aoFechar={fechar} /></li>;
  return (
    <li className="cartao">
      <div className="item-topo">
        <div>
          <strong>{meta.nome}</strong> <span className={`etiqueta ${meta.situacao}`}>{ROTULO_SITUACAO[meta.situacao]}</span>
          {meta.prazo && <p className="suave pequeno">Prazo: {formatarData(meta.prazo)}</p>}
        </div>
        <span className="suave pequeno">{meta.percentual}%</span>
      </div>
      <progress className={`medidor ${meta.situacao}`} max={100} value={Math.min(meta.percentual, 100)} aria-label={`${meta.percentual}% da meta ${meta.nome}`} />
      <p>
        Guardado <Valor centavos={meta.acumulado_centavos} tipo="entrada" /> de <Valor centavos={meta.valor_alvo_centavos} />
      </p>
      {meta.situacao !== 'concluida' && <p>Falta <Valor centavos={meta.falta_centavos} /></p>}
      {meta.necessario_por_mes_centavos != null && (
        <p className="suave pequeno">
          Para chegar no prazo: <Valor centavos={meta.necessario_por_mes_centavos} /> por mês, em {meta.meses_restantes}{' '}
          {meta.meses_restantes === 1 ? 'mês' : 'meses'}.
        </p>
      )}
      {meta.observacao && <p className="suave pequeno">{meta.observacao}</p>}

      {(modo === 'aporte' || modo === 'resgate') && <FormularioAporte meta={meta} tipo={modo} fuso={fuso} aoFechar={fechar} />}
      {modo === 'movimentos' && <Movimentos metaId={meta.id} />}
      {modo === 'excluir' && (
        <p className="suave pequeno">Excluir a meta não mexe em nenhuma conta. O histórico fica registrado.</p>
      )}
      <div className="acoes acoes-compactas">
        <button type="button" className="botao-primario" onClick={() => setModo('aporte')}>Guardar</button>
        <button type="button" className="botao" onClick={() => setModo('resgate')} disabled={meta.acumulado_centavos <= 0}>Retirar</button>
        <button type="button" className="botao" onClick={() => setModo(modo === 'movimentos' ? null : 'movimentos')}>Movimentos</button>
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

export function Metas({ fuso }) {
  const lista = useQuery({ queryKey: ['metas'], queryFn: () => api('/metas') });
  const [criando, setCriando] = useState(false);
  if (lista.isPending) return <p className="carregando">Carregando…</p>;
  if (lista.error) return <p className="erro">{lista.error.message}</p>;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Metas</h1>
        {!criando && <button type="button" className="botao-primario" onClick={() => setCriando(true)}>Nova meta</button>}
      </div>
      <p className="suave pequeno">
        Uma meta é uma reserva de controle: guardar numa meta não tira dinheiro de nenhuma conta nem entra como despesa.
        O dinheiro continua onde está; aqui você só acompanha quanto já separou.
      </p>
      {criando && <FormularioMeta origem={null} aoFechar={() => setCriando(false)} />}
      {lista.data.itens.length === 0 ? (
        !criando && (
          <div className="cartao vazio">
            <p>Nenhuma meta cadastrada.</p>
            <p className="suave">Reserva de emergência, viagem, troca de carro: defina o valor e acompanhe o progresso.</p>
          </div>
        )
      ) : (
        <ul className="lista-limpa">
          {lista.data.itens.map((m) => (
            <Meta key={`${m.id}-${m.atualizada_em}`} meta={m} fuso={fuso} />
          ))}
        </ul>
      )}
    </section>
  );
}
