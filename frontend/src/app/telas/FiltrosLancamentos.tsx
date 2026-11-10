import { useState } from 'react';
import { ROTULOS_STATUS, ROTULOS_TIPO } from '../../../../contratos/movimentacoes.js';
import { Campo } from '@/components/Campo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { porId, rotuloCategoria, useCategorias, useContas } from '@/lib/dados';

const ORDENACOES: [string, string][] = [
  ['data', 'Data'],
  ['valor', 'Valor'],
  ['descricao', 'Descrição'],
  ['criada', 'Criação'],
];

interface Props {
  params: URLSearchParams;
  mudar: (mudancas: Record<string, string>) => void;
}

/** Filtros da listagem. O estado mora na URL (`params`); aqui só se lê e se grava. */
export function FiltrosLancamentos({ params, mudar }: Props) {
  const contas = useContas();
  const categorias = useCategorias();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(params.get('q') ?? '');
  const mapa = porId(categorias.data?.itens);

  const ativos = ['tipo', 'status', 'conta_id', 'categoria_id', 'de', 'ate'].filter((k) => params.get(k)).length;
  const valor = (nome: string) => params.get(nome) ?? '';

  return (
    <div className="space-y-3">
      <form
        role="search"
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          mudar({ q: busca.trim() });
        }}
      >
        <label htmlFor="filtro-q" className="sr-only">
          Buscar por descrição ou observação
        </label>
        <Input
          id="filtro-q"
          type="search"
          className="min-w-0 flex-1 basis-56"
          placeholder="Buscar descrição ou observação"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        <Button type="button" variant="outline" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
          Filtros{ativos > 0 ? ` (${ativos})` : ''}
        </Button>
      </form>

      {aberto ? (
        <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="filtro-tipo" rotulo="Tipo">
            <Select id="filtro-tipo" value={valor('tipo')} onChange={(e) => mudar({ tipo: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(ROTULOS_TIPO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo id="filtro-status" rotulo="Situação">
            <Select id="filtro-status" value={valor('status')} onChange={(e) => mudar({ status: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(ROTULOS_STATUS).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo id="filtro-conta" rotulo="Conta">
            <Select id="filtro-conta" value={valor('conta_id')} onChange={(e) => mudar({ conta_id: e.target.value })}>
              <option value="">Todas</option>
              {(contas.data?.itens ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo id="filtro-categoria" rotulo="Categoria">
            <Select
              id="filtro-categoria"
              value={valor('categoria_id')}
              onChange={(e) => mudar({ categoria_id: e.target.value })}
            >
              <option value="">Todas</option>
              {(categorias.data?.itens ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {rotuloCategoria(c, mapa)}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo id="filtro-campo-data" rotulo="Filtrar datas por">
            <Select
              id="filtro-campo-data"
              value={valor('campo_data') || 'competencia'}
              onChange={(e) => mudar({ campo_data: e.target.value === 'competencia' ? '' : e.target.value })}
            >
              <option value="competencia">Competência</option>
              <option value="vencimento">Vencimento</option>
              <option value="liquidacao">Liquidação</option>
            </Select>
          </Campo>
          <Campo id="filtro-de" rotulo="De">
            <Input id="filtro-de" type="date" value={valor('de')} onChange={(e) => mudar({ de: e.target.value })} />
          </Campo>
          <Campo id="filtro-ate" rotulo="Até">
            <Input id="filtro-ate" type="date" value={valor('ate')} onChange={(e) => mudar({ ate: e.target.value })} />
          </Campo>
          <Campo id="filtro-ordem" rotulo="Ordenar por">
            <Select
              id="filtro-ordem"
              value={valor('ordenar') || 'data'}
              onChange={(e) => mudar({ ordenar: e.target.value === 'data' ? '' : e.target.value })}
            >
              {ORDENACOES.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo id="filtro-direcao" rotulo="Direção">
            <Select
              id="filtro-direcao"
              value={valor('direcao') || 'desc'}
              onChange={(e) => mudar({ direcao: e.target.value === 'desc' ? '' : e.target.value })}
            >
              <option value="desc">Maior/mais recente primeiro</option>
              <option value="asc">Menor/mais antigo primeiro</option>
            </Select>
          </Campo>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBusca('');
                mudar({
                  q: '', tipo: '', status: '', conta_id: '', categoria_id: '', campo_data: '',
                  de: '', ate: '', ordenar: '', direcao: '',
                });
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
