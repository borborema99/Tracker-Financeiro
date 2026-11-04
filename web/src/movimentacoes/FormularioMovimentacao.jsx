import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ROTULOS_TIPO, TIPOS_MOVIMENTACAO } from '../../../contratos/movimentacoes.js';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { hojeIso } from '../compartilhado/datas.js';
import { porId, rotuloCategoria, useCartoes, useCategorias, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const CHAVE_ULTIMA_CONTA = 'tracker.ultimaConta';

function ultimaContaUsada() {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_CONTA);
  } catch {
    return null;
  }
}

function lembrarConta(id) {
  try {
    localStorage.setItem(CHAVE_ULTIMA_CONTA, String(id));
  } catch {
    // sem armazenamento: só não lembra
  }
}

function Formulario({ origem, duplicando, reembolsoDe, temCartoes, contas, categorias, fuso }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const hoje = hojeIso(fuso);
  const edicao = origem && !duplicando ? origem : null;

  const contasAtivas = contas.filter((c) => !c.arquivada || c.id === origem?.conta_id);
  const lembrada = Number(ultimaContaUsada());
  const contaPadrao = contasAtivas.find((c) => c.id === lembrada)?.id ?? contasAtivas[0]?.id ?? '';
  // Reembolso: nasce de uma despesa (?reembolso=ID) e já vem com o que ainda dá para reembolsar.
  const valorInicial = origem?.valor_centavos ?? reembolsoDe?.reembolsavel_centavos ?? null;
  const ligadoA = reembolsoDe?.id ?? (edicao ? edicao.reembolso_de_id : null) ?? null;

  const [tipo, setTipo] = useState(reembolsoDe ? 'receita' : (origem?.tipo ?? 'despesa'));
  const [valor, setValor] = useState(valorInicial);
  const [descricao, setDescricao] = useState(
    origem?.descricao ?? (reembolsoDe ? `Reembolso: ${reembolsoDe.descricao || 'despesa'}` : ''),
  );
  const [contaId, setContaId] = useState(String(origem?.conta_id ?? reembolsoDe?.conta_id ?? contaPadrao));
  const [destinoId, setDestinoId] = useState(String(origem?.conta_destino_id ?? ''));
  const [categoriaId, setCategoriaId] = useState(String(origem?.categoria_id ?? ''));
  const [data, setData] = useState(duplicando || !origem ? hoje : origem.data_competencia);
  const [status, setStatus] = useState(duplicando ? 'liquidada' : (origem?.status ?? 'liquidada'));
  const [vencimento, setVencimento] = useState(duplicando ? '' : (origem?.data_vencimento ?? ''));
  const [liquidacao, setLiquidacao] = useState(duplicando ? '' : (origem?.data_liquidacao ?? ''));
  const [observacao, setObservacao] = useState(origem?.observacao ?? '');
  const [tarifa, setTarifa] = useState(origem?.tarifa_centavos || null);
  const [divisoes, setDivisoes] = useState(
    (origem?.divisoes ?? []).map((d) => ({ categoria_id: String(d.categoria_id), valor: d.valor_centavos })),
  );
  const [avisos, setAvisos] = useState([]);

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === tipo && c.papel == null && (!c.arquivada || String(c.id) === categoriaId))
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const aberto = Boolean(
    edicao && (edicao.status === 'pendente' || edicao.data_vencimento || edicao.observacao || divisoes.length || edicao.tarifa_centavos),
  );

  const salvar = useMutation({
    mutationFn: () => {
      const dividido = tipo !== 'transferencia' && divisoes.length > 0;
      const corpo = {
        tipo,
        descricao,
        valor_centavos: valor ?? 0,
        conta_id: Number(contaId),
        conta_destino_id: tipo === 'transferencia' && destinoId ? Number(destinoId) : null,
        categoria_id: tipo !== 'transferencia' && !dividido && categoriaId ? Number(categoriaId) : null,
        divisoes: dividido
          ? divisoes.map((d) => ({ categoria_id: Number(d.categoria_id), valor_centavos: d.valor ?? 0 }))
          : [],
        data_competencia: data,
        data_vencimento: vencimento || null,
        data_liquidacao: status === 'liquidada' ? liquidacao || data : null,
        status,
        observacao,
        tarifa_centavos: tipo === 'transferencia' ? (tarifa ?? 0) : 0,
        reembolso_de_id: tipo === 'receita' ? ligadoA : null,
      };
      return api(edicao ? `/movimentacoes/${edicao.id}` : '/movimentacoes', {
        metodo: edicao ? 'PUT' : 'POST',
        corpo,
      });
    },
    onSuccess: async (resposta) => {
      lembrarConta(contaId);
      await invalidar();
      if (resposta.avisos?.length) setAvisos(resposta.avisos);
      else navegar('/lancamentos');
    },
  });
  const campos = salvar.error?.campos ?? {};

  function mudarDivisao(i, mudanca) {
    setDivisoes((atual) => atual.map((d, j) => (j === i ? { ...d, ...mudanca } : d)));
  }

  if (avisos.length > 0) {
    return (
      <section className="cartao">
        <h1>Lançamento salvo</h1>
        <div role="status" className="aviso">
          {avisos.map((a) => (
            <p key={a.codigo}>{a.mensagem}</p>
          ))}
        </div>
        <div className="acoes">
          <button type="button" className="botao-primario" onClick={() => navegar('/lancamentos')}>Ver lançamentos</button>
        </div>
      </section>
    );
  }

  return (
    <form
      className="cartao formulario-mov"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h1>{edicao ? 'Editar lançamento' : duplicando ? 'Duplicar lançamento' : reembolsoDe ? 'Registrar reembolso' : 'Novo lançamento'}</h1>

      {reembolsoDe && (
        <p className="suave">
          Reembolso da despesa “{reembolsoDe.descricao || 'sem descrição'}” (<Valor centavos={reembolsoDe.valor_centavos} />).
          Ainda dá para reembolsar <Valor centavos={reembolsoDe.reembolsavel_centavos} />.
        </p>
      )}
      {edicao?.reembolso_de_id && (
        <p className="suave">
          Este lançamento é um reembolso. <Link to={`/lancamentos/${edicao.reembolso_de_id}`}>Ver a despesa original</Link>.
        </p>
      )}
      {tipo === 'despesa' && temCartoes && !edicao && !reembolsoDe && (
        <p className="suave pequeno">
          Foi no cartão de crédito? <Link to="/cartoes/compras/nova">Registre como compra no cartão</Link>.
        </p>
      )}

      <div className="segmentado" role="radiogroup" aria-label="Tipo">
        {TIPOS_MOVIMENTACAO.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            className={tipo === t ? 'ativo' : ''}
            disabled={
              (Boolean(edicao) && (edicao.tipo === 'transferencia') !== (t === 'transferencia')) ||
              (ligadoA != null && t !== 'receita')
            }
            onClick={() => {
              setTipo(t);
              setCategoriaId('');
              setDivisoes([]);
            }}
          >
            {ROTULOS_TIPO[t]}
          </button>
        ))}
      </div>

      <CampoValor id="mov-valor" rotulo="Valor" inicial={valorInicial} aoMudar={setValor} autoFocus erro={campos.valor_centavos} />
      {campos.reembolso_de_id && <p role="alert" className="erro campo-erro">{campos.reembolso_de_id}</p>}

      {tipo !== 'transferencia' && divisoes.length === 0 && (
        <div className="campo">
          <label htmlFor="mov-categoria">Categoria</label>
          <select id="mov-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {opcoesCategoria.map((c) => (
              <option key={c.id} value={c.id}>{c.rotulo}</option>
            ))}
          </select>
          {campos.categoria_id && <p role="alert" className="erro campo-erro">{campos.categoria_id}</p>}
        </div>
      )}

      <div className="campo">
        <label htmlFor="mov-conta">{tipo === 'transferencia' ? 'Conta de origem' : 'Conta'}</label>
        <select id="mov-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contasAtivas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        {campos.conta_id && <p role="alert" className="erro campo-erro">{campos.conta_id}</p>}
      </div>

      {tipo === 'transferencia' && (
        <div className="campo">
          <label htmlFor="mov-destino">Conta de destino</label>
          <select id="mov-destino" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            <option value="">Escolha…</option>
            {contasAtivas
              .filter((c) => String(c.id) !== contaId)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
          </select>
          {campos.conta_destino_id && <p role="alert" className="erro campo-erro">{campos.conta_destino_id}</p>}
        </div>
      )}

      <div className="campo">
        <label htmlFor="mov-data">Data</label>
        <input id="mov-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        {campos.data_competencia && <p role="alert" className="erro campo-erro">{campos.data_competencia}</p>}
      </div>

      <div className="campo">
        <label htmlFor="mov-descricao">Descrição</label>
        <input id="mov-descricao" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
        {campos.descricao && <p role="alert" className="erro campo-erro">{campos.descricao}</p>}
      </div>

      <details className="mais-opcoes" open={aberto}>
        <summary>Mais opções</summary>

        <div className="campo">
          <label htmlFor="mov-status">Situação</label>
          <select id="mov-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="liquidada">Liquidada (já aconteceu)</option>
            <option value="pendente">Pendente (ainda vai acontecer)</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="mov-vencimento">Vencimento</label>
          <input id="mov-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </div>

        {status === 'liquidada' && (
          <div className="campo">
            <label htmlFor="mov-liquidacao">Data de liquidação (vazio = mesma data)</label>
            <input id="mov-liquidacao" type="date" value={liquidacao} onChange={(e) => setLiquidacao(e.target.value)} />
            {campos.data_liquidacao && <p role="alert" className="erro campo-erro">{campos.data_liquidacao}</p>}
          </div>
        )}

        {tipo === 'transferencia' && (
          <CampoValor
            id="mov-tarifa"
            rotulo="Tarifa da transferência (vira despesa)"
            inicial={origem?.tarifa_centavos || null}
            aoMudar={setTarifa}
            erro={campos.tarifa_centavos}
          />
        )}

        {tipo !== 'transferencia' && (
          <fieldset className="divisoes">
            <legend>Dividir entre categorias</legend>
            {divisoes.map((d, i) => (
              <div key={i} className="linha-divisao">
                <select
                  aria-label={`Categoria da parte ${i + 1}`}
                  value={d.categoria_id}
                  onChange={(e) => mudarDivisao(i, { categoria_id: e.target.value })}
                >
                  <option value="">Escolha…</option>
                  {opcoesCategoria.map((c) => (
                    <option key={c.id} value={c.id}>{c.rotulo}</option>
                  ))}
                </select>
                <CampoValor
                  id={`mov-div-${i}`}
                  rotulo={`Valor da parte ${i + 1}`}
                  inicial={d.valor}
                  aoMudar={(v) => mudarDivisao(i, { valor: v })}
                />
                <button
                  type="button"
                  className="botao"
                  onClick={() => setDivisoes((atual) => atual.filter((_, j) => j !== i))}
                >
                  Remover parte
                </button>
              </div>
            ))}
            {campos.divisoes && <p role="alert" className="erro campo-erro">{campos.divisoes}</p>}
            <button
              type="button"
              className="botao"
              onClick={() =>
                setDivisoes((atual) =>
                  atual.length === 0
                    ? [
                        { categoria_id: categoriaId, valor: null },
                        { categoria_id: '', valor: null },
                      ]
                    : [...atual, { categoria_id: '', valor: null }],
                )
              }
            >
              {divisoes.length === 0 ? 'Dividir' : 'Adicionar parte'}
            </button>
          </fieldset>
        )}

        <div className="campo">
          <label htmlFor="mov-obs">Observação</label>
          <textarea id="mov-obs" rows={3} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
      </details>

      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      {salvar.error?.campos && <p role="alert" className="erro">{salvar.error.message}</p>}

      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending || valor == null || !contaId}>
          Salvar
        </button>
        <button type="button" className="botao" onClick={() => navegar(-1)}>Cancelar</button>
      </div>
    </form>
  );
}

