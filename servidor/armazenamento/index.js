// Armazenamento dos comprovantes (ADR 013). O arquivo NÃO fica no banco: vai para um bucket privado do Supabase
// Storage, acessado só pelo servidor com a service key (nunca no navegador, nunca em variável `VITE_`). O download
// passa pela API, que confere o dono antes de buscar o objeto.
//
// Interface (a mesma nas duas versões):
//   guardar(caminho, conteudo: Buffer, tipoMime)  -> void   (erro se o caminho já existir)
//   ler(caminho)                                   -> Buffer | null
//   apagar(caminho)                                -> void   (apagar o que não existe não é erro)
//
// `criarArmazenamentoSupabase` usa a API REST do Storage por `fetch` (sem @supabase/supabase-js). A versão em
// memória serve aos testes e ao desenvolvimento local com PGlite.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export const BUCKET_DE_COMPROVANTES = 'comprovantes';
const TEMPO_LIMITE_MS = 20_000;

const caminhoNaUrl = (caminho) => caminho.split('/').map(encodeURIComponent).join('/');

export function criarArmazenamentoSupabase({ url, chave, bucket = BUCKET_DE_COMPROVANTES, buscar = fetch }) {
  if (!url || !chave) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias para guardar comprovantes.');
  const base = `${url.replace(/\/+$/, '')}/storage/v1/object`;
  const cabecalhos = { Authorization: `Bearer ${chave}`, apikey: chave };

  const chamar = (endereco, opcoes) =>
    buscar(endereco, { ...opcoes, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) }).catch((erro) => {
      // A mensagem do `fetch` pode trazer o endereço; o log não leva a chave, que só vai no cabeçalho.
      throw new Error(`Falha ao falar com o armazenamento de arquivos: ${erro.name}`);
    });

  return {
    async guardar(caminho, conteudo, tipoMime) {
      const res = await chamar(`${base}/${bucket}/${caminhoNaUrl(caminho)}`, {
        method: 'POST',
        headers: { ...cabecalhos, 'Content-Type': tipoMime, 'x-upsert': 'false' },
        body: conteudo,
      });
      if (!res.ok) throw new Error(`O armazenamento recusou o arquivo (HTTP ${res.status}).`);
    },
    async ler(caminho) {
      const res = await chamar(`${base}/authenticated/${bucket}/${caminhoNaUrl(caminho)}`, { headers: cabecalhos });
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`O armazenamento não entregou o arquivo (HTTP ${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    },
    async apagar(caminho) {
      const res = await chamar(`${base}/${bucket}/${caminhoNaUrl(caminho)}`, { method: 'DELETE', headers: cabecalhos });
      if (!res.ok && res.status !== 400 && res.status !== 404) {
        throw new Error(`O armazenamento não apagou o arquivo (HTTP ${res.status}).`);
      }
    },
  };
}

/**
 * Desenvolvimento local sem Supabase: os arquivos ficam numa pasta (`data/anexos`), no mesmo desenho de
 * caminhos (`<usuario_id>/<uuid>`). Não serve à produção: o disco da função do Netlify não persiste.
 */
export function criarArmazenamentoPasta(pasta) {
  const alvo = (caminho) => {
    const completo = resolve(pasta, caminho);
    // O caminho vem do banco, mas a defesa é barata: nada fora da pasta.
    if (!completo.startsWith(resolve(pasta) + sep)) throw new Error('Caminho inválido.');
    return completo;
  };
  return {
    async guardar(caminho, conteudo) {
      const destino = alvo(caminho);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, conteudo, { flag: 'wx' });
    },
    async ler(caminho) {
      try {
        return await readFile(alvo(caminho));
      } catch (erro) {
        if (erro.code === 'ENOENT') return null;
        throw erro;
      }
    },
    async apagar(caminho) {
      await rm(alvo(caminho), { force: true });
    },
  };
}

export function criarArmazenamentoMemoria() {
  const objetos = new Map();
  return {
    async guardar(caminho, conteudo) {
      if (objetos.has(caminho)) throw new Error('Já existe um arquivo nesse caminho.');
      objetos.set(caminho, Buffer.from(conteudo));
    },
    async ler(caminho) {
      return objetos.get(caminho) ?? null;
    },
    async apagar(caminho) {
      objetos.delete(caminho);
    },
    /** Só para testes: caminhos existentes. */
    caminhos: () => [...objetos.keys()],
  };
}
