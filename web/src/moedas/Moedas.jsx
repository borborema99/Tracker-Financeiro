import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CODIGOS_DE_MOEDA,
  MOEDAS,
  OPERACOES_COM_CONTA,
  ROTULOS_DE_OPERACAO_MOEDA,
  TIPOS_DE_OPERACAO_MOEDA,
  formatarMoeda,
  formatarTaxa,
  parseTaxa,
} from '../../../contratos/moedas.js';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { useOcultarValores } from '../compartilhado/OcultarValores.jsx';
import { Valor } from '../compartilhado/Valor.jsx';

/** Valor na moeda da conta. Só formata; respeita "Valores ocultos". */
function ValorMoeda({ centavos, moeda }) {
  const { oculto } = useOcultarValores();
  return <span className="valor valor-neutro">{oculto ? `${moeda} ••••` : formatarMoeda(centavos, moeda)}</span>;
}

const erroDe = (campos, c) => campos[c] && <p role="alert" className="erro campo-erro">{campos[c]}</p>;

function FormularioConta({ aoFechar }) {
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState('');
  const [moeda, setMoeda] = useState('USD');
  const [saldo, setSaldo] = useState(0);
  const salvar = useMutation({
    mutationFn: () =>
      api('/moedas/contas', { metodo: 'POST', corpo: { nome, moeda, saldo_inicial_centavos: saldo ?? 0, observacao: '' } }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
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
      <h2>Nova conta em moeda estrangeira</h2>
      <div className="campo">
        <label htmlFor="moeda-nome">Nome</label>
        <input id="moeda-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
        {erroDe(campos, 'nome')}
      </div>
      <div className="campo">
        <label htmlFor="moeda-codigo">Moeda</label>
        <select id="moeda-codigo" value={moeda} onChange={(e) => setMoeda(e.target.value)}>
          {CODIGOS_DE_MOEDA.map((c) => (
            <option key={c} value={c}>{c} · {MOEDAS[c]}</option>
          ))}
        </select>
        {erroDe(campos, 'moeda')}
      </div>
      <CampoValor id="moeda-saldo" rotulo={`Saldo inicial em ${moeda} (opcional)`} aoMudar={setSaldo} erro={campos.saldo_inicial_centavos} />
      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending || !nome.trim()}>Salvar</button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormularioOperacao({ conta, fuso, aoFechar }) {
  const invalidar = useInvalidarDados();
  const contas = useContas();
  const [tipo, setTipo] = useState('deposito');
  const [valor, setValor] = useState(null);
  const [valorBrl, setValorBrl] = useState(null);
  const [data, setData] = useState(hojeIso(fuso));
  const [contaId, setContaId] = useState('');
  const comConta = OPERACOES_COM_CONTA.includes(tipo);
  const registrar = useMutation({
    mutationFn: () =>
      api(`/moedas/contas/${conta.id}/operacoes`, {
        metodo: 'POST',
        corpo: {
          tipo,
          valor_centavos: valor ?? 0,
          valor_brl_centavos: comConta ? (valorBrl ?? null) : null,
          data,
          conta_id: comConta && contaId ? Number(contaId) : null,
          observacao: '',
        },
      }),
    onSuccess: async () => {
      await invalidar();
      aoFechar();
    },
  });
  const campos = registrar.error?.campos ?? {};
  const ativas = (contas.data?.itens ?? []).filter((c) => !c.arquivada);
  const sufixo = String(conta.id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        registrar.mutate();
      }}
    >
      <div className="campo">
        <label htmlFor={`mop-tipo-${sufixo}`}>Operação</label>
        <select id={`mop-tipo-${sufixo}`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_DE_OPERACAO_MOEDA.map((t) => (
            <option key={t} value={t}>{ROTULOS_DE_OPERACAO_MOEDA[t]}</option>
          ))}
        </select>
        {erroDe(campos, 'tipo')}
      </div>
      <CampoValor id={`mop-valor-${sufixo}`} rotulo={`Valor em ${conta.moeda}`} aoMudar={setValor} erro={campos.valor_centavos} autoFocus />
      {comConta && (
        <>
          <CampoValor
            id={`mop-brl-${sufixo}`}
            rotulo={tipo === 'compra' ? 'Quanto você pagou, em reais' : 'Quanto você recebeu, em reais'}
            aoMudar={setValorBrl}
            erro={campos.valor_brl_centavos}
          />
          <div className="campo">
            <label htmlFor={`mop-conta-${sufixo}`}>{tipo === 'compra' ? 'Sai de qual conta?' : 'Cai em qual conta?'}</label>
            <select id={`mop-conta-${sufixo}`} value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">Escolha a conta</option>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {erroDe(campos, 'conta_id')}
          </div>
        </>
      )}
      <div className="campo">
        <label htmlFor={`mop-data-${sufixo}`}>Data</label>
        <input id={`mop-data-${sufixo}`} type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
        {erroDe(campos, 'data')}
      </div>
      {registrar.error && !registrar.error.campos && <p role="alert" className="erro">{registrar.error.message}</p>}
      <div className="acoes acoes-compactas">
        <button
          type="submit"
          className="botao-primario"
          disabled={registrar.isPending || !valor || (comConta && (!valorBrl || !contaId))}
        >
          Registrar
        </button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function Historico({ contaId }) {
  const invalidar = useInvalidarDados();
  const detalhe = useQuery({ queryKey: ['moeda', contaId], queryFn: () => api(`/moedas/contas/${contaId}`) });
  const remover = useMutation({
    mutationFn: (id) => api(`/moedas/contas/${contaId}/operacoes/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  if (detalhe.isPending) return <p className="carregando">Carregando…</p>;
  if (detalhe.error) return <p className="erro">{detalhe.error.message}</p>;
  const { operacoes, moeda } = detalhe.data;
  return (
    <div>
      <h3>Operações</h3>
      {operacoes.length === 0 ? (
        <p className="suave pequeno">Nenhuma operação ainda.</p>
      ) : (
        <ul className="lista-limpa">
          {operacoes.map((o) => (
            <li key={o.id} className="linha-parcela">
              <span className="linha-parcela-texto">
                {ROTULOS_DE_OPERACAO_MOEDA[o.tipo]} em {formatarData(o.data)}
                {o.conta_nome ? `, ${o.tipo === 'compra' ? 'saiu de' : 'caiu em'} ${o.conta_nome}` : ''}
                {o.taxa_micros != null && <span className="suave pequeno"> · R$ {formatarTaxa(o.taxa_micros)} por {moeda}</span>}
              </span>
              <ValorMoeda centavos={o.valor_centavos} moeda={moeda} />
              <button type="button" className="botao" onClick={() => remover.mutate(o.id)} disabled={remover.isPending} aria-label={`Remover ${ROTULOS_DE_OPERACAO_MOEDA[o.tipo].toLowerCase()} de ${formatarData(o.data)}`}>
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

function ContaMoeda({ conta, fuso }) {
  const invalidar = useInvalidarDados();
  const [modo, setModo] = useState(null); // 'operacao' | 'historico' | 'excluir'
  const excluir = useMutation({
    mutationFn: () => api(`/moedas/contas/${conta.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setModo(null),
  });
  return (
    <li className="cartao">
      <div className="item-topo">
        <div>
          <strong>{conta.nome}</strong> {conta.encerrada && <span className="etiqueta">Encerrada</span>}
          <p className="suave pequeno">{conta.moeda} · {MOEDAS[conta.moeda]}</p>
        </div>
      </div>
      <p>Saldo <ValorMoeda centavos={conta.saldo_centavos} moeda={conta.moeda} /></p>
      {conta.cotacao ? (
        <p className="suave pequeno">
          Em reais <Valor centavos={conta.valor_brl_centavos} /> · cotação R$ {formatarTaxa(conta.cotacao.taxa_micros)} de {formatarData(conta.cotacao.data)}
        </p>
      ) : (
        <p className="suave pequeno">Sem cotação de {conta.moeda}: informe uma abaixo para ver o valor em reais.</p>
      )}
      {modo === 'operacao' && <FormularioOperacao conta={conta} fuso={fuso} aoFechar={() => setModo(null)} />}
      {modo === 'historico' && <Historico contaId={conta.id} />}
      {modo === 'excluir' && (
        <p className="suave pequeno">Só dá para excluir conta sem operações. Para encerrar uma que já teve movimento, saque ou venda todo o saldo.</p>
      )}
      <div className="acoes acoes-compactas">
        <button type="button" className="botao-primario" onClick={() => setModo('operacao')}>Registrar operação</button>
        <button type="button" className="botao" onClick={() => setModo(modo === 'historico' ? null : 'historico')}>Histórico</button>
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

function Cotacoes({ cotacoes, fuso }) {
  const invalidar = useInvalidarDados();
  const [moeda, setMoeda] = useState('USD');
  const [taxa, setTaxa] = useState('');
  const [data, setData] = useState(hojeIso(fuso));
  const micros = taxa.trim() === '' ? null : parseTaxa(taxa);
  const registrar = useMutation({
    mutationFn: () => api('/moedas/cotacoes', { metodo: 'POST', corpo: { moeda, data, taxa_micros: micros } }),
    onSuccess: async () => {
      setTaxa('');
      await invalidar();
    },
  });
  const remover = useMutation({ mutationFn: (id) => api(`/moedas/cotacoes/${id}`, { metodo: 'DELETE' }), onSuccess: invalidar });
  const campos = registrar.error?.campos ?? {};
  const mensagem = taxa.trim() !== '' && micros == null ? 'Cotação inválida. Exemplo: 5,4321' : campos.taxa_micros;
  return (
    <div className="cartao">
      <h2>Cotações</h2>
      <p className="suave pequeno">Quantos reais vale 1 unidade da moeda, como você viu no banco ou na casa de câmbio. O app não busca cotação sozinho.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          registrar.mutate();
        }}
      >
        <div className="campo">
          <label htmlFor="cot-moeda">Moeda</label>
          <select id="cot-moeda" value={moeda} onChange={(e) => setMoeda(e.target.value)}>
            {CODIGOS_DE_MOEDA.map((c) => (
              <option key={c} value={c}>{c} · {MOEDAS[c]}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="cot-taxa">Reais por 1 {moeda}</label>
          <input
            id="cot-taxa"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="5,4321"
            value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            aria-invalid={mensagem ? 'true' : undefined}
            aria-describedby={mensagem ? 'cot-taxa-erro' : undefined}
          />
          {mensagem && <p id="cot-taxa-erro" role="alert" className="erro campo-erro">{mensagem}</p>}
        </div>
        <div className="campo">
          <label htmlFor="cot-data">Data</label>
          <input id="cot-data" type="date" value={data} max={hojeIso(fuso)} onChange={(e) => setData(e.target.value)} />
          {erroDe(campos, 'data')}
        </div>
        {registrar.error && !registrar.error.campos && <p role="alert" className="erro">{registrar.error.message}</p>}
        <div className="acoes acoes-compactas">
          <button type="submit" className="botao-primario" disabled={registrar.isPending || micros == null}>Registrar cotação</button>
        </div>
      </form>
      {cotacoes.length > 0 && (
        <ul className="lista-limpa">
          {cotacoes.map((c) => (
            <li key={c.id} className="linha-parcela">
              <span className="linha-parcela-texto">{c.moeda} em {formatarData(c.data)}</span>
              <span className="valor valor-neutro">R$ {formatarTaxa(c.taxa_micros)}</span>
              <button type="button" className="botao" onClick={() => remover.mutate(c.id)} disabled={remover.isPending} aria-label={`Remover cotação de ${c.moeda} de ${formatarData(c.data)}`}>
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

export function Moedas({ fuso }) {
  const lista = useQuery({ queryKey: ['moedas'], queryFn: () => api('/moedas') });
  const [criando, setCriando] = useState(false);
  if (lista.isPending) return <p className="carregando">Carregando…</p>;
  if (lista.error) return <p className="erro">{lista.error.message}</p>;
  const { itens, cotacoes, totais } = lista.data;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Moedas</h1>
        {!criando && <button type="button" className="botao-primario" onClick={() => setCriando(true)}>Nova conta em moeda</button>}
      </div>
      <p className="suave pequeno">
        Dinheiro em outra moeda fica em contas próprias, com saldo na própria moeda. Comprar ou vender moeda mexe na conta em reais,
        mas não é despesa nem receita. Lançamentos, orçamento e relatórios continuam só em reais.
      </p>
      {totais && (
        <div className="cartao">
          <h2>Em reais</h2>
          {totais.com_cotacao > 0 && <p><Valor centavos={totais.valor_brl_centavos} /></p>}
          {totais.sem_cotacao > 0 && (
            <p className="suave pequeno">
              {totais.sem_cotacao} {totais.sem_cotacao === 1 ? 'conta está' : 'contas estão'} sem cotação e
              {totais.sem_cotacao === 1 ? ' fica' : ' ficam'} fora deste valor e do patrimônio.
            </p>
          )}
        </div>
      )}
      {criando && <FormularioConta aoFechar={() => setCriando(false)} />}
      {itens.length === 0 ? (
        !criando && (
          <div className="cartao vazio">
            <p>Nenhuma conta em moeda estrangeira.</p>
            <p className="suave">Dólar de viagem, euro guardado: cadastre a conta, registre compras e informe a cotação.</p>
          </div>
        )
      ) : (
        <ul className="lista-limpa">
          {itens.map((c) => (
            <ContaMoeda key={`${c.id}-${c.atualizado_em}-${c.saldo_centavos}`} conta={c} fuso={fuso} />
          ))}
        </ul>
      )}
      <Cotacoes cotacoes={cotacoes} fuso={fuso} />
    </section>
  );
}
