import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { esquemaCategoria } from '../../../../contratos/categorias.js';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { Carregando, ErroDeAcao, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useCategorias, useInvalidarDados, type Categoria } from '@/lib/dados';
import { erroDoCampo, useFormulario } from '@/lib/formulario';

interface Alvo {
  categoria?: Categoria;
  temFilhas?: boolean;
  tipo?: 'despesa' | 'receita';
  paiId?: number;
}

interface Campos {
  nome: string;
  tipo: 'despesa' | 'receita';
  pai_id: string;
  arquivada: boolean;
}

// O formulário guarda o pai como texto (valor do <select>); o corpo enviado converte para número. Nome e tipo
// vêm do contrato do servidor, então as mensagens são as mesmas.
const esquemaDoFormulario = z.object({
  nome: esquemaCategoria.shape.nome,
  tipo: esquemaCategoria.shape.tipo,
  pai_id: z.string(),
  arquivada: z.boolean(),
});

function FormularioCategoria({ alvo, raizes, aoConcluir }: { alvo: Alvo; raizes: Categoria[]; aoConcluir: () => void }) {
  const invalidar = useInvalidarDados();
  const existente = alvo.categoria ?? null;
  const { register, handleSubmit, watch, setValue, formState, aplicarErro, erroDoServidor } = useFormulario<Campos>(
    esquemaDoFormulario,
    {
      nome: existente?.nome ?? '',
      tipo: existente?.tipo ?? alvo.tipo ?? 'despesa',
      pai_id: String(existente?.pai_id ?? alvo.paiId ?? ''),
      arquivada: existente?.arquivada ?? false,
    },
  );
  const tipo = watch('tipo');
  const paiId = watch('pai_id');
  const salvar = useMutation({
    mutationFn: (v: Campos) =>
      api(existente ? `/categorias/${existente.id}` : '/categorias', {
        metodo: existente ? 'PUT' : 'POST',
        corpo: { nome: v.nome, tipo: v.tipo, pai_id: v.pai_id ? Number(v.pai_id) : null, arquivada: v.arquivada },
      }),
    onSuccess: async () => {
      await invalidar();
      aoConcluir();
    },
    onError: aplicarErro,
  });
  const temFilhas = Boolean(existente && alvo.temFilhas);

  return (
    <form
      noValidate
      onSubmit={(e) => void handleSubmit((v) => salvar.mutate(v))(e)}
      className="max-w-md space-y-4 rounded-lg border bg-card p-4"
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">
        {existente ? 'Editar categoria' : paiId ? 'Nova subcategoria' : 'Nova categoria'}
      </h2>
      <Campo id="cat-nome" rotulo="Nome" erro={erroDoCampo(formState.errors, 'nome')}>
        <Input id="cat-nome" maxLength={60} autoFocus {...register('nome')} />
      </Campo>
      <Campo id="cat-tipo" rotulo="Tipo">
        <Select
          id="cat-tipo"
          disabled={Boolean(existente) || Boolean(paiId)}
          {...register('tipo', { onChange: () => setValue('pai_id', '') })}
        >
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </Select>
      </Campo>
      <Campo
        id="cat-pai"
        rotulo="Categoria principal (deixe vazio para uma categoria principal)"
        erro={erroDoCampo(formState.errors, 'pai_id')}
      >
        <Select id="cat-pai" disabled={temFilhas} {...register('pai_id')}>
          <option value="">Nenhuma (é uma categoria principal)</option>
          {raizes
            .filter((r) => r.tipo === tipo && r.id !== existente?.id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
        </Select>
      </Campo>
      {erroDoServidor ? <p role="alert" className="text-sm font-medium text-destructive">{erroDoServidor}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={aoConcluir}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function LinhaCategoria({
  categoria,
  filhas,
  aoEditar,
  aoNovaFilha,
}: {
  categoria: Categoria;
  filhas: Categoria[];
  aoEditar: (c: Categoria, temFilhas: boolean) => void;
  aoNovaFilha: (pai: Categoria) => void;
}) {
  const invalidar = useInvalidarDados();
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
  });
  const motivoSemExcluir = categoria.papel
    ? 'Usada pelo sistema nas tarifas de transferência'
    : filhas.length > 0
      ? 'Tem subcategorias'
      : categoria.usos > 0
        ? `Tem ${categoria.usos} lançamento(s); arquive em vez de excluir`
        : '';

  return (
    <li className={`space-y-2 py-3 ${categoria.arquivada ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {categoria.nome}
          {categoria.arquivada ? <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs">Arquivada</span> : null}
          {categoria.papel ? <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs">Do sistema</span> : null}
        </span>
        <span className="text-sm text-muted-foreground">
          {categoria.usos > 0 ? `${categoria.usos} lançamento(s)` : ''}
        </span>
      </div>
      <ErroDeAcao erro={arquivar.error ?? excluir.error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => aoEditar(categoria, filhas.length > 0)}>
          Editar
        </Button>
        {categoria.pai_id == null ? (
          <Button variant="outline" onClick={() => aoNovaFilha(categoria)}>
            + Subcategoria
          </Button>
        ) : null}
        <Button variant="outline" disabled={arquivar.isPending} onClick={() => arquivar.mutate()}>
          {categoria.arquivada ? 'Reativar' : 'Arquivar'}
        </Button>
        <BotaoExcluir
          aoConfirmar={() => excluir.mutate()}
          pendente={excluir.isPending}
          desabilitado={Boolean(motivoSemExcluir)}
          titulo={motivoSemExcluir || undefined}
        />
      </div>
      {motivoSemExcluir ? (
        <p className="text-sm text-muted-foreground">Não dá para excluir: {motivoSemExcluir.toLowerCase()}.</p>
      ) : null}
    </li>
  );
}

export default function Categorias() {
  const { data, isPending, error, refetch } = useCategorias();
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  if (isPending) return <Carregando />;
  if (error) return <ErroDeTela erro={error} aoTentar={() => void refetch()} />;

  const itens = data.itens;
  const raizes = itens.filter((c) => c.pai_id == null);

  return (
    <Pagina
      titulo="Categorias"
      acao={alvo ? null : <Button onClick={() => setAlvo({ tipo: 'despesa' })}>Nova categoria</Button>}
    >
      {alvo ? (
        <FormularioCategoria
          key={alvo.categoria?.id ?? `nova-${alvo.paiId ?? ''}`}
          alvo={alvo}
          raizes={raizes}
          aoConcluir={() => setAlvo(null)}
        />
      ) : null}

      {(['despesa', 'receita'] as const).map((tipo) => (
        <div key={tipo} className="space-y-2">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">
            {tipo === 'despesa' ? 'Despesas' : 'Receitas'}
          </h2>
          <ul className="divide-y rounded-lg border bg-card px-4">
            {raizes
              .filter((r) => r.tipo === tipo)
              .map((r) => {
                const filhas = itens.filter((c) => c.pai_id === r.id);
                return (
                  <li key={r.id}>
                    <ul>
                      <LinhaCategoria
                        categoria={r}
                        filhas={filhas}
                        aoEditar={(categoria, temFilhas) => setAlvo({ categoria, temFilhas })}
                        aoNovaFilha={(pai) => setAlvo({ tipo: pai.tipo, paiId: pai.id })}
                      />
                      {filhas.map((f) => (
                        <li key={f.id} className="ml-5 border-t border-dotted">
                          <ul>
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
    </Pagina>
  );
}
