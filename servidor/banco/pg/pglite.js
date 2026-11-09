// Banco local e de teste: PGlite (Postgres em WASM, sem Docker). Mesma interface do driver de produção
// (conexao.js), então o código de dados não sabe qual está por baixo.
//   consultar(texto, params) -> linhas      $1, $2... como no Postgres
//   executar(script)         -> void        vários comandos, sem parâmetros (migrations)
//   transacao(fn)            -> o que fn devolver; `tx` tem consultar e executar; erro desfaz tudo
//   fechar()
// JSON: quem grava jsonb passa JSON.stringify(valor) e escreve `$n::text::jsonb` no SQL (vale nos dois drivers;
// `$n::jsonb` direto faz o driver de produção serializar o texto de novo).
import { PGlite } from '@electric-sql/pglite';
import { parsersDoPglite } from './tipos.js';

function envolver(alvo) {
  return {
    async consultar(texto, params = []) {
      return (await alvo.query(texto, params)).rows;
    },
    async executar(script) {
      await alvo.exec(script);
    },
  };
}

/** `pasta` indefinida = em memória (testes). Com pasta, os dados ficam em disco (npm run dev). */
export async function abrirBancoLocal(pasta) {
  const db = await PGlite.create({ ...(pasta ? { dataDir: pasta } : {}), parsers: parsersDoPglite });
  return {
    ...envolver(db),
    transacao: (fn) => db.transaction((tx) => fn(envolver(tx))),
    fechar: () => db.close(),
  };
}
