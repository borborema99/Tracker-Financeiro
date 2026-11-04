import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FREQUENCIAS, ROTULOS_FREQUENCIA } from '../../../contratos/recorrencias.js';
import { api } from '../compartilhado/api.js';
import { CampoValor } from '../compartilhado/CampoValor.jsx';
import { formatarData, hojeIso } from '../compartilhado/datas.js';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

function Linha({ r, contas }) {
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const excluir = useMutation({
    mutationFn: () => api(`/recorrencias/${r.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setConfirmando(false),
  });
  return (
    <li className={`cartao ${r.ativa ? '' : 'arquivada'}`}>
      <div className="item-topo">
        <div>
          <strong>{r.descricao}</strong> {!r.ativa && <span className="etiqueta">Pausada</span>}
          <p className="suave pequeno">
            {ROTULOS_FREQUENCIA[r.frequencia]} · {r.tipo === 'receita' ? 'receita' : 'despesa'} · {contas.get(r.conta_id)?.nome ?? '—'}
          </p>
          <p className="suave pequeno">
            {r.proximo_vencimento ? `Próximo: ${formatarData(r.proximo_vencimento)}` : 'Sem próxima ocorrência pendente'}
            {r.data_fim ? ` · até ${formatarData(r.data_fim)}` : ''}
          </p>
        </div>
        <Valor centavos={r.valor_centavos} tipo={r.tipo === 'receita' ? 'entrada' : 'saida'} />
      </div>
      <div className="acoes acoes-compactas">
        <Link className="botao" to={`/recorrencias/${r.id}`}>Editar</Link>
        {confirmando ? (
          <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
            Confirmar exclusão
          </button>
        ) : (
          <button type="button" className="botao" onClick={() => setConfirmando(true)}>Excluir</button>
        )}
      </div>
      {excluir.error && <p role="alert" className="erro">{excluir.error.message}</p>}
    </li>
  );
}

export function Recorrencias() {
  const lista = useQuery({ queryKey: ['recorrencias'], queryFn: () => api('/recorrencias') });
  const contas = useContas();
  if (lista.isPending || contas.isPending) return <p className="carregando">Carregando…</p>;
  const erro = lista.error ?? contas.error;
  if (erro) return <p className="erro">{erro.message}</p>;
  const mapaContas = porId(contas.data.itens);

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Recorrências</h1>
        <Link className="botao-primario" to="/recorrencias/nova">Nova recorrência</Link>
      </div>
      <p className="suave pequeno">
        Contas e recebimentos que se repetem. As ocorrências viram compromissos pendentes quando você abre o app, até 90 dias
        à frente. Apagar uma ocorrência não a recria.
      </p>
      {lista.data.itens.length === 0 ? (
        <div className="cartao vazio">
          <p>Nenhuma recorrência cadastrada.</p>
          <p className="suave">Aluguel, salário, assinaturas: cadastre uma vez e acompanhe em Compromissos.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {lista.data.itens.map((r) => (
            <Linha key={r.id} r={r} contas={mapaContas} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Formulario({ origem, contas, categorias, fuso }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const edicao = origem ?? null;
  const [tipo, setTipo] = useState(edicao?.tipo ?? 'despesa');
  const [descricao, setDescricao] = useState(edicao?.descricao ?? '');
  const [valor, setValor] = useState(edicao?.valor_centavos ?? null);
  const [contaId, setContaId] = useState(String(edicao?.conta_id ?? contas.find((c) => !c.arquivada)?.id ?? ''));
  const [categoriaId, setCategoriaId] = useState(edicao?.categoria_id ? String(edicao.categoria_id) : '');
  const [frequencia, setFrequencia] = useState(edicao?.frequencia ?? 'mensal');
  const [inicio, setInicio] = useState(edicao?.data_inicio ?? hojeIso(fuso));
  const [fim, setFim] = useState(edicao?.data_fim ?? '');
  const [ativa, setAtiva] = useState(edicao?.ativa ?? true);
  const [observacao, setObservacao] = useState(edicao?.observacao ?? '');

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === tipo && c.papel == null && (!c.arquivada || String(c.id) === categoriaId))
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const salvar = useMutation({
    mutationFn: () =>
      api(edicao ? `/recorrencias/${edicao.id}` : '/recorrencias', {
        metodo: edicao ? 'PUT' : 'POST',
        corpo: {
          tipo,
          descricao,
          valor_centavos: valor ?? 0,
          conta_id: Number(contaId),
          categoria_id: categoriaId ? Number(categoriaId) : null,
          frequencia,
          data_inicio: inicio,
          data_fim: fim || null,
          ativa,
          observacao,
        },
      }),
    onSuccess: async () => {
      await invalidar();
      navegar('/recorrencias');
    },
  });
  const campos = salvar.error?.campos ?? {};
  const erroDe = (c) => campos[c] && <p role="alert" className="erro campo-erro">{campos[c]}</p>;

  return (
    <section>
      <h1>{edicao ? 'Editar recorrência' : 'Nova recorrência'}</h1>
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div className="segmentado" role="group" aria-label="Tipo">
          {[['despesa', 'Despesa'], ['receita', 'Receita']].map(([t, rotulo]) => (
            <button
              key={t}
              type="button"
              className={tipo === t ? 'ativo' : ''}
              aria-pressed={tipo === t}
              onClick={() => {
                setTipo(t);
                setCategoriaId('');
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="campo">
          <label htmlFor="rec-descricao">Descrição</label>
          <input id="rec-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} autoFocus={!edicao} />
          {erroDe('descricao')}
        </div>
        <CampoValor id="rec-valor" rotulo="Valor de cada ocorrência" inicial={edicao?.valor_centavos ?? null} aoMudar={setValor} erro={campos.valor_centavos} />
        <div className="campo">
          <label htmlFor="rec-conta">Conta</label>
          <select id="rec-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas.filter((c) => !c.arquivada || c.id === edicao?.conta_id).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          {erroDe('conta_id')}
        </div>
        <div className="campo">
          <label htmlFor="rec-categoria">Categoria</label>
          <select id="rec-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {opcoesCategoria.map((c) => (
              <option key={c.id} value={c.id}>{c.rotulo}</option>
            ))}
          </select>
          {erroDe('categoria_id')}
        </div>
        <div className="campo">
          <label htmlFor="rec-frequencia">Frequência</label>
          <select id="rec-frequencia" value={frequencia} onChange={(e) => setFrequencia(e.target.value)}>
            {FREQUENCIAS.map((f) => (
              <option key={f} value={f}>{ROTULOS_FREQUENCIA[f]}</option>
            ))}
          </select>
          {frequencia === 'mensal' && (
            <p className="suave pequeno">Em meses sem o dia escolhido (ex.: 31), vale o último dia do mês.</p>
          )}
        </div>
        <div className="campos-lado">
          <div className="campo">
            <label htmlFor="rec-inicio">Primeira ocorrência</label>
            <input id="rec-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            {erroDe('data_inicio')}
          </div>
          <div className="campo">
            <label htmlFor="rec-fim">Até (opcional)</label>
            <input id="rec-fim" type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} />
            {erroDe('data_fim')}
          </div>
        </div>
        {inicio < hojeIso(fuso) && !edicao && (
          <p className="suave pequeno">
            A data de início já passou: as ocorrências de lá até hoje entram como pendentes e atrasadas, para você dar baixa ou apagar.
          </p>
        )}
        <div className="campo">
          <label htmlFor="rec-obs">Observação</label>
          <textarea id="rec-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
        </div>
        <label className="linha-checkbox">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          <span>Ativa (gera novas ocorrências)</span>
        </label>
        {edicao && (
          <p className="suave pequeno">
            Mudanças valem daqui para frente: as ocorrências pendentes futuras são refeitas; o que já venceu ou foi liquidado não muda.
          </p>
        )}
        {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
        <div className="acoes">
          <button type="submit" className="botao-primario" disabled={salvar.isPending || valor == null || !contaId}>Salvar</button>
          <Link className="botao" to="/recorrencias">Cancelar</Link>
        </div>
      </form>
    </section>
  );
}

export function FormularioRecorrencia({ fuso }) {
  const { id } = useParams();
  const contas = useContas();
  const categorias = useCategorias();
  const origem = useQuery({ queryKey: ['recorrencia', id], queryFn: () => api(`/recorrencias/${id}`), enabled: Boolean(id) });

  if (contas.isPending || categorias.isPending || (id && origem.isPending)) return <p className="carregando">Carregando…</p>;
  const erro = contas.error ?? categorias.error ?? origem.error;
  if (erro) return <p className="erro">{erro.message}</p>;
  if (contas.data.itens.filter((c) => !c.arquivada).length === 0) {
    return (
      <section>
        <h1>Nova recorrência</h1>
        <div className="cartao vazio">
          <p>Para cadastrar uma recorrência, crie uma conta.</p>
          <Link className="botao-primario" to="/contas">Ir para Contas</Link>
        </div>
      </section>
    );
  }
  return <Formulario origem={id ? origem.data : null} contas={contas.data.itens} categorias={categorias.data.itens} fuso={fuso} />;
}
