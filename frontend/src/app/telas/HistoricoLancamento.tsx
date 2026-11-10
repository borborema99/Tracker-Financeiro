import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { formatarDinheiro } from '../../../../contratos/dinheiro.js';
import { ROTULOS_STATUS, ROTULOS_TIPO } from '../../../../contratos/movimentacoes.js';
import { Carregando, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { porId, useCategorias, useContas } from '@/lib/dados';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';

type Registro = Record<string, unknown>;

interface Evento {
  id: number;
  acao: string;
  criado_em: string;
  antes: Registro | null;
  depois: Registro | null;
}

const ACOES: Record<string, string> = { criar: 'Criado', editar: 'Alterado', excluir: 'Excluído' };

const texto = (v: unknown): string => (v == null || v === '' ? '—' : String(v));
const data = (v: unknown): string => (typeof v === 'string' && v ? formatarData(v) : '—');

function descreverMudancas(
  antes: Registro | null,
  depois: Registro | null,
  nomeConta: (id: unknown) => string,
  nomeCategoria: (id: unknown) => string,
) {
  const campos: [string, string, (v: unknown) => string][] = [
    ['tipo', 'Tipo', (v) => ROTULOS_TIPO[v as keyof typeof ROTULOS_TIPO] ?? texto(v)],
    ['descricao', 'Descrição', texto],
    ['valor_centavos', 'Valor', (v) => formatarDinheiro(Number(v))],
    ['status', 'Situação', (v) => ROTULOS_STATUS[v as keyof typeof ROTULOS_STATUS] ?? texto(v)],
    ['data_competencia', 'Data', data],
    ['data_vencimento', 'Vencimento', data],
    ['data_liquidacao', 'Liquidação', data],
    ['observacao', 'Observação', texto],
    ['conta_id', 'Conta', nomeConta],
    ['conta_destino_id', 'Conta de destino', nomeConta],
    ['categoria_id', 'Categoria', nomeCategoria],
  ];
  const base = depois ?? antes ?? {};
  return campos
    .filter(([chave]) => !antes || !depois || antes[chave] !== depois[chave])
    .filter(([chave]) => base[chave] !== undefined)
    .map(([chave, rotulo, formatar]) => ({
      rotulo,
      antes: antes ? formatar(antes[chave]) : null,
      depois: depois ? formatar(depois[chave]) : null,
    }));
}

/** Trilha de auditoria do lançamento: o que mudou em cada escrita, no fuso configurado. */
export default function HistoricoLancamento() {
  const { id } = useParams();
  const { sessao } = useSessao();
  const consulta = useQuery({
    queryKey: ['historico', id],
    queryFn: () => api<{ itens: Evento[] }>(`/movimentacoes/${id}/historico`),
  });
  const contas = useContas();
  const categorias = useCategorias();

  const erro = consulta.error ?? contas.error ?? categorias.error;
  if (erro) return <ErroDeTela erro={erro} aoTentar={() => void consulta.refetch()} />;
  if (!consulta.data || !contas.data || !categorias.data) return <Carregando />;

  const mapaContas = porId(contas.data.itens);
  const mapaCategorias = porId(categorias.data.itens);
  const nomeConta = (v: unknown) => (v ? (mapaContas.get(Number(v))?.nome ?? `#${String(v)}`) : '—');
  const nomeCategoria = (v: unknown) => (v ? (mapaCategorias.get(Number(v))?.nome ?? `#${String(v)}`) : '—');

  return (
    <Pagina
      titulo="Histórico do lançamento"
      acao={
        <Button asChild variant="outline">
          <Link to="/app/lancamentos">Voltar</Link>
        </Button>
      }
    >
      {consulta.data.itens.length === 0 ? (
        <Vazio titulo="Sem registros para este lançamento." />
      ) : (
        <ol className="max-w-2xl space-y-3">
          {consulta.data.itens.map((e) => {
            const mudancas = descreverMudancas(e.antes, e.depois, nomeConta, nomeCategoria);
            return (
              <li key={e.id} className="space-y-2 rounded-lg border bg-card p-4">
                <p>
                  <strong>{ACOES[e.acao] ?? e.acao}</strong>{' '}
                  <span className="text-sm text-muted-foreground">em {formatarDataHora(e.criado_em, sessao?.fuso)}</span>
                </p>
                {e.acao === 'editar' && mudancas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem mudança visível nos campos.</p>
                ) : null}
                <ul className="space-y-1 text-sm">
                  {mudancas.map((m) => (
                    <li key={m.rotulo}>
                      <span className="text-muted-foreground">{m.rotulo}: </span>
                      {m.antes !== null && m.depois !== null ? (
                        <>
                          <del>{m.antes}</del> → <ins className="no-underline font-medium">{m.depois}</ins>
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
      )}
    </Pagina>
  );
}
