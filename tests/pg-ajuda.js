import { abrirBancoLocal } from '../servidor/banco/pg/pglite.js';
import { migrar } from '../servidor/banco/pg/migrar.js';

/** Banco PGlite em memória, já com todas as migrations. Feche com `await banco.fechar()`. */
export async function bancoPgDeTeste() {
  const banco = await abrirBancoLocal();
  await migrar(banco);
  return banco;
}

export const AGORA = '2026-06-15T15:00:00.000Z';

/** Cria um usuário fictício e devolve o id. */
export async function novoUsuario(banco, nome) {
  const [linha] = await banco.consultar(
    `INSERT INTO usuarios (nome_usuario, senha_hash, criado_em, atualizado_em) VALUES ($1, 'hash-de-teste', $2, $2) RETURNING id`,
    [nome, AGORA],
  );
  return linha.id;
}

/** Cria uma conta fictícia do usuário e devolve o id. */
export async function novaContaPg(banco, usuarioId, nome = 'Conta A', saldoInicial = 0) {
  const [linha] = await banco.consultar(
    `INSERT INTO contas (usuario_id, nome, tipo, saldo_inicial_centavos, criada_em, atualizada_em)
     VALUES ($1, $2, 'corrente', $3, $4, $4) RETURNING id`,
    [usuarioId, nome, saldoInicial, AGORA],
  );
  return linha.id;
}
