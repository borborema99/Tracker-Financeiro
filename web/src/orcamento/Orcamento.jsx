import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { nomeDoMes, somarMesesIso } from '../compartilhado/datas.js';
import { useCategorias, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const ROTULO_SITUACAO = { ok: 'Dentro do limite', atencao: 'Perto do limite', estourado: 'Estourado' };

/** Define o limite de uma categoria a partir do mês exibido; zero tira o orçamento daquele mês em diante. */
function useDefinirLimite(mes, aoSalvar) {
  const invalidar = useInvalidarDados();
  return useMutation({
    mutationFn: ({ categoriaId, centavos }) =>
      api(`/orcamento/${categoriaId}`, { metodo: 'PUT', corpo: { mes_inicio: mes, limite_centavos: centavos } }),
    onSuccess: async () => {
      await invalidar();
      aoSalvar?.();
    },
  });
}

function Item({ item, mes }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(item.limite_centavos);
  const definir = useDefinirLimite(mes, () => setEditando(false));
  const campos = definir.error?.campos ?? {};

  return (
    <li className="cartao orcamento-item">
      <div className="item-topo">
        <div>
          <strong>{item.nome}</strong> <span className={`etiqueta ${item.situacao}`}>{ROTULO_SITUACAO[item.situacao]}</span>
        </div>
        <span className="suave pequeno">{item.percentual}%</span>
      </div>
      <progress className={`medidor ${item.situacao}`} max={100} value={Math.min(item.percentual, 100)} aria-label={`${item.percentual}% do limite de ${item.nome}`} />
      <p>
        Gasto <Valor centavos={item.realizado_centavos} tipo="saida" /> de <Valor centavos={item.limite_centavos} />
      </p>
      <p>
        {item.restante_centavos >= 0 ? 'Resta' : 'Passou'}{' '}
        <Valor centavos={Math.abs(item.restante_centavos)} tipo={item.restante_centavos >= 0 ? 'neutro' : 'saida'} />
      </p>
      {item.previsto_centavos > 0 && (
        <p className="suave pequeno">
          Previsto (ainda não pago) neste mês: <Valor centavos={item.previsto_centavos} />.
          {item.vai_estourar && ' Se tudo for pago, o limite será ultrapassado.'}
        </p>
      )}
      {editando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            definir.mutate({ categoriaId: item.categoria_id, centavos: valor ?? 0 });
          }}
        >
          <CampoValor id={`lim-${item.categoria_id}`} rotulo={`Novo limite a partir de ${nomeDoMes(mes)}`} inicial={item.limite_centavos} aoMudar={setValor} erro={campos.limite_centavos} autoFocus />
          <p className="suave pequeno">Os meses anteriores continuam com o limite que tinham.</p>
          {definir.error && !definir.error.campos && <p role="alert" className="erro">{definir.error.message}</p>}
          <div className="acoes acoes-compactas">
            <button type="submit" className="botao-primario" disabled={definir.isPending || valor == null || valor === 0}>Salvar</button>
            <button type="button" className="botao" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="acoes acoes-compactas">
          <button type="button" className="botao" onClick={() => setEditando(true)}>Alterar limite</button>
          <button
            type="button"
            className="botao"
            disabled={definir.isPending}
            onClick={() => definir.mutate({ categoriaId: item.categoria_id, centavos: 0 })}
          >
            Remover a partir daqui
          </button>
        </div>
      )}
      {!editando && definir.error && <p role="alert" className="erro">{definir.error.message}</p>}
    </li>
  );
}

