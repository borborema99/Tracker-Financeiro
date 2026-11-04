import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { porId, rotuloCategoria, useCartoes, useCategorias, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';
import { rotuloFatura } from './comum.jsx';

const CHAVE_ULTIMO_CARTAO = 'tracker.ultimoCartao';

function ultimoCartaoUsado() {
  try {
    return Number(localStorage.getItem(CHAVE_ULTIMO_CARTAO));
  } catch {
    return 0;
  }
}

function lembrarCartao(id) {
  try {
    localStorage.setItem(CHAVE_ULTIMO_CARTAO, String(id));
  } catch {
    // sem armazenamento: só não lembra
  }
}

function Formulario({ compra, cartoes, categorias, cartaoInicial, fuso }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const ativos = cartoes.filter((c) => !c.arquivado || c.id === compra?.cartao_id);
  const padrao =
    ativos.find((c) => c.id === compra?.cartao_id) ??
    ativos.find((c) => c.id === cartaoInicial) ??
    ativos.find((c) => c.id === ultimoCartaoUsado()) ??
    ativos[0];

  const [cartaoId, setCartaoId] = useState(String(padrao?.id ?? ''));
  const [valor, setValor] = useState(compra?.valor_total_centavos ?? null);
  const [parcelas, setParcelas] = useState(String(compra?.parcelas_total ?? 1));
  const [categoriaId, setCategoriaId] = useState(String(compra?.categoria_id ?? ''));
  const [data, setData] = useState(compra?.data_compra ?? hojeIso(fuso));
  const [descricao, setDescricao] = useState(compra?.descricao ?? '');
  const [observacao, setObservacao] = useState(compra?.observacao ?? '');
  const [avisos, setAvisos] = useState([]);

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === 'despesa' && c.papel == null && (!c.arquivada || String(c.id) === categoriaId))
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const salvar = useMutation({
    mutationFn: () =>
      api(compra ? `/compras-cartao/${compra.id}` : '/compras-cartao', {
        metodo: compra ? 'PUT' : 'POST',
        corpo: {
          cartao_id: Number(cartaoId),
          descricao,
          valor_total_centavos: valor ?? 0,
          categoria_id: categoriaId ? Number(categoriaId) : null,
          data_compra: data,
          parcelas_total: Number(parcelas) || 0,
          observacao,
        },
      }),
    onSuccess: async (resposta) => {
      lembrarCartao(cartaoId);
      await invalidar();
      if (resposta.avisos?.length) setAvisos(resposta.avisos);
      else navegar(`/cartoes/${cartaoId}`);
    },
  });
  const campos = salvar.error?.campos ?? {};

  if (avisos.length > 0) {
    return (
      <section className="cartao">
        <h1>Compra salva</h1>
        <div role="status" className="aviso">
          {avisos.map((a) => (
            <p key={a.codigo}>{a.mensagem}</p>
          ))}
        </div>
        <div className="acoes">
          <button type="button" className="botao-primario" onClick={() => navegar(`/cartoes/${cartaoId}`)}>
            Ver o cartão
          </button>
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
      <h1>{compra ? 'Editar compra no cartão' : 'Nova compra no cartão'}</h1>

      <CampoValor
        id="compra-valor"
        rotulo="Valor total"
        inicial={compra?.valor_total_centavos ?? null}
        aoMudar={setValor}
        autoFocus
        erro={campos.valor_total_centavos}
      />

      <div className="campo">
        <label htmlFor="compra-categoria">Categoria</label>
        <select id="compra-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Sem categoria</option>
          {opcoesCategoria.map((c) => (
            <option key={c.id} value={c.id}>{c.rotulo}</option>
          ))}
        </select>
        {campos.categoria_id && <p role="alert" className="erro campo-erro">{campos.categoria_id}</p>}
      </div>

      <div className="campo">
        <label htmlFor="compra-cartao">Cartão</label>
        <select
          id="compra-cartao"
          value={cartaoId}
          disabled={Boolean(compra)}
          onChange={(e) => setCartaoId(e.target.value)}
        >
          {ativos.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        {campos.cartao_id && <p role="alert" className="erro campo-erro">{campos.cartao_id}</p>}
      </div>

      <div className="campos-lado">
        <div className="campo">
          <label htmlFor="compra-data">Data da compra</label>
          <input id="compra-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          {campos.data_compra && <p role="alert" className="erro campo-erro">{campos.data_compra}</p>}
        </div>
        <div className="campo">
          <label htmlFor="compra-parcelas">Parcelas (1 = à vista)</label>
          <input
            id="compra-parcelas"
            type="number"
            inputMode="numeric"
            min={1}
            max={48}
            value={parcelas}
            onChange={(e) => setParcelas(e.target.value)}
          />
          {campos.parcelas_total && <p role="alert" className="erro campo-erro">{campos.parcelas_total}</p>}
        </div>
      </div>

      <div className="campo">
        <label htmlFor="compra-descricao">Descrição</label>
        <input id="compra-descricao" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
        {campos.descricao && <p role="alert" className="erro campo-erro">{campos.descricao}</p>}
      </div>

      <details className="mais-opcoes" open={Boolean(compra?.observacao)}>
        <summary>Mais opções</summary>
        <div className="campo">
          <label htmlFor="compra-obs">Observação</label>
          <textarea id="compra-obs" rows={3} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
      </details>

      <p className="suave pequeno">
        A compra vira despesa uma vez, na data da compra. Cada parcela entra na fatura pelo dia de fechamento do cartão.
      </p>
      {salvar.error && <p role="alert" className="erro">{salvar.error.message}</p>}

      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending || valor == null || !cartaoId}>
          Salvar
        </button>
        <button type="button" className="botao" onClick={() => navegar(-1)}>Cancelar</button>
      </div>
    </form>
  );
}

function Parcelas({ compra, cartao }) {
  const invalidar = useInvalidarDados();
  const [escolhidas, setEscolhidas] = useState([]);
  const antecipar = useMutation({
    mutationFn: () => api(`/compras-cartao/${compra.id}/antecipar`, { metodo: 'POST', corpo: { parcelas: escolhidas } }),
    onSuccess: async () => {
      setEscolhidas([]);
      await invalidar();
    },
  });
  const futuras = compra.parcelas.filter((p) => p.referencia > cartao.ciclo_atual.referencia);

  function alternar(numero) {
    setEscolhidas((atual) => (atual.includes(numero) ? atual.filter((n) => n !== numero) : [...atual, numero]));
  }

  return (
    <div className="cartao">
      <h2>Parcelas</h2>
      {compra.parcelas.map((p) => {
        const podeAntecipar = futuras.some((f) => f.numero === p.numero);
        return (
          <div key={p.numero} className="linha-parcela">
            {podeAntecipar ? (
              <label>
                <input type="checkbox" checked={escolhidas.includes(p.numero)} onChange={() => alternar(p.numero)} />
                <span>
                  {p.numero} de {compra.parcelas_total} · <Link to={`/faturas/${p.fatura_id}`}>{rotuloFatura(p.referencia)}</Link>
                  <span className="suave pequeno"> · vence em {formatarData(p.data_vencimento)}</span>
                </span>
              </label>
            ) : (
              <span className="linha-parcela-texto">
                {p.numero} de {compra.parcelas_total} · <Link to={`/faturas/${p.fatura_id}`}>{rotuloFatura(p.referencia)}</Link>
                <span className="suave pequeno"> · vence em {formatarData(p.data_vencimento)}</span>
              </span>
            )}
            <Valor centavos={p.valor_centavos} tipo="saida" />
          </div>
        );
      })}
      {futuras.length > 0 && (
        <>
          <p className="suave pequeno">
            Marque parcelas futuras para trazê-las para a fatura atual. O valor não muda; só o vencimento chega antes.
          </p>
          {antecipar.error && <p role="alert" className="erro">{antecipar.error.message}</p>}
          <div className="acoes">
            <button
              type="button"
              className="botao"
              onClick={() => antecipar.mutate()}
              disabled={antecipar.isPending || escolhidas.length === 0}
            >
              Antecipar para a fatura atual
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Estornos({ compra, fuso }) {
  const invalidar = useInvalidarDados();
  const [valor, setValor] = useState(null);
  const [data, setData] = useState(hojeIso(fuso));
  const [descricao, setDescricao] = useState('');
  const [rodada, setRodada] = useState(0);

  const estornar = useMutation({
    mutationFn: () =>
      api(`/compras-cartao/${compra.id}/estornos`, {
        metodo: 'POST',
        corpo: { valor_centavos: valor ?? 0, data_estorno: data, descricao },
      }),
    onSuccess: async () => {
      setValor(null);
      setDescricao('');
      setRodada((r) => r + 1);
      await invalidar();
    },
  });
  const excluir = useMutation({
    mutationFn: (id) => api(`/estornos-cartao/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  const campos = estornar.error?.campos ?? {};

  return (
    <div className="cartao">
      <h2>Estorno</h2>
      <p className="suave pequeno">
        O estorno ajusta a compra: o valor líquido cai e o crédito abate a fatura aberta. Estornar o valor todo reverte a compra.
      </p>
      <p>
        Valor líquido <Valor centavos={compra.valor_liquido_centavos} tipo="saida" />
        {compra.estornado_centavos > 0 && (
          <span className="suave pequeno"> (de <Valor centavos={compra.valor_total_centavos} />)</span>
        )}
      </p>

      {compra.estornos.map((e) => (
        <div key={e.id} className="linha-fatura">
          <div>
            <strong>{e.descricao || 'Estorno'}</strong>
            <p className="suave pequeno">{formatarData(e.data_estorno)}</p>
          </div>
          <div className="direita">
            <Valor centavos={e.valor_centavos} tipo="entrada" />
            <div>
              <button type="button" className="botao" onClick={() => excluir.mutate(e.id)} disabled={excluir.isPending}>
                Desfazer
              </button>
            </div>
          </div>
        </div>
      ))}
      {excluir.error && <p role="alert" className="erro">{excluir.error.message}</p>}

      {compra.valor_liquido_centavos > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            estornar.mutate();
          }}
        >
          <CampoValor key={rodada} id="estorno-valor" rotulo="Valor do estorno" aoMudar={setValor} erro={campos.valor_centavos} />
          <div className="campo">
            <label htmlFor="estorno-data">Data do estorno</label>
            <input
              id="estorno-data"
              type="date"
              min={compra.data_compra}
              max={hojeIso(fuso)}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
            {campos.data_estorno && <p role="alert" className="erro campo-erro">{campos.data_estorno}</p>}
          </div>
          <div className="campo">
            <label htmlFor="estorno-descricao">Descrição</label>
            <input id="estorno-descricao" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          {estornar.error && !estornar.error.campos && <p role="alert" className="erro">{estornar.error.message}</p>}
          <div className="acoes">
            <button type="submit" className="botao" disabled={estornar.isPending || valor == null}>
              Registrar estorno
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Excluir({ compra }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const excluir = useMutation({
    mutationFn: () => api(`/compras-cartao/${compra.id}`, { metodo: 'DELETE' }),
    onSuccess: async () => {
      await invalidar();
      navegar(`/cartoes/${compra.cartao_id}`);
    },
    onError: () => setConfirmando(false),
  });
  return (
    <div className="cartao">
      <h2>Excluir compra</h2>
      <p className="suave pequeno">Tira as parcelas das faturas e devolve o limite. Os estornos da compra saem junto.</p>
      {excluir.error && <p role="alert" className="erro">{excluir.error.message}</p>}
      <div className="acoes">
        {confirmando ? (
          <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
            Confirmar exclusão
          </button>
        ) : (
          <button type="button" className="botao" onClick={() => setConfirmando(true)}>Excluir compra</button>
        )}
      </div>
    </div>
  );
}

export function Compra({ fuso }) {
  const { id } = useParams();
  const [busca] = useSearchParams();
  const cartoes = useCartoes();
  const categorias = useCategorias();
  const compra = useQuery({
    queryKey: ['compra', id],
    queryFn: () => api(`/compras-cartao/${id}`),
    enabled: Boolean(id),
  });

  if (cartoes.isPending || categorias.isPending || (id && compra.isPending)) {
    return <p className="carregando">Carregando…</p>;
  }
  const erro = cartoes.error ?? categorias.error ?? compra.error;
  if (erro) return <p className="erro">{erro.message}</p>;
  if (cartoes.data.itens.filter((c) => !c.arquivado).length === 0 && !id) {
    return (
      <section className="cartao vazio">
        <p>Antes de lançar uma compra, cadastre um cartão.</p>
        <Link className="botao-primario" to="/cartoes">Ir para Cartões</Link>
      </section>
    );
  }

  const cartao = id ? cartoes.data.itens.find((c) => c.id === compra.data.cartao_id) : null;
  return (
    <section>
      <Formulario
        key={`${id ?? 'nova'}-${compra.dataUpdatedAt}`}
        compra={compra.data}
        cartoes={cartoes.data.itens}
        categorias={categorias.data.itens}
        cartaoInicial={Number(busca.get('cartao')) || null}
        fuso={fuso}
      />
      {compra.data && cartao && (
        <>
          <Parcelas compra={compra.data} cartao={cartao} />
          <Estornos compra={compra.data} fuso={fuso} />
          <Excluir compra={compra.data} />
        </>
      )}
    </section>
  );
}
