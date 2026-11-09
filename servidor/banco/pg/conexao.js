// Banco de produção: Postgres do Supabase pelo pooler em modo transação (porta 6543), com a biblioteca
// `postgres` (porsager). Duas exigências do pooler: prepared statements desligados (`prepare: false`) e nada
// de estado de sessão entre comandos (por isso as transações usam sql.begin). Mesma interface do PGlite
// (pglite.js): consultar, executar, transacao e fechar.
import postgres from 'postgres';
import { tiposDoDriver } from './tipos.js';

function envolver(alvo) {
  return {
    async consultar(texto, params = []) {
      return [...(await alvo.unsafe(texto, params))];
    },
    async executar(script) {
      await alvo.unsafe(script);
    },
  };
}

/**
 * Uma conexão por instância da função (`max: 1`): cada invocação do Netlify é um processo curto e o pooler
 * é quem multiplexa. `url` é a DATABASE_URL; ela nunca vai para o navegador nem para variável VITE_.
 */
export function abrirBanco(url, opcoes = {}) {
  if (!url) throw new Error('DATABASE_URL não está definida.');
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    types: tiposDoDriver,
    onnotice: () => {},
    ...opcoes,
  });
  return {
    ...envolver(sql),
    transacao: (fn) => sql.begin((tx) => fn(envolver(tx))),
    fechar: () => sql.end({ timeout: 5 }),
  };
}
