import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../compartilhado/api.js';
import { useCategorias, useInvalidarDados } from '../compartilhado/dados.js';

function FormularioCategoria({ alvo, raizes, aoConcluir }) {
  const invalidar = useInvalidarDados();
  const existente = alvo.categoria ?? null;
  const [nome, setNome] = useState(existente?.nome ?? '');
  const [tipo, setTipo] = useState(existente?.tipo ?? alvo.tipo ?? 'despesa');
  const [paiId, setPaiId] = useState(String(existente?.pai_id ?? alvo.paiId ?? ''));

  const salvar = useMutation({
    mutationFn: () =>
      api(existente ? `/categorias/${existente.id}` : '/categorias', {
        metodo: existente ? 'PUT' : 'POST',
        corpo: { nome, tipo, pai_id: paiId ? Number(paiId) : null, arquivada: existente?.arquivada ?? false },
      }),
    onSuccess: async () => {
      await invalidar();
      aoConcluir();
    },
  });
  const campos = salvar.error?.campos ?? {};
  const temFilhas = existente && raizes.length > 0 && alvo.temFilhas;

  return (
    <form
      className="cartao"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h2>{existente ? 'Editar categoria' : paiId ? 'Nova subcategoria' : 'Nova categoria'}</h2>
      <div className="campo">
        <label htmlFor="cat-nome">Nome</label>
        <input id="cat-nome" value={nome} maxLength={60} autoFocus onChange={(e) => setNome(e.target.value)} />
        {campos.nome && <p role="alert" className="erro campo-erro">{campos.nome}</p>}
      </div>
      <div className="campo">
        <label htmlFor="cat-tipo">Tipo</label>
        <select
          id="cat-tipo"
          value={tipo}
          disabled={!!existente || !!paiId}
          onChange={(e) => {
            setTipo(e.target.value);
            setPaiId('');
          }}
        >
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor="cat-pai">Categoria principal (deixe vazio para uma categoria principal)</label>
        <select id="cat-pai" value={paiId} disabled={!!temFilhas} onChange={(e) => setPaiId(e.target.value)}>
          <option value="">Nenhuma (é uma categoria principal)</option>
          {raizes
            .filter((r) => r.tipo === tipo && r.id !== existente?.id)
            .map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
        </select>
        {campos.pai_id && <p role="alert" className="erro campo-erro">{campos.pai_id}</p>}
      </div>
      {salvar.error && !salvar.error.campos && <p role="alert" className="erro">{salvar.error.message}</p>}
      <div className="acoes">
        <button type="submit" className="botao-primario" disabled={salvar.isPending}>Salvar</button>
        <button type="button" className="botao" onClick={aoConcluir}>Cancelar</button>
      </div>
    </form>
  );
}

function LinhaCategoria({ categoria, filhas, aoEditar, aoNovaFilha }) {
  const invalidar = useInvalidarDados();
  const [confirmando, setConfirmando] = useState(false);
  const arquivar = useMutation({
    mutationFn: () =>
      api(`/categorias/${categoria.id}`, {
        metodo: 'PUT',
        corpo: {
          nome: categoria.nome,
          tipo: categoria.tipo,
          pai_id: categoria.pai_id,
          arquivada: !categoria.arquivada,
        },
      }),
    onSuccess: invalidar,
  });
  const excluir = useMutation({
    mutationFn: () => api(`/categorias/${categoria.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
    onError: () => setConfirmando(false),
  });
  const erro = arquivar.error?.message ?? excluir.error?.message;
  const motivoSemExcluir = categoria.papel
    ? 'Usada pelo sistema nas tarifas de transferência'
    : filhas.length > 0
      ? 'Tem subcategorias'
      : categoria.usos > 0
        ? `Tem ${categoria.usos} lançamento(s); arquive em vez de excluir`
        : '';

  return (
    <li className={`linha-categoria${categoria.arquivada ? ' arquivada' : ''}`}>
      <div className="item-topo">
        <span>
          {categoria.nome}
          {categoria.arquivada && <span className="etiqueta"> Arquivada</span>}
          {categoria.papel && <span className="etiqueta"> Do sistema</span>}
        </span>
        <span className="suave">{categoria.usos > 0 ? `${categoria.usos} lançamento(s)` : ''}</span>
      </div>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <div className="acoes acoes-compactas">
        <button type="button" className="botao" onClick={() => aoEditar(categoria, filhas.length > 0)}>Editar</button>
        {categoria.pai_id == null && (
          <button type="button" className="botao" onClick={() => aoNovaFilha(categoria)}>+ Subcategoria</button>
        )}
        <button type="button" className="botao" onClick={() => arquivar.mutate()} disabled={arquivar.isPending}>
          {categoria.arquivada ? 'Reativar' : 'Arquivar'}
        </button>
        {confirmando ? (
          <button type="button" className="botao perigo" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
            Confirmar exclusão
          </button>
        ) : (
          <button
            type="button"
            className="botao"
            disabled={!!motivoSemExcluir}
            title={motivoSemExcluir || undefined}
            onClick={() => setConfirmando(true)}
          >
            Excluir
          </button>
        )}
      </div>
      {motivoSemExcluir && <p className="suave pequeno">Não dá para excluir: {motivoSemExcluir.toLowerCase()}.</p>}
    </li>
  );
}

export function Categorias() {
  const { data, isPending, error } = useCategorias();
  const [alvo, setAlvo] = useState(null);

  if (isPending) return <p className="carregando">Carregando…</p>;
  if (error) return <p className="erro">{error.message}</p>;

  const itens = data.itens;
  const raizes = itens.filter((c) => c.pai_id == null);

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Categorias</h1>
        {!alvo && (
          <button type="button" className="botao-primario" onClick={() => setAlvo({ tipo: 'despesa' })}>
            Nova categoria
          </button>
        )}
      </div>

      {alvo && (
        <FormularioCategoria
          key={alvo.categoria?.id ?? `nova-${alvo.paiId ?? ''}`}
          alvo={alvo}
          raizes={raizes}
          aoConcluir={() => setAlvo(null)}
        />
      )}

      {['despesa', 'receita'].map((tipo) => (
        <div key={tipo} className="grupo-categorias">
          <h2>{tipo === 'despesa' ? 'Despesas' : 'Receitas'}</h2>
          <ul className="lista-limpa cartao">
            {raizes
              .filter((r) => r.tipo === tipo)
              .map((r) => {
                const filhas = itens.filter((c) => c.pai_id === r.id);
                return (
                  <li key={r.id}>
                    <ul className="lista-limpa">
                      <LinhaCategoria
                        categoria={r}
                        filhas={filhas}
                        aoEditar={(categoria, temFilhas) => setAlvo({ categoria, temFilhas })}
                        aoNovaFilha={(pai) => setAlvo({ tipo: pai.tipo, paiId: pai.id })}
                      />
                      {filhas.map((f) => (
                        <li key={f.id} className="filha">
                          <ul className="lista-limpa">
                            <LinhaCategoria
                              categoria={f}
                              filhas={[]}
                              aoEditar={(categoria) => setAlvo({ categoria, temFilhas: false })}
                              aoNovaFilha={() => {}}
                            />
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}
