import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EXTENSOES_DE_ANEXO, MAXIMO_DE_ANEXOS_POR_LANCAMENTO, TAMANHO_MAXIMO_ANEXO } from '../../../../contratos/anexos.js';
import { BotaoExcluir } from '@/components/BotaoExcluir';
import { Carregando, ErroDeAcao, ErroDeTela, Vazio } from '@/components/Estados';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { api, enviarArquivo, ErroApi } from '@/lib/api';
import { formatarDataHora } from '@/lib/datas';
import { useSessao } from '@/lib/sessao';

interface Anexo {
  id: number;
  nome: string;
  tipo_mime: string;
  tamanho_bytes: number;
  criado_em: string;
}

const MEGA = 1024 * 1024;
const tamanhoLegivel = (bytes: number) => (bytes >= MEGA ? `${(bytes / MEGA).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function Item({ anexo, aoMudar, fuso }: { anexo: Anexo; aoMudar: () => Promise<void>; fuso: string | undefined }) {
  const remover = useMutation({ mutationFn: () => api(`/anexos/${anexo.id}`, { metodo: 'DELETE' }), onSuccess: aoMudar });
  const imagem = anexo.tipo_mime.startsWith('image/');
  const endereco = `/api/anexos/${anexo.id}/arquivo`;
  return (
    <li className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="break-all">{anexo.nome}</strong>
        <span className="text-sm text-muted-foreground">{tamanhoLegivel(anexo.tamanho_bytes)}</span>
      </div>
      <p className="text-sm text-muted-foreground">Anexado em {formatarDataHora(anexo.criado_em, fuso)}</p>
      {imagem ? <img className="max-h-48 rounded-md border object-contain" src={endereco} alt={`Comprovante ${anexo.nome}`} loading="lazy" /> : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={endereco} target="_blank" rel="noreferrer">
            {imagem ? 'Abrir' : 'Baixar'}
          </a>
        </Button>
        <BotaoExcluir rotulo="Remover" rotuloDeConfirmacao="Confirmar remoção" aoConfirmar={() => remover.mutate()} pendente={remover.isPending} />
      </div>
      <ErroDeAcao erro={remover.error} />
    </li>
  );
}

export default function Anexos() {
  const { id } = useParams();
  const { sessao } = useSessao();
  const cliente = useQueryClient();
  const campo = useRef<HTMLInputElement>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const consulta = useQuery({ queryKey: ['anexos', id], queryFn: () => api<{ itens: Anexo[] }>(`/movimentacoes/${id}/anexos`) });
  const recarregar = () => cliente.invalidateQueries({ queryKey: ['anexos', id] });

  const enviar = useMutation({
    mutationFn: (arquivo: File) =>
      enviarArquivo(`/movimentacoes/${id}/anexos`, arquivo, {
        'x-nome-arquivo': encodeURIComponent(arquivo.name),
        'content-type': arquivo.type || 'application/octet-stream',
      }),
    onSuccess: recarregar,
  });

  function escolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    setErroLocal(null);
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO) {
      setErroLocal(`Arquivo grande demais (máx. ${TAMANHO_MAXIMO_ANEXO / MEGA} MB).`);
      return;
    }
    enviar.mutate(arquivo);
  }

  if (consulta.error) return <ErroDeTela erro={consulta.error} aoTentar={() => void consulta.refetch()} />;
  if (!consulta.data) return <Carregando />;
  const itens = consulta.data.itens;
  const cheio = itens.length >= MAXIMO_DE_ANEXOS_POR_LANCAMENTO;
  const erroEnvio = erroLocal ?? (enviar.error instanceof ErroApi ? (enviar.error.campos?.arquivo ?? enviar.error.message) : (enviar.error?.message ?? null));

  return (
    <Pagina
      titulo="Comprovantes do lançamento"
      acao={
        <Button asChild variant="outline">
          <Link to="/app/lancamentos">Voltar</Link>
        </Button>
      }
    >
      <p className="max-w-2xl text-sm text-muted-foreground">
        PDF, PNG, JPG ou WEBP, até {TAMANHO_MAXIMO_ANEXO / MEGA} MB cada e {MAXIMO_DE_ANEXOS_POR_LANCAMENTO} por lançamento. O arquivo fica guardado em
        armazenamento privado da sua conta e só você consegue abrir.
      </p>

      <div className="max-w-xl space-y-2 rounded-lg border bg-card p-4">
        <Button disabled={cheio || enviar.isPending} onClick={() => campo.current?.click()}>
          {enviar.isPending ? 'Enviando…' : 'Anexar comprovante'}
        </Button>
        <input
          ref={campo}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label="Arquivo do comprovante"
          accept={EXTENSOES_DE_ANEXO}
          disabled={cheio || enviar.isPending}
          onChange={escolher}
        />
        {cheio ? <p className="text-sm text-muted-foreground">Limite de anexos atingido. Remova algum para anexar outro.</p> : null}
        {erroEnvio ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erroEnvio}
          </p>
        ) : null}
      </div>

      {itens.length === 0 ? (
        <Vazio titulo="Nenhum comprovante anexado.">Guarde aqui a foto da nota, o recibo ou o PDF do boleto pago.</Vazio>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {itens.map((a) => (
            <Item key={a.id} anexo={a} aoMudar={recarregar} fuso={sessao?.fuso} />
          ))}
        </ul>
      )}
    </Pagina>
  );
}
