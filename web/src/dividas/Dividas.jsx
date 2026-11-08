import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const ROTULO_SITUACAO = { em_dia: 'Em dia', atrasada: 'Em atraso', quitada: 'Quitada', sem_parcelas: 'Sem parcelas' };
const CLASSE_SITUACAO = { em_dia: 'em_dia', atrasada: 'atrasada', quitada: 'concluida', sem_parcelas: '' };

function Resumo({ d }) {
  return (
    <>
      <progress className={`medidor ${d.situacao === 'atrasada' ? 'atrasada' : d.situacao === 'quitada' ? 'concluida' : ''}`} max={100} value={d.percentual_pago} aria-label={`${d.percentual_pago}% pago`} />
      <p>Pago <Valor centavos={d.pago_centavos} tipo="entrada" /> · Falta <Valor centavos={d.restante_centavos} tipo="saida" /></p>
      <p className="suave pequeno">
        {d.parcelas_pagas} de {d.parcelas_total} parcelas pagas
        {d.proxima && ` · próxima: parcela ${d.proxima.numero} em ${formatarData(d.proxima.data_vencimento)}`}
      </p>
      {d.atrasado_centavos > 0 && (
        <p className="erro">
          Em atraso: <Valor centavos={d.atrasado_centavos} tipo="saida" /> ({d.parcelas_atrasadas}{' '}
          {d.parcelas_atrasadas === 1 ? 'parcela' : 'parcelas'})
        </p>
      )}
    </>
  );
}

export function Dividas() {
  const lista = useQuery({ queryKey: ['dividas'], queryFn: () => api('/dividas') });
  if (lista.isPending) return <p className="carregando">Carregando…</p>;
  if (lista.error) return <p className="erro">{lista.error.message}</p>;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Dívidas</h1>
        <Link className="botao-primario" to="/dividas/nova">Nova dívida</Link>
      </div>
      <p className="suave pequeno">
        Cada parcela vira uma conta a pagar em Compromissos: o atraso, a projeção do fluxo e os alertas já contam com elas.
        Quanto você pagou e quanto falta é calculado dessas parcelas.
      </p>
      {lista.data.itens.length === 0 ? (
        <div className="cartao vazio">
          <p>Nenhuma dívida cadastrada.</p>
          <p className="suave">Financiamento, empréstimo, acordo: informe o valor total e as parcelas e acompanhe até quitar.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {lista.data.itens.map((d) => (
            <li key={d.id} className="cartao">
              <div className="item-topo">
                <div>
                  <strong>{d.nome}</strong> <span className={`etiqueta ${CLASSE_SITUACAO[d.situacao]}`}>{ROTULO_SITUACAO[d.situacao]}</span>
                  {d.credor && <p className="suave pequeno">{d.credor}</p>}
                </div>
                <span className="suave pequeno">{d.percentual_pago}%</span>
              </div>
              <Resumo d={d} />
              <Link className="botao" to={`/dividas/${d.id}`}>Ver parcelas</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Formulario({ contas, categorias, fuso }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState('');
  const [credor, setCredor] = useState('');
  const [valor, setValor] = useState(null);
  const [parcelas, setParcelas] = useState('12');
  const [vencimento, setVencimento] = useState(hojeIso(fuso));
  const [contaId, setContaId] = useState(String(contas.find((c) => !c.arquivada)?.id ?? ''));
  const [categoriaId, setCategoriaId] = useState('');
  const [observacao, setObservacao] = useState('');

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === 'despesa' && c.papel == null && !c.arquivada)
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const salvar = useMutation({
    mutationFn: () =>
      api('/dividas', {
        metodo: 'POST',
        corpo: {
          nome, credor, valor_total_centavos: valor ?? 0, parcelas_total: Number(parcelas), primeiro_vencimento: vencimento,
          conta_id: Number(contaId), categoria_id: categoriaId ? Number(categoriaId) : null, observacao,
        },
      }),
    onSuccess: async (criada) => {
      await invalidar();
      navegar(`/dividas/${criada.id}`);
    },
  });
  const campos = salvar.error?.campos ?? {};
  const erroDe = (c) => campos[c] && <p role="alert" className="erro campo-erro">{campos[c]}</p>;

  return (
    <section>
      <h1>Nova dívida</h1>
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div className="campo">
          <label htmlFor="div-nome">Nome</label>
          <input id="div-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
          {erroDe('nome')}
        </div>
        <div className="campo">
          <label htmlFor="div-credor">Credor (opcional)</label>
          <input id="div-credor" value={credor} onChange={(e) => setCredor(e.target.value)} maxLength={120} />
        </div>
        <CampoValor id="div-valor" rotulo="Valor total a pagar" aoMudar={setValor} erro={campos.valor_total_centavos} />
        <p className="suave pequeno">
          Some todas as parcelas, com juros. Se não couber em centavos redondos, a primeira parcela fica com a sobra.
        </p>
        <div className="campos-lado">
          <div className="campo">
            <label htmlFor="div-parcelas">Parcelas</label>
            <input id="div-parcelas" type="text" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, ''))} />
            {erroDe('parcelas_total')}
          </div>
          <div className="campo">
            <label htmlFor="div-vencimento">Vencimento da primeira</label>
            <input id="div-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            {erroDe('primeiro_vencimento')}
          </div>
        </div>
        {vencimento < hojeIso(fuso) && (
          <p className="suave pequeno">
            A primeira parcela já venceu: as parcelas até hoje entram como atrasadas, para você dar baixa. Se parte já foi
            paga, informe só o que falta e a data da próxima parcela.
          </p>
        )}
        <div className="campo">
          <label htmlFor="div-conta">Conta de onde as parcelas saem</label>
          <select id="div-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas.filter((c) => !c.arquivada).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          {erroDe('conta_id')}
        </div>
        <div className="campo">
          <label htmlFor="div-categoria">Categoria</label>
          <select id="div-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {opcoesCategoria.map((c) => (
              <option key={c.id} value={c.id}>{c.rotulo}</option>
            ))}
          </select>
          {erroDe('categoria_id')}
        </div>
        <div className="campo">
          <label htmlFor="div-obs">Observação</label>
          <textarea id="div-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
        </div>
        {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
        <div className="acoes">
          <button type="submit" className="botao-primario" disabled={salvar.isPending || !nome.trim() || valor == null || valor === 0 || !parcelas || !contaId}>
            Criar dívida e parcelas
          </button>
          <Link className="botao" to="/dividas">Cancelar</Link>
        </div>
      </form>
    </section>
  );
}

