// Escopo de dados de UM usuário (ADR 013). Todo repositório recebe um escopo no lugar do banco: é ele que sabe
// de quem são os dados. Convenção do SQL escrito à mão:
//   `?`   parâmetro comum, na ordem em que aparece;
//   `:u`  o id do usuário do escopo. TODA consulta de dado de usuário precisa de `usuario_id = :u`
//         (tests/isolamento-*.test.js confere, rota a rota, que nada de outra conta aparece nem é alterado).
// Os `?` e `:u` viram $1, $2... na ordem em que aparecem, então não há numeração para errar.
//   todos(sql, params)   -> linhas
//   um(sql, params)      -> primeira linha ou undefined
//   rodar(sql, params)   -> linhas (use RETURNING para saber o que foi gravado)
//   transacao(fn)        -> fn(escopo); aninhada vira SAVEPOINT (erro desfaz só a parte interna)

const MARCADORES = /\?|(?<!:):u\b/g;

export function traduzir(sql, params, usuarioId) {
  const saida = [];
  let usados = 0;
  const texto = sql.replace(MARCADORES, (m) => {
    if (m === '?') {
      if (usados >= params.length) throw new Error(`SQL pede mais parâmetros do que os ${params.length} recebidos.`);
      const v = params[usados++];
      saida.push(v === undefined ? null : v);
    } else {
      saida.push(usuarioId);
    }
    return `$${saida.length}`;
  });
  if (usados !== params.length) throw new Error(`SQL usa ${usados} parâmetros e recebeu ${params.length}.`);
  return [texto, saida];
}

let contadorDeSavepoint = 0;

function montar(alvo, usuarioId, aninhado) {
  const rodar = (sql, params = []) => {
    const [texto, valores] = traduzir(sql, params, usuarioId);
    return alvo.consultar(texto, valores);
  };
  return {
    usuarioId,
    todos: rodar,
    rodar,
    um: async (sql, params = []) => (await rodar(sql, params))[0],
    async transacao(fn) {
      if (!aninhado) return alvo.transacao((tx) => fn(montar(tx, usuarioId, true)));
      const ponto = `sp_${++contadorDeSavepoint}`;
      await alvo.consultar(`SAVEPOINT ${ponto}`);
      try {
        const resultado = await fn(montar(alvo, usuarioId, true));
        await alvo.consultar(`RELEASE SAVEPOINT ${ponto}`);
        return resultado;
      } catch (erro) {
        await alvo.consultar(`ROLLBACK TO SAVEPOINT ${ponto}`);
        throw erro;
      }
    },
  };
}

/**
 * `alvo` é o adaptador de conexao.js ou pglite.js. Dentro de uma transação já aberta (o `tx` do adaptador, que não
 * tem `transacao`), passe `emTransacao: true`: as transações do escopo viram SAVEPOINT.
 */
export function criarEscopo(alvo, usuarioId, { emTransacao = false } = {}) {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) throw new Error('Escopo sem usuário válido.');
  return montar(alvo, usuarioId, emTransacao);
}
