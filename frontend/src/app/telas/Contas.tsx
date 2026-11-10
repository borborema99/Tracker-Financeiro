import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { esquemaConta, ROTULOS_TIPO_CONTA, TIPOS_CONTA } from '../../../../contratos/contas.js';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Valor } from '@/components/Valor';
import { api } from '@/lib/api';
import { useContas, useInvalidarDados, type Conta } from '@/lib/dados';
import { erroDoCampo, useFormulario } from '@/lib/formulario';

interface Campos {
  nome: string;
  tipo: string;
  saldo_inicial_centavos: number;
  arquivada: boolean;
}

function corpoDaConta(conta: Conta, arquivada: boolean): Campos {
  return {
    nome: conta.nome,
    tipo: conta.tipo,
    saldo_inicial_centavos: conta.saldo_inicial_centavos,
    arquivada,
  };
}

function FormularioConta({ conta, aoConcluir }: { conta: Conta | null; aoConcluir: () => void }) {
  const invalidar = useInvalidarDados();
  const { register, control, handleSubmit, formState, aplicarErro, erroDoServidor } = useFormulario<Campos>(
    esquemaConta,
    {
      nome: conta?.nome ?? '',
      tipo: conta?.tipo ?? 'corrente',
      saldo_inicial_centavos: conta?.saldo_inicial_centavos ?? 0,
      arquivada: conta?.arquivada ?? false,
    },
  );
  const salvar = useMutation({
    mutationFn: (corpo: Campos) =>
      api(conta ? `/contas/${conta.id}` : '/contas', { metodo: conta ? 'PUT' : 'POST', corpo }),
    onSuccess: async () => {
      await invalidar();
      aoConcluir();
    },
    onError: aplicarErro,
  });

  return (
    <form
      noValidate
      onSubmit={(e) => void handleSubmit((v) => salvar.mutate(v))(e)}
      className="max-w-md space-y-4 rounded-lg border bg-card p-4"
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">
        {conta ? 'Editar conta' : 'Nova conta'}
      </h2>
      <Campo id="conta-nome" rotulo="Nome" erro={erroDoCampo(formState.errors, 'nome')}>
        <Input id="conta-nome" maxLength={60} autoFocus {...register('nome')} />
      </Campo>
      <Campo id="conta-tipo" rotulo="Tipo" erro={erroDoCampo(formState.errors, 'tipo')}>
        <Select id="conta-tipo" {...register('tipo')}>
          {TIPOS_CONTA.map((t) => (
            <option key={t} value={t}>
              {ROTULOS_TIPO_CONTA[t]}
            </option>
          ))}
        </Select>
      </Campo>
      <Controller
        control={control}
        name="saldo_inicial_centavos"
        render={({ field }) => (
          <CampoValor
            id="conta-saldo"
            rotulo="Saldo inicial"
            inicial={field.value}
            aoMudar={(c) => field.onChange(c ?? 0)}
            permitirNegativo
            erro={erroDoCampo(formState.errors, 'saldo_inicial_centavos')}
          />
        )}
      />
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

function CartaoConta({ conta, aoEditar }: { conta: Conta; aoEditar: (c: Conta) => void }) {
  const invalidar = useInvalidarDados();
  const arquivar = useMutation({
    mutationFn: () => api(`/contas/${conta.id}`, { metodo: 'PUT', corpo: corpoDaConta(conta, !conta.arquivada) }),
    onSuccess: invalidar,
  });
  const excluir = useMutation({
    mutationFn: () => api(`/contas/${conta.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });

  return (
    <li className={`space-y-3 rounded-lg border bg-card p-4 ${conta.arquivada ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{conta.nome}</p>
          <p className="text-sm text-muted-foreground">
            {ROTULOS_TIPO_CONTA[conta.tipo as keyof typeof ROTULOS_TIPO_CONTA]}
            {conta.arquivada ? <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs">Arquivada</span> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Saldo atual</p>
          <Valor centavos={conta.saldo_centavos} className="text-xl font-semibold" />
        </div>
      </div>
      <ErroDeAcao erro={arquivar.error ?? excluir.error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => aoEditar(conta)}>
          Editar
        </Button>
        <Button variant="outline" disabled={arquivar.isPending} onClick={() => arquivar.mutate()}>
          {conta.arquivada ? 'Reativar' : 'Arquivar'}
        </Button>
        <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      </div>
    </li>
  );
}

export default function Contas() {
  const { data, isPending, error, refetch } = useContas();
  const [editando, setEditando] = useState<'nova' | Conta | null>(null);

  if (isPending) return <Carregando />;
  if (error) return <ErroDeTela erro={error} aoTentar={() => void refetch()} />;

  return (
    <Pagina
      titulo="Contas"
      acao={editando ? null : <Button onClick={() => setEditando('nova')}>Nova conta</Button>}
    >
      {editando ? (
        <FormularioConta
          key={editando === 'nova' ? 'nova' : editando.id}
          conta={editando === 'nova' ? null : editando}
          aoConcluir={() => setEditando(null)}
        />
      ) : null}
      {data.itens.length === 0 && !editando ? (
        <Vazio titulo="Nenhuma conta ainda.">Crie uma conta corrente, poupança ou carteira para começar a lançar.</Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.itens.map((c) => (
            <CartaoConta key={c.id} conta={c} aoEditar={setEditando} />
          ))}
        </ul>
      )}
    </Pagina>
  );
}
