import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MAXIMO_DE_TRANSACOES_OFX, TAMANHO_MAXIMO_OFX } from '../../../../contratos/importacao.js';
import { Campo } from '@/components/Campo';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Valor } from '@/components/Valor';
import { api, enviarArquivo, ErroApi } from '@/lib/api';
import { porId, rotuloCategoria, useCategorias, useContas, useInvalidarDados } from '@/lib/dados';
import { formatarData } from '@/lib/datas';

type Situacao = 'nova' | 'ja_importada' | 'possivel_duplicidade';

interface ItemDaPrevia {
  fitid: string;
  data: string;
  valor_centavos: number;
  descricao: string;
  situacao: Situacao;
}

interface Previa {
  itens: ItemDaPrevia[];
  invalidas: { indice: number; motivo: string }[];
  resumo: { total: number; novas: number; ja_importadas: number; possiveis_duplicidades: number };
}

interface Resultado {
  importadas: number;
  ignoradas: number;
  avisos_de_duplicidade: number;
}

const ROTULO_SITUACAO: Record<Situacao, string> = {
  nova: 'Nova',
  ja_importada: 'Já importada',
  possivel_duplicidade: 'Possível duplicidade',
};

const MEGA = 1024 * 1024;

export default function ImportarOfx() {
  const invalidar = useInvalidarDados();
  const contas = useContas();
  const categorias = useCategorias();
  const campo = useRef<HTMLInputElement>(null);
  const [contaId, setContaId] = useState('');
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [categoriaDe, setCategoriaDe] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const ler = useMutation({
    mutationFn: ({ arquivo, conta }: { arquivo: File; conta: string }) =>
      enviarArquivo<Previa>(`/importacao/ofx/previa?conta_id=${conta}`, arquivo, { 'content-type': 'application/x-ofx' }),
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
      api<Resultado>('/importacao/ofx/confirmar', {
        metodo: 'POST',
        corpo: {
          conta_id: Number(contaId),
          itens: (previa?.itens ?? [])
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

  const erroBase = contas.error ?? categorias.error;
  if (erroBase) return <ErroDeTela erro={erroBase} />;
  if (!contas.data || !categorias.data) return <Carregando />;

  const ativas = contas.data.itens.filter((c) => !c.arquivada);
  const mapa = porId(categorias.data.itens);
  const opcoes = (tipo: 'receita' | 'despesa') =>
    categorias.data.itens
      .filter((c) => c.tipo === tipo && c.papel == null && !c.arquivada)
      .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, mapa) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  function escolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    setErroLocal(null);
    setPrevia(null);
    setResultado(null);
    if (!arquivo) return;
    if (!contaId) return setErroLocal('Escolha a conta antes de enviar o arquivo.');
    if (arquivo.size > TAMANHO_MAXIMO_OFX) return setErroLocal(`Arquivo grande demais (máx. ${TAMANHO_MAXIMO_OFX / MEGA} MB).`);
    ler.mutate({ arquivo, conta: contaId });
  }

  function alternar(fitid: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(fitid)) novo.delete(fitid);
      else novo.add(fitid);
      return novo;
    });
  }

  const erroLeitura =
    erroLocal ?? (ler.error instanceof ErroApi ? (ler.error.campos?.arquivo ?? ler.error.campos?.conta_id ?? ler.error.message) : (ler.error?.message ?? null));

  if (ativas.length === 0) {
    return (
      <Pagina titulo="Importar extrato">
        <Vazio titulo="Crie uma conta antes de importar um extrato.">
          <Button asChild>
            <Link to="/app/contas">Criar conta</Link>
          </Button>
        </Vazio>
      </Pagina>
    );
  }

  return (
    <Pagina titulo="Importar extrato">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Baixe o extrato do seu banco no formato OFX e escolha o arquivo aqui. Primeiro você confere a lista; só depois os lançamentos são criados, já
        liquidados. O mesmo extrato nunca entra duas vezes. Só extrato em reais (BRL), até {MAXIMO_DE_TRANSACOES_OFX} transações por vez.
      </p>

      <div className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
        <Campo id="ofx-conta" rotulo="Conta que recebe os lançamentos">
          <Select
            id="ofx-conta"
            value={contaId}
            onChange={(e) => {
              setContaId(e.target.value);
              setPrevia(null);
            }}
          >
            <option value="">Escolha a conta</option>
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <Button disabled={ler.isPending} onClick={() => campo.current?.click()}>
          {ler.isPending ? 'Lendo…' : 'Escolher arquivo OFX'}
        </Button>
        <input ref={campo} type="file" className="sr-only" tabIndex={-1} aria-label="Arquivo OFX" accept=".ofx,.OFX" disabled={ler.isPending} onChange={escolherArquivo} />
        {erroLeitura ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erroLeitura}
          </p>
        ) : null}
      </div>

      {resultado ? (
        <div className="max-w-xl space-y-2 rounded-lg border bg-card p-4" role="status">
          <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Importação concluída</h2>
          <p>
            {resultado.importadas} {resultado.importadas === 1 ? 'lançamento criado' : 'lançamentos criados'}.
          </p>
          {resultado.ignoradas > 0 ? <p className="text-sm text-muted-foreground">{resultado.ignoradas} já tinham sido importadas e foram ignoradas.</p> : null}
          {resultado.avisos_de_duplicidade > 0 ? (
            <p className="text-sm text-muted-foreground">{resultado.avisos_de_duplicidade} parecem repetir um lançamento que já existia. Confira na lista.</p>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/app/lancamentos">Ver lançamentos</Link>
          </Button>
        </div>
      ) : null}

      {previa ? (
        <>
          <div className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
            <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Conferir antes de importar</h2>
            <p>
              {previa.resumo.total} {previa.resumo.total === 1 ? 'transação' : 'transações'}: {previa.resumo.novas} nova(s), {previa.resumo.ja_importadas}{' '}
              já importada(s), {previa.resumo.possiveis_duplicidades} possível(is) duplicidade(s).
            </p>
            {previa.invalidas.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {previa.invalidas.length} linha(s) do arquivo foram ignoradas por problema:{' '}
                {previa.invalidas
                  .slice(0, 3)
                  .map((i) => `#${i.indice} ${i.motivo}`)
                  .join(' ')}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">Possível duplicidade vem desmarcada: ela tem o mesmo valor, data, conta e descrição de um lançamento seu.</p>
          </div>

          {previa.itens.length === 0 ? (
            <Vazio titulo="Nenhuma transação válida no arquivo." />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {previa.itens.map((i) => {
                const ehReceita = i.valor_centavos > 0;
                const bloqueada = i.situacao === 'ja_importada';
                return (
                  <li key={i.fitid} className="space-y-2 rounded-lg border bg-card p-4">
                    <label className="flex min-h-11 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-5 accent-primary"
                        checked={marcadas.has(i.fitid)}
                        disabled={bloqueada}
                        onChange={() => alternar(i.fitid)}
                      />
                      <span>
                        <strong>{i.descricao || 'Sem descrição'}</strong>
                        <span className="text-sm text-muted-foreground"> · {formatarData(i.data)}</span>
                      </span>
                    </label>
                    <p className="flex flex-wrap items-center gap-2">
                      <Valor centavos={Math.abs(i.valor_centavos)} tipo={ehReceita ? 'entrada' : 'saida'} />
                      <span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${i.situacao === 'nova' ? 'bg-muted' : 'bg-aviso text-background'}`}>
                        {ROTULO_SITUACAO[i.situacao]}
                      </span>
                    </p>
                    {!bloqueada ? (
                      <Campo id={`cat-${i.fitid}`} rotulo={`Categoria (${ehReceita ? 'receita' : 'despesa'})`}>
                        <Select id={`cat-${i.fitid}`} value={categoriaDe[i.fitid] ?? ''} onChange={(e) => setCategoriaDe({ ...categoriaDe, [i.fitid]: e.target.value })}>
                          <option value="">Sem categoria</option>
                          {opcoes(ehReceita ? 'receita' : 'despesa').map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.rotulo}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <ErroDeAcao erro={confirmar.error} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={confirmar.isPending || marcadas.size === 0} onClick={() => confirmar.mutate()}>
              Importar {marcadas.size} {marcadas.size === 1 ? 'transação' : 'transações'}
            </Button>
            <Button variant="ghost" onClick={() => setPrevia(null)}>
              Cancelar
            </Button>
          </div>
        </>
      ) : null}
    </Pagina>
  );
}