function NovoOrcamento({ mes, categorias, comLimite }) {
  const [categoriaId, setCategoriaId] = useState('');
  const [valor, setValor] = useState(null);
  const [chave, setChave] = useState(0);
  const definir = useDefinirLimite(mes, () => {
    setCategoriaId('');
    setValor(null);
    setChave((c) => c + 1);
  });
  const campos = definir.error?.campos ?? {};
  const disponiveis = categorias
    .filter((c) => c.tipo === 'despesa' && c.pai_id == null && !c.arquivada && !comLimite.has(c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (disponiveis.length === 0) return null;
  return (
    <form
      className="cartao"
      onSubmit={(e) => {
        e.preventDefault();
        definir.mutate({ categoriaId: Number(categoriaId), centavos: valor ?? 0 });
      }}
    >
      <h2>Novo orçamento</h2>
      <div className="campo">
        <label htmlFor="orc-categoria">Categoria</label>
        <select id="orc-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Escolha…</option>
          {disponiveis.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        {campos.categoria_id && <p role="alert" className="erro campo-erro">{campos.categoria_id}</p>}
      </div>
      <CampoValor key={chave} id="orc-limite" rotulo="Limite por mês" aoMudar={setValor} erro={campos.limite_centavos} />
      <p className="suave pequeno">
        Vale de {nomeDoMes(mes)} em diante. Subcategorias somam na categoria principal.
      </p>
      {definir.error && !definir.error.campos && <p role="alert" className="erro">{definir.error.message}</p>}
      <button type="submit" className="botao-primario" disabled={definir.isPending || !categoriaId || valor == null || valor === 0}>
        Definir limite
      </button>
    </form>
  );
}

export function Orcamento({ fuso }) {
  const mesAtual = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const [mes, setMes] = useState(mesAtual);
  const orcamento = useQuery({ queryKey: ['orcamento', mes], queryFn: () => api(`/orcamento?mes=${mes}`) });
  const categorias = useCategorias();

  if (orcamento.isPending || categorias.isPending) return <p className="carregando">Carregando…</p>;
  const erro = orcamento.error ?? categorias.error;
  if (erro) return <p className="erro">{erro.message}</p>;
  const o = orcamento.data;
  const comLimite = new Set(o.itens.map((i) => i.categoria_id));

  return (
    <section>
      <h1>Orçamento</h1>
      <div className="navegacao-mes">
        <button type="button" className="botao" aria-label="Mês anterior" onClick={() => setMes(somarMesesIso(mes, -1))}>‹</button>
        <strong>{nomeDoMes(mes)}</strong>
        <button type="button" className="botao" aria-label="Próximo mês" onClick={() => setMes(somarMesesIso(mes, 1))}>›</button>
      </div>
      <p className="suave pequeno">
        O gasto é o realizado: despesas liquidadas e compras no cartão pela data da compra, menos estornos. O que ainda
        está pendente aparece à parte, como previsto.
      </p>

      {o.itens.length > 0 && (
        <div className="cartao">
          <h2>Total orçado</h2>
          <p>Limites <Valor centavos={o.totais.limite_centavos} /></p>
          <p>Gasto <Valor centavos={o.totais.realizado_centavos} tipo="saida" /></p>
          <p>{o.totais.restante_centavos >= 0 ? 'Resta' : 'Passou'} <Valor centavos={Math.abs(o.totais.restante_centavos)} /></p>
          <p className="suave pequeno">
            Só categorias com orçamento entram neste total.
            {o.totais.estourados > 0 && ` ${o.totais.estourados} estourado(s).`}
          </p>
        </div>
      )}

      {o.itens.length === 0 ? (
        <div className="cartao vazio">
          <p>Nenhum orçamento em vigor em {nomeDoMes(mes)}.</p>
          <p className="suave">Defina um limite por categoria abaixo para acompanhar o gasto do mês.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {o.itens.map((i) => (
            <Item key={`${mes}-${i.categoria_id}-${i.limite_centavos}`} item={i} mes={mes} />
          ))}
        </ul>
      )}

      <NovoOrcamento mes={mes} categorias={categorias.data.itens} comLimite={comLimite} />

      {o.sem_orcamento.length > 0 && (
        <div className="cartao">
          <h2>Sem orçamento</h2>
          <ul className="lista-limpa saldos-contas">
            {o.sem_orcamento.map((s) => (
              <li key={s.categoria_id ?? 'sem'}>
                <span>{s.nome}</span>
                <span>
                  <Valor centavos={s.realizado_centavos} tipo="saida" />
                  {s.previsto_centavos > 0 && <span className="suave pequeno"> · previsto <Valor centavos={s.previsto_centavos} /></span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