export function FormularioDivida({ fuso }) {
  const contas = useContas();
  const categorias = useCategorias();
  if (contas.isPending || categorias.isPending) return <p className="carregando">Carregando…</p>;
  const erro = contas.error ?? categorias.error;
  if (erro) return <p className="erro">{erro.message}</p>;
  if (contas.data.itens.filter((c) => !c.arquivada).length === 0) {
    return (
      <section>
        <h1>Nova dívida</h1>
        <div className="cartao vazio">
          <p>Para cadastrar uma dívida, crie uma conta.</p>
          <Link className="botao-primario" to="/contas">Ir para Contas</Link>
        </div>
      </section>
    );
  }
  return <Formulario contas={contas.data.itens} categorias={categorias.data.itens} fuso={fuso} />;
}

function Parcela({ p }) {
  const invalidar = useInvalidarDados();
  const pagar = useMutation({
    mutationFn: () => api(`/movimentacoes/${p.lancamento_id}/liquidar`, { metodo: 'POST', corpo: {} }),
    onSuccess: invalidar,
  });
  const paga = p.status === 'liquidada';
  const rotulo = paga ? `Paga em ${formatarData(p.data_liquidacao)}` : p.situacao === 'atrasada' ? 'Atrasada' : p.situacao === 'vence_hoje' ? 'Vence hoje' : 'A vencer';
  return (
    <li className="linha-fatura">
      <div>
        <strong>Parcela {p.numero}</strong> <span className={`etiqueta ${paga ? 'paga' : p.situacao}`}>{rotulo}</span>
        <p className="suave">Vence em {formatarData(p.data_vencimento)}</p>
        {pagar.error && <p role="alert" className="erro">{pagar.error.message}</p>}
      </div>
      <div className="direita">
        <Valor centavos={p.valor_centavos} tipo={paga ? 'neutro' : 'saida'} />
        {!paga && (
          <div className="acoes acoes-compactas">
            <button type="button" className="botao-primario" onClick={() => pagar.mutate()} disabled={pagar.isPending}>Paguei</button>
            <Link className="botao" to="/compromissos">Pagar parte</Link>
          </div>
        )}
      </div>
    </li>
  );
}

