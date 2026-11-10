import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Campo } from '@/components/Campo';
import { CampoValor } from '@/components/CampoValor';
import { Carregando, ErroDeTela } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ErroApi } from '@/lib/api';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados, type Categoria, type Conta } from '@/lib/dados';
import { hojeIso } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';

function Formulario({ contas, categorias, fuso }: { contas: Conta[]; categorias: Categoria[]; fuso: string | undefined }) {
  const navegar = useNavigate();
  const invalidar = useInvalidarDados();
  const [nome, setNome] = useState('');
  const [credor, setCredor] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [parcelas, setParcelas] = useState('12');
  const [vencimento, setVencimento] = useState(hojeIso(fuso));
  const [contaId, setContaId] = useState(String(contas.find((c) => !c.arquivada)?.id ?? ''));
  const [categoriaId, setCategoriaId] = useState('');
  const [observacao, setObservacao] = useState('');

  const mapa = porId(categorias);
  const opcoesCategoria = categorias
    .filter((c) => c.tipo === 'despesa' && c.papel == null && !c.arquivada)
    .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const salvar = useMutation({
    mutationFn: () =>
      api<{ id: number }>('/dividas', {
        metodo: 'POST',
        corpo: {
          nome,
          credor,
          valor_total_centavos: valor ?? 0,
          parcelas_total: Number(parcelas),
          primeiro_vencimento: vencimento,
          conta_id: Number(contaId),
          categoria_id: categoriaId ? Number(categoriaId) : null,
          observacao,
        },
      }),
    onSuccess: async (criada) => {
      await invalidar();
      navegar(`/app/dividas/${criada.id}`);
    },
  });
  const campos = salvar.error instanceof ErroApi ? (salvar.error.campos ?? {}) : {};
  const geral = salvar.error && !(salvar.error instanceof ErroApi && salvar.error.campos) ? salvar.error.message : null;

  return (
    <Pagina titulo="Nova dívida">
      <form
        noValidate
        className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <Campo id="div-nome" rotulo="Nome" erro={campos.nome}>
          <Input id="div-nome" value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo id="div-credor" rotulo="Credor (opcional)" erro={campos.credor}>
          <Input id="div-credor" value={credor} maxLength={120} onChange={(e) => setCredor(e.target.value)} />
        </Campo>
        <CampoValor id="div-valor" rotulo="Valor total a pagar" aoMudar={setValor} erro={campos.valor_total_centavos} />
        <p className="text-sm text-muted-foreground">
          Some todas as parcelas, com juros. Se não couber em centavos redondos, a primeira parcela fica com a sobra.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="div-parcelas" rotulo="Parcelas" erro={campos.parcelas_total}>
            <Input id="div-parcelas" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, ''))} />
          </Campo>
          <Campo id="div-vencimento" rotulo="Vencimento da primeira" erro={campos.primeiro_vencimento}>
            <Input id="div-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Campo>
        </div>
        {vencimento < hojeIso(fuso) ? (
          <p className="text-sm text-muted-foreground">
            A primeira parcela já venceu: as parcelas até hoje entram como atrasadas, para você dar baixa. Se parte já foi paga,
            informe só o que falta e a data da próxima parcela.
          </p>
        ) : null}
        <Campo id="div-conta" rotulo="Conta de onde as parcelas saem" erro={campos.conta_id}>
          <Select id="div-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas
              .filter((c) => !c.arquivada)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Select>
        </Campo>
        <Campo id="div-categoria" rotulo="Categoria" erro={campos.categoria_id}>
          <Select id="div-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {opcoesCategoria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="div-obs" rotulo="Observação" erro={campos.observacao}>
          <Textarea id="div-obs" rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Campo>
        {geral ? <p role="alert" className="text-sm font-medium text-destructive">{geral}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvar.isPending || !nome.trim() || valor == null || valor === 0 || !parcelas || !contaId}>
            Criar dívida e parcelas
          </Button>
          <Button asChild variant="ghost">
            <Link to="/app/dividas">Cancelar</Link>
          </Button>
        </div>
      </form>
    </Pagina>
  );
}

export default function FormularioDivida() {
  const { sessao } = useSessao();
  const contas = useContas();
  const categorias = useCategorias();
  const erro = contas.error ?? categorias.error;
  if (erro) return <ErroDeTela erro={erro} />;
  if (!contas.data || !categorias.data) return <Carregando />;
  if (contas.data.itens.filter((c) => !c.arquivada).length === 0) {
    return (
      <Pagina titulo="Nova dívida">
        <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
          <p>Para cadastrar uma dívida, crie uma conta.</p>
          <Button asChild>
            <Link to="/app/contas">Ir para Contas</Link>
          </Button>
        </div>
      </Pagina>
    );
  }
  return <Formulario contas={contas.data.itens} categorias={categorias.data.itens} fuso={sessao?.fuso} />;
}
