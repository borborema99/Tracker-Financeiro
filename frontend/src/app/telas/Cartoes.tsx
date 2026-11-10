import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Valor } from '@/components/Valor';
import { api, ErroApi } from '@/lib/api';
import { useCartoes, useContas, useInvalidarDados, type Cartao, type Conta } from '@/lib/dados';
import { formatarData } from '@/lib/datas';
import { Limite, rotuloFatura, StatusFatura } from './cartoesComum';

function corpoDe(cartao: Cartao, mudancas: Partial<{ arquivado: boolean }>) {
  return {
    nome: cartao.nome,
    limite_centavos: cartao.limite.limite_centavos,
    dia_fechamento: cartao.dia_fechamento,
    dia_vencimento: cartao.dia_vencimento,
    conta_pagamento_id: cartao.conta_pagamento_id,
    arquivado: cartao.arquivado,
    ...mudancas,
  };
}

function FormularioCartao({ cartao, contas, aoConcluir }: { cartao: Cartao | null; contas: Conta[]; aoConcluir: () => void }) {
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState(cartao?.nome ?? '');
  const [limite, setLimite] = useState<number | null>(cartao?.limite.limite_centavos ?? null);
  const [fechamento, setFechamento] = useState(String(cartao?.dia_fechamento ?? ''));
  const [vencimento, setVencimento] = useState(String(cartao?.dia_vencimento ?? ''));
  const [contaId, setContaId] = useState(String(cartao?.conta_pagamento_id ?? ''));

  const salvar = useMutation({
    mutationFn: () =>
      api(cartao ? `/cartoes/${cartao.id}` : '/cartoes', {
        metodo: cartao ? 'PUT' : 'POST',
        corpo: {
          nome,
          limite_centavos: limite ?? 0,
          dia_fechamento: Number(fechamento),
          dia_vencimento: Number(vencimento),
          conta_pagamento_id: contaId ? Number(contaId) : null,
          arquivado: cartao?.arquivado ?? false,
        },
      }),
    onSuccess: async () => {
      await invalidar();
      aoConcluir();
    },
  });
  const campos = salvar.error instanceof ErroApi ? (salvar.error.campos ?? {}) : {};
  const geral = salvar.error && !(salvar.error instanceof ErroApi && salvar.error.campos) ? salvar.error.message : null;

  return (
    <form
      noValidate
      className="max-w-md space-y-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{cartao ? 'Editar cartão' : 'Novo cartão'}</h2>
      <Campo id="cartao-nome" rotulo="Nome" erro={campos.nome}>
        <Input id="cartao-nome" value={nome} maxLength={60} autoFocus onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <CampoValor id="cartao-limite" rotulo="Limite" inicial={cartao?.limite.limite_centavos ?? null} aoMudar={setLimite} erro={campos.limite_centavos} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="cartao-fechamento" rotulo="Dia do fechamento" erro={campos.dia_fechamento}>
          <Input id="cartao-fechamento" type="number" inputMode="numeric" min={1} max={28} value={fechamento} onChange={(e) => setFechamento(e.target.value)} />
        </Campo>
        <Campo id="cartao-vencimento" rotulo="Dia do vencimento" erro={campos.dia_vencimento}>
          <Input id="cartao-vencimento" type="number" inputMode="numeric" min={1} max={28} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Campo>
      </div>
      <p className="text-sm text-muted-foreground">
        Os dias vão de 1 a 28, para existirem em todos os meses. Mudar o fechamento só vale para as faturas novas.
      </p>
      <Campo id="cartao-conta" rotulo="Conta que paga a fatura (padrão)">
        <Select id="cartao-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
          <option value="">Escolher na hora de pagar</option>
          {contas
            .filter((c) => !c.arquivada || String(c.id) === contaId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </Select>
      </Campo>
      {geral ? <p role="alert" className="text-sm font-medium text-destructive">{geral}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending || !nome.trim() || limite == null || !fechamento || !vencimento}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={aoConcluir}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ItemCartao({ cartao, aoEditar }: { cartao: Cartao; aoEditar: (c: Cartao) => void }) {
  const invalidar = useInvalidarDados();
  const arquivar = useMutation({
    mutationFn: () => api(`/cartoes/${cartao.id}`, { metodo: 'PUT', corpo: corpoDe(cartao, { arquivado: !cartao.arquivado }) }),
    onSuccess: invalidar,
  });
  const excluir = useMutation({
    mutationFn: () => api(`/cartoes/${cartao.id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
  const atual = cartao.fatura_atual;

  return (
    <li className={`space-y-3 rounded-lg border bg-card p-4 ${cartao.arquivado ? 'opacity-70' : ''}`}>
      <div>
        <strong>{cartao.nome}</strong>
        <p className="text-sm text-muted-foreground">
          Fecha dia {cartao.dia_fechamento} · vence dia {cartao.dia_vencimento}
          {cartao.arquivado ? <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs">Arquivado</span> : null}
        </p>
      </div>

      <Limite limite={cartao.limite} />

      <div className="flex items-start justify-between gap-3 border-t pt-3">
        <div>
          <strong>{rotuloFatura(cartao.ciclo_atual.referencia)}</strong>
          <p className="text-sm text-muted-foreground">
            Fecha em {formatarData(cartao.ciclo_atual.data_fechamento)} · vence em {formatarData(cartao.ciclo_atual.data_vencimento)}
          </p>
        </div>
        <div className="text-right">
          {atual ? (
            <>
              <Valor centavos={atual.total_centavos} tipo="saida" />
              <p>
                <StatusFatura status={atual.status} />
              </p>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Sem compras</span>
          )}
        </div>
      </div>

      <ErroDeAcao erro={arquivar.error ?? excluir.error} />
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to={`/app/cartoes/${cartao.id}`}>Faturas e compras</Link>
        </Button>
        {!cartao.arquivado ? (
          <Button asChild variant="outline">
            <Link to={`/app/cartoes/compras/nova?cartao=${cartao.id}`}>Nova compra</Link>
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => aoEditar(cartao)}>
          Editar
        </Button>
        <Button variant="outline" disabled={arquivar.isPending} onClick={() => arquivar.mutate()}>
          {cartao.arquivado ? 'Reativar' : 'Arquivar'}
        </Button>
        <BotaoExcluir aoConfirmar={() => excluir.mutate()} pendente={excluir.isPending} />
      </div>
    </li>
  );
}

export default function Cartoes() {
  const cartoes = useCartoes();
  const contas = useContas();
  const [editando, setEditando] = useState<'novo' | Cartao | null>(null);

  const erro = cartoes.error ?? contas.error;
  if (erro) return <ErroDeTela erro={erro} aoTentar={() => void cartoes.refetch()} />;
  if (!cartoes.data || !contas.data) return <Carregando />;

  return (
    <Pagina titulo="Cartões" acao={editando ? null : <Button onClick={() => setEditando('novo')}>Novo cartão</Button>}>
      {editando ? (
        <FormularioCartao
          key={editando === 'novo' ? 'novo' : editando.id}
          cartao={editando === 'novo' ? null : editando}
          contas={contas.data.itens}
          aoConcluir={() => setEditando(null)}
        />
      ) : null}

      {cartoes.data.itens.length === 0 && !editando ? (
        <Vazio titulo="Nenhum cartão ainda.">
          Cadastre o limite e os dias de fechamento e vencimento para lançar compras e acompanhar as faturas.
        </Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {cartoes.data.itens.map((c) => (
            <ItemCartao key={c.id} cartao={c} aoEditar={setEditando} />
          ))}
        </ul>
      )}
    </Pagina>
  );
}
