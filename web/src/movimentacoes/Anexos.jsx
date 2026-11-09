import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EXTENSOES_DE_ANEXO, MAXIMO_DE_ANEXOS_POR_LANCAMENTO, TAMANHO_MAXIMO_ANEXO } from '../../../contratos/anexos.js';
import { api, enviarArquivo } from '../compartilhado/api.js';
import { formatarDataHora } from '../compartilhado/datas.js';

const tamanhoLegivel = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function Anexos({ fuso }) {
  const { id } = useParams();
  const cliente = useQueryClient();
  const campo = useRef(null);
  const [erroLocal, setErroLocal] = useState(null);
  const consulta = useQuery({ queryKey: ['anexos', id], queryFn: () => api(`/movimentacoes/${id}/anexos`) });
  const recarregar = () => cliente.invalidateQueries({ queryKey: ['anexos', id] });

  const enviar = useMutation({
    mutationFn: (arquivo) =>
      enviarArquivo(`/movimentacoes/${id}/anexos`, arquivo, {
        'x-nome-arquivo': encodeURIComponent(arquivo.name),
        'content-type': arquivo.type || 'application/octet-stream',
      }),
    onSuccess: recarregar,
  });
  const remover = useMutation({
    mutationFn: (anexoId) => api(`/anexos/${anexoId}`, { metodo: 'DELETE' }),
    onSuccess: recarregar,
  });
  const [removendo, setRemovendo] = useState(null);

  function escolher(evento) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    setErroLocal(null);
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO) {
      setErroLocal(`Arquivo grande demais (máx. ${TAMANHO_MAXIMO_ANEXO / 1024 / 1024} MB).`);
      return;
    }
    enviar.mutate(arquivo);
  }

  if (consulta.isPending) return <p className="carregando">Carregando…</p>;
  if (consulta.error) return <p className="erro">{consulta.error.message}</p>;
  const itens = consulta.data.itens;
  const cheio = itens.length >= MAXIMO_DE_ANEXOS_POR_LANCAMENTO;
  const erroEnvio = erroLocal ?? enviar.error?.campos?.arquivo ?? enviar.error?.message;

  return (
    <section>
      <div className="titulo-com-acao">
        <h1>Comprovantes do lançamento</h1>
        <Link className="botao" to="/lancamentos">Voltar</Link>
      </div>
      <p className="suave pequeno">
        PDF, PNG, JPG ou WEBP, até {TAMANHO_MAXIMO_ANEXO / 1024 / 1024} MB cada e {MAXIMO_DE_ANEXOS_POR_LANCAMENTO} por lançamento. O arquivo
        fica só neste computador, dentro do banco de dados, e vai junto no backup.
      </p>

      <div className="cartao">
        <label className="botao-primario" htmlFor="anexo-arquivo" aria-disabled={cheio || enviar.isPending}>
          {enviar.isPending ? 'Enviando…' : 'Anexar comprovante'}
        </label>
        <input
          id="anexo-arquivo"
          ref={campo}
          type="file"
          className="campo-arquivo"
          accept={EXTENSOES_DE_ANEXO}
          disabled={cheio || enviar.isPending}
          onChange={escolher}
        />
        {cheio && <p className="suave pequeno">Limite de anexos atingido. Remova algum para anexar outro.</p>}
        {erroEnvio && <p role="alert" className="erro">{erroEnvio}</p>}
      </div>

      {itens.length === 0 ? (
        <div className="cartao vazio">
          <p>Nenhum comprovante anexado.</p>
          <p className="suave">Guarde aqui a foto da nota, o recibo ou o PDF do boleto pago.</p>
        </div>
      ) : (
        <ul className="lista-limpa">
          {itens.map((a) => (
            <li key={a.id} className="cartao">
              <div className="item-topo">
                <strong>{a.nome}</strong>
                <span className="suave pequeno">{tamanhoLegivel(a.tamanho_bytes)}</span>
              </div>
              <p className="suave pequeno">Anexado em {formatarDataHora(a.criado_em, fuso)}</p>
              {a.tipo_mime.startsWith('image/') && (
                <img className="miniatura-anexo" src={`/api/anexos/${a.id}/arquivo`} alt={`Comprovante ${a.nome}`} loading="lazy" />
              )}
              <div className="acoes acoes-compactas">
                <a className="botao" href={`/api/anexos/${a.id}/arquivo`} target="_blank" rel="noreferrer">
                  {a.tipo_mime.startsWith('image/') ? 'Abrir' : 'Baixar'}
                </a>
                {removendo === a.id ? (
                  <button type="button" className="botao perigo" onClick={() => { remover.mutate(a.id); setRemovendo(null); }} disabled={remover.isPending}>
                    Confirmar remoção
                  </button>
                ) : (
                  <button type="button" className="botao" onClick={() => setRemovendo(a.id)}>Remover</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {remover.error && <p role="alert" className="erro">{remover.error.message}</p>}
    </section>
  );
}