export function FormularioMovimentacao({ fuso }) {
  const { id } = useParams();
  const [busca] = useSearchParams();
  const duplicarId = busca.get('duplicar');
  const reembolsoId = id ? null : busca.get('reembolso');
  const idOrigem = id ?? duplicarId;

  const contas = useContas();
  const categorias = useCategorias();
  const cartoes = useCartoes();
  const origem = useQuery({
    queryKey: ['movimentacao', idOrigem],
    queryFn: () => api(`/movimentacoes/${idOrigem}`),
    enabled: Boolean(idOrigem),
  });
  const despesaOriginal = useQuery({
    queryKey: ['movimentacao', reembolsoId],
    queryFn: () => api(`/movimentacoes/${reembolsoId}`),
    enabled: Boolean(reembolsoId),
  });

  if (
    contas.isPending || categorias.isPending || cartoes.isPending ||
    (idOrigem && origem.isPending) || (reembolsoId && despesaOriginal.isPending)
  ) {
    return <p className="carregando">Carregando…</p>;
  }
  const erro = contas.error ?? categorias.error ?? origem.error ?? despesaOriginal.error;
  if (erro) return <p className="erro">{erro.message}</p>;
  if (contas.data.itens.filter((c) => !c.arquivada).length === 0) {
    return (
      <section className="cartao vazio">
        <p>Antes de lançar, crie uma conta.</p>
        <Link className="botao-primario" to="/contas">Ir para Contas</Link>
      </section>
    );
  }

  return (
    <Formulario
      key={`${idOrigem ?? 'novo'}-${origem.dataUpdatedAt}-${reembolsoId ?? ''}`}
      origem={origem.data}
      duplicando={!id && Boolean(duplicarId)}
      reembolsoDe={despesaOriginal.data}
      temCartoes={cartoes.data.itens.some((c) => !c.arquivado)}
      contas={contas.data.itens}
      categorias={categorias.data.itens}
      fuso={fuso}
    />
  );
}
