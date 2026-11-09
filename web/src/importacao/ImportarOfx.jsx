import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { MAXIMO_DE_TRANSACOES_OFX, TAMANHO_MAXIMO_OFX } from '../../../contratos/importacao.js';
import { api, enviarArquivo } from '../compartilhado/api.js';
import { formatarData } from '../compartilhado/datas.js';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados } from '../compartilhado/dados.js';
import { Valor } from '../compartilhado/Valor.jsx';

const ROTULO_SITUACAO = {
  nova: 'Nova',
  ja_importada: 'Já importada',
  possivel_duplicidade: 'Possível duplicidade',
};

export function ImportarOfx() {
  const invalidar = useInvalidarDados();
  const contas = useContas();
  const categorias = useCategorias();
  const [contaId, setContaId] = useState('');
  const [erroLocal, setErroLocal] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [categoriaDe, setCategoriaDe] = useState({});
  const [resultado, setResultado] = useState(null);

  const ler = useMutation({
    mutationFn: ({ arquivo, conta }) => enviarArquivo(`/importacao/ofx/previa?conta_id=${conta}`, arquivo, { 'content-type': 'application/x-ofx' }),
    onSuccess: (dados) => {
      setPrevia(dados);
      setResultado(null);
      setCategoriaDe({});
      // Só as novas vêm marcadas. Duplicidade possível o dono decide; já importada nem entra.
      setMarcadas(new Set(dados.itens.filter((i) => i.situacao === 'nova').map((i) => i.fitid)));
    },
  });

  const confirmar = useMutation({
    mutationFn: () =>
      api('/importacao/ofx/confirmar', {
        metodo: 'POST',
        corpo: {
          conta_id: Number(contaId),
          itens: previa.itens
            .filter((i) => marcadas.has(i.fitid))
            .map(({ fitid, data, valor_centavos, descricao }) => ({
              fitid,
              data,
              valor_centavos,
              descricao,
              categoria_id: categoriaDe[fitid] ? Number(categoriaDe[fitid]) : null,
            })),
        },
      }),
    onSuccess: async (dados) => {
      await invalidar();
      setResultado(dados);
      setPrevia(null);
    },
  });

  if (contas.isPending || categorias.isPending) return <p className="carregando">Carregando…</p>;
  const erroBase = contas.error ?? categorias.error;
  if (erroBase) return <p className="erro">{erroBase.message}</p>;

  const ativas = contas.data.itens.filter((c) => !c.arquivada);
  const mapa = porId(categorias.data.itens);
  const opcoes = (tipo) =>
    categorias.data.itens
      .filter((c) => c.tipo === tipo && c.papel == null && !c.arquivada)
      .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  function escolherArquivo(evento) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    setErroLocal(null);
    setPrevia(null);
    setResultado(null);
    if (!arquivo) return;
    if (!contaId) return setErroLocal('Escolha a conta antes de enviar o arquivo.');
    if (arquivo.size > TAMANHO_MAXIMO_OFX) return setErroLocal(`Arquivo grande demais (máx. ${TAMANHO_MAXIMO_OFX / 1024 / 1024} MB).`);
    ler.mutate({ arquivo, conta: contaId });
  }

  function alternar(fitid) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(fitid)) novo.delete(fitid);
      else novo.add(fitid);
      return novo;
    });
  }

  const erroLeitura = erroLocal ?? ler.error?.campos?.arquivo ?? ler.error?.campos?.conta_id ?? ler.error?.message;

  if (ativas.length === 0) {
    return (
      <section>
        <h1>Importar extrato</h1>
        <div className="cartao vazio">
          <p>Crie uma conta antes de importar um extrato.</p>
          <Link className="botao-primario" to="/contas">Criar conta</Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Importar extrato</h1>
      <p className="suave pequeno">
        Baixe o extrato do seu banco no formato OFX e escolha o arquivo aqui. Primeiro você confere a lista; só depois os lançamentos são criados,
        já liquidados. O mesmo extrato nunca entra duas vezes. Só extrato em reais (BRL), até {MAXIMO_DE_TRANSACOES_OFX} transações por vez.
        O arquivo não sai deste computador.
      </p>

      <div className="cartao">
        <div className="campo">
          <label htmlFor="ofx-conta">Conta que recebe os lançamentos</label>
          <select id="ofx-conta" value={contaId} onChange={(e) => { setContaId(e.target.value); setPrevia(null); }}>
            <option value="">Escolha a conta</option>
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <label className="botao-primario" htmlFor="ofx-arquivo" aria-disabled={ler.isPending}>
          {ler.isPending ? 'Lendo…' : 'Escolher arquivo OFX'}
        </label>
        <input id="ofx-arquivo" type="file" className="campo-arquivo" accept=".ofx,.OFX" disabled={ler.isPending} onChange={escolherArquivo} />
        {erroLeitura && <p role="alert" className="erro">{erroLeitura}</p>}
      </div>

      {resultado && (
        <div className="cartao" role="status">
          <h2>Importação concluída</h2>
          <p>{resultado.importadas} {resultado.importadas === 1 ? 'lançamento criado' : 'lançamentos criados'}.</p>
          {resultado.ignoradas > 0 && <p className="suave">{resultado.ignoradas} já tinham sido importadas e foram ignoradas.</p>}
          {resultado.avisos_de_duplicidade > 0 && (
            <p className="suave">{resultado.avisos_de_duplicidade} parecem repetir um lançamento que já existia. Confira na lista.</p>
          )}
          <Link className="botao" to="/lancamentos">Ver lançamentos</Link>
        </div>
      )}

      {previa && (
        <>
          <div className="cartao">
            <h2>Conferir antes de importar</h2>
            <p>
              {previa.resumo.total} {previa.resumo.total === 1 ? 'transação' : 'transações'}: {previa.resumo.novas} nova(s),{' '}
              {previa.resumo.ja_importadas} já importada(s), {previa.resumo.possiveis_duplicidades} possível(is) duplicidade(s).
            </p>
            {previa.invalidas.length > 0 && (
              <p className="suave pequeno">
                {previa.invalidas.length} linha(s) do arquivo foram ignoradas por problema:{' '}
                {previa.invalidas.slice(0, 3).map((i) => `#${i.indice} ${i.motivo}`).join(' ')}
              </p>
            )}
            <p className="suave pequeno">Possível duplicidade vem desmarcada: ela tem o mesmo valor, data, conta e descrição de um lançamento seu.</p>
          </div>

          {previa.itens.length === 0 ? (
            <div className="cartao vazio"><p>Nenhuma transação válida no arquivo.</p></div>
          ) : (
            <ul className="lista-limpa">
              {previa.itens.map((i) => {
                const ehReceita = i.valor_centavos > 0;
                const bloqueada = i.situacao === 'ja_importada';
                return (
                  <li key={i.fitid} className="cartao">
                    <label className="linha-marcar">
                      <input type="checkbox" checked={marcadas.has(i.fitid)} disabled={bloqueada} onChange={() => alternar(i.fitid)} />
                      <span>
                        <strong>{i.descricao || 'Sem descrição'}</strong>
                        <span className="suave pequeno"> · {formatarData(i.data)}</span>
                      </span>
                    </label>
                    <p>
                      <Valor centavos={Math.abs(i.valor_centavos)} tipo={ehReceita ? 'entrada' : 'saida'} />{' '}
                      <span className={`etiqueta ${i.situacao === 'nova' ? 'ok' : 'atencao'}`}>{ROTULO_SITUACAO[i.situacao]}</span>
                    </p>
                    {!bloqueada && (
                      <div className="campo">
                        <label htmlFor={`cat-${i.fitid}`}>Categoria ({ehReceita ? 'receita' : 'despesa'})</label>
                        <select id={`cat-${i.fitid}`} value={categoriaDe[i.fitid] ?? ''} onChange={(e) => setCategoriaDe({ ...categoriaDe, [i.fitid]: e.target.value })}>
                          <option value="">Sem categoria</option>
                          {opcoes(ehReceita ? 'receita' : 'despesa').map((c) => (
                            <option key={c.id} value={c.id}>{c.rotulo}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {confirmar.error && <p role="alert" className="erro">{confirmar.error.message}</p>}
          <div className="acoes">
            <button type="button" className="botao-primario" disabled={confirmar.isPending || marcadas.size === 0} onClick={() => confirmar.mutate()}>
              Importar {marcadas.size} {marcadas.size === 1 ? 'transação' : 'transações'}
            </button>
            <button type="button" className="botao" onClick={() => setPrevia(null)}>Cancelar</button>
          </div>
        </>
      )}
    </section>
  );
}