function Edicao({ d, aoFechar }) {
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState(d.nome);
  const [credor, setCredor] = useState(d.credor);
  const [observacao, setObservacao] = useState(d.observacao);
  const salvar = useMutation({
    mutationFn: () => api(`/dividas/${d.id}`, { metodo: 'PUT', corpo: { nome, credor, observacao } }),
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
      <h2>Editar dívida</h2>
      <div className="campo">
        <label htmlFor="div-ed-nome">Nome</label>
        <input id="div-ed-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />
        {campos.nome && <p role="alert" className="erro campo-erro">{campos.nome}</p>}
      </div>
      <div className="campo">
        <label htmlFor="div-ed-credor">Credor</label>
        <input id="div-ed-credor" value={credor} onChange={(e) => setCredor(e.target.value)} maxLength={120} />
      </div>
      <div className="campo">
        <label htmlFor="div-ed-obs">Observação</label>
        <textarea id="div-ed-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
      </div>
      <p className="suave pequeno">
        O valor e as datas das parcelas mudam pelo lançamento de cada uma (por exemplo, se o banco cobrou juros a mais).
      </p>
      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending || !nome.trim()}>Salvar</button>
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

export function DividaDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const consulta = useQuery({ queryKey: ['divida', id], queryFn: () => api(`/dividas/${id}`) });
  const contas = useContas();
  const excluir = useMutation({
    mutationFn: () => api(`/dividas/${id}`, { metodo: 'DELETE' }),
    onSuccess: async () => {
      await invalidar();
      navegar('/dividas');
    },
    onError: () => setConfirmando(false),
  });

  if (consulta.isPending || contas.isPending) return <p className="carregando">Carregando…</p>;
  const erro = consulta.error ?? contas.error;
  if (erro) return <p className="erro">{erro.message}</p>;
  const d = consulta.data;
  const conta = contas.data.itens.find((c) => c.id === d.conta_id);

  return (
    <section>
      <p><Link to="/dividas">‹ Dívidas</Link></p>
      <div className="item-topo">
        <h1>{d.nome}</h1>
        <span className={`etiqueta ${CLASSE_SITUACAO[d.situacao]}`}>{ROTULO_SITUACAO[d.situacao]}</span>
      </div>
      {editando ? (
        <Edicao d={d} aoFechar={() => setEditando(false)} />
      ) : (
        <div className="cartao">
          {d.credor && <p className="suave pequeno">{d.credor}</p>}
          <Resumo d={d} />
          <p className="suave pequeno">
            Contratado <Valor centavos={d.valor_total_centavos} /> em {d.parcelas_total}x · sai de {conta?.nome ?? '—'}
          </p>
          {d.observacao && <p className="suave pequeno">{d.observacao}</p>}
          <div className="acoes acoes-compactas">
            <button type="button" className="botao" onClick={() => setEditando(true)}>Editar</button>
            {confirmando ? (
              <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>Confirmar exclusão</button>
            ) : (
              <button type="button" className="botao" onClick={() => setConfirmando(true)}>Excluir</button>
            )}
          </div>
          {confirmando && <p className="suave pequeno">Exclui a dívida e as parcelas que ainda estão pendentes. O que já foi pago continua nos lançamentos.</p>}
          {excluir.error && <p role="alert" className="erro">{excluir.error.message}</p>}
        </div>
      )}
      <h2>Parcelas</h2>
      <div className="cartao">
        <ul className="lista-limpa">
          {d.parcelas.map((p) => (
            <Parcela key={p.lancamento_id} p={p} />
          ))}
        </ul>
      </div>
    </section>
  );
}
