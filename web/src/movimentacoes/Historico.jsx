import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatarDinheiro } from '../../../contratos/dinheiro.js';
import { ROTULOS_STATUS, ROTULOS_TIPO } from '../../../contratos/movimentacoes.js';
import { api } from '../compartilhado/api.js';
import { formatarData, formatarDataHora } from '../compartilhado/datas.js';
import { porId, useCategorias, useContas } from '../compartilhado/dados.js';

const ACOES = { criar: 'Criado', editar: 'Alterado', excluir: 'Excluído' };

const CAMPOS = [
  ['tipo', 'Tipo', (v) => ROTULOS_TIPO[v] ?? v],
  ['descricao', 'Descrição', (v) => v || '—'],
  ['valor_centavos', 'Valor', (v) => formatarDinheiro(v)],
  ['status', 'Situação', (v) => ROTULOS_STATUS[v] ?? v],
  ['data_competencia', 'Data', formatarData],
  ['data_vencimento', 'Vencimento', (v) => (v ? formatarData(v) : '—')],
  ['data_liquidacao', 'Liquidação', (v) => (v ? formatarData(v) : '—')],
  ['observacao', 'Observação', (v) => v || '—'],
];

function descreverMudancas(antes, depois, contas, categorias) {
  const nomeConta = (id) => (id ? (contas.get(id)?.nome ?? `#${id}`) : '—');
  const nomeCategoria = (id) => (id ? (categorias.get(id)?.nome ?? `#${id}`) : '—');
  const campos = [
    ...CAMPOS,
    ['conta_id', 'Conta', nomeConta],
    ['conta_destino_id', 'Conta de destino', nomeConta],
    ['categoria_id', 'Categoria', nomeCategoria],
  ];
  const base = depois ?? antes;
  return campos
    .filter(([chave]) => !antes || !depois || antes[chave] !== depois[chave])
    .filter(([chave]) => base[chave] !== undefined)
    .map(([chave, rotulo, formatar]) => ({
      rotulo,
      antes: antes ? formatar(antes[chave]) : null,
      depois: depois ? formatar(depois[chave]) : null,
    }));
}

export function Historico({ fuso }) {
  const { id } = useParams();
  const consulta = useQuery({ queryKey: ['historico', id], queryFn: () => api(`/movimentacoes/${id}/historico`) });
  const contas = useContas();
  const categorias = useCategorias();

  if (consulta.isPending || contas.isPending || categorias.isPending) return <p className="carregando">Carregando…</p>;
  const erro = consulta.error ?? contas.error ?? categorias.error;
  if (erro) return <p className="erro">{erro.message}</p>;

  const mapaContas = porId(contas.data.itens);
  const mapaCategorias = porId(categorias.data.itens);

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Histórico do lançamento</h1>
        <Link className="botao" to="/lancamentos">Voltar</Link>
      </div>
      <ol className="linha-do-tempo lista-limpa">
        {consulta.data.itens.map((e) => {
          const mudancas = descreverMudancas(e.antes, e.depois, mapaContas, mapaCategorias);
          return (
            <li key={e.id} className="cartao">
              <p>
                <strong>{ACOES[e.acao] ?? e.acao}</strong>{' '}
                <span className="suave">em {formatarDataHora(e.criado_em, fuso)}</span>
              </p>
              {e.acao === 'editar' && mudancas.length === 0 && <p className="suave">Sem mudança visível nos campos.</p>}
              <ul className="lista-limpa">
                {mudancas.map((m) => (
                  <li key={m.rotulo}>
                    <span className="suave">{m.rotulo}: </span>
                    {m.antes !== null && m.depois !== null ? (
                      <>
                        <del>{m.antes}</del> → <ins>{m.depois}</ins>
                      </>
                    ) : (
                      (m.depois ?? m.antes)
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
