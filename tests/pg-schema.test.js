import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AGORA, bancoPgDeTeste, novaContaPg, novoUsuario } from './pg-ajuda.js';

let banco;
before(async () => {
  banco = await bancoPgDeTeste();
});
after(() => banco.fechar());

// Tabelas sem `usuario_id` por desenho: a conta em si, a trava de login (vale até para nome inexistente) e o
// controle das migrations. Qualquer tabela nova fora desta lista precisa de `usuario_id NOT NULL`.
const SEM_USUARIO = new Set(['usuarios', 'tentativas_login', 'schema_migrations', 'sessoes']);

const tabelas = () =>
  banco.consultar(`SELECT tablename AS nome FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);

test('toda tabela de dados tem usuario_id NOT NULL, ligado a usuarios com exclusão em cascata', async () => {
  const sem = [];
  for (const { nome } of await tabelas()) {
    if (SEM_USUARIO.has(nome)) continue;
    const [coluna] = await banco.consultar(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'usuario_id'`,
      [nome],
    );
    if (!coluna || coluna.is_nullable !== 'NO') sem.push(nome);
  }
  assert.deepEqual(sem, [], `tabelas sem usuario_id NOT NULL: ${sem.join(', ')}`);

  const [{ n }] = await banco.consultar(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessoes' AND column_name = 'usuario_id' AND is_nullable = 'NO'`,
  );
  assert.equal(n, 1, 'sessoes precisa de usuario_id NOT NULL');
});

test('toda chave estrangeira entre dados é composta com usuario_id', async () => {
  const fks = await banco.consultar(`
    SELECT c.conname, c.conrelid::regclass::text AS tabela, c.confrelid::regclass::text AS alvo,
      ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.num ORDER BY k.ord) AS colunas,
      ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num, ord)
            JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.num ORDER BY k.ord) AS alvo_colunas
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`);
  assert.ok(fks.length > 40, 'esperava dezenas de chaves estrangeiras');
  const simples = fks
    .filter((f) => f.alvo !== 'usuarios')
    .filter((f) => f.colunas[0] !== 'usuario_id' || f.alvo_colunas[0] !== 'usuario_id')
    .map((f) => `${f.tabela}.${f.colunas.join(',')} -> ${f.alvo}`);
  assert.deepEqual(simples, [], `chaves que não incluem usuario_id: ${simples.join('; ')}`);
  const aUsuarios = fks.filter((f) => f.alvo === 'usuarios');
  assert.ok(aUsuarios.length > 20);
});

test('RLS ligado em todas as tabelas e nenhuma policy criada (nega tudo a anon e authenticated)', async () => {
  const linhas = await banco.consultar(
    `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
  );
  assert.ok(linhas.length >= 30);
  assert.deepEqual(linhas.filter((l) => !l.relrowsecurity).map((l) => l.relname), []);
  const [{ n }] = await banco.consultar('SELECT count(*)::int AS n FROM pg_policies');
  assert.equal(n, 0);
});

test('o nome de usuário é único sem diferenciar maiúsculas', async () => {
  await novoUsuario(banco, 'Felipe.Teste');
  await assert.rejects(() => novoUsuario(banco, 'felipe.teste'), /idx_usuarios_nome|duplicate|unique/i);
  await assert.rejects(() => novoUsuario(banco, 'ab'), /check/i);
  await assert.rejects(() => novoUsuario(banco, 'com espaço'), /check/i);
});

test('referenciar dado de outro usuário é impossível no banco', async () => {
  const a = await novoUsuario(banco, 'iso_a');
  const b = await novoUsuario(banco, 'iso_b');
  const contaA = await novaContaPg(banco, a, 'Conta de A');
  const contaB = await novaContaPg(banco, b, 'Conta de B');

  const inserir = (usuario, conta, extra = '') =>
    banco.consultar(
      `INSERT INTO movimentacoes (usuario_id, tipo, valor_centavos, conta_id, data_competencia, status, criada_em, atualizada_em ${extra ? ', ' + extra.split('=')[0] : ''})
       VALUES ($1, 'despesa', 100, $2, '2026-06-01', 'pendente', $3, $3 ${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`,
      [usuario, conta, AGORA],
    );

  // B apontando para a conta de A: violação de chave estrangeira composta.
  await assert.rejects(() => inserir(b, contaA), (e) => e.code === '23503');
  // Cada um na sua conta funciona.
  const [movA] = await inserir(a, contaA);
  await inserir(b, contaB);
  // Transferência de B para a conta de A também é recusada.
  await assert.rejects(
    () =>
      banco.consultar(
        `INSERT INTO movimentacoes (usuario_id, tipo, valor_centavos, conta_id, conta_destino_id, data_competencia, status, criada_em, atualizada_em)
         VALUES ($1, 'transferencia', 100, $2, $3, '2026-06-01', 'pendente', $4, $4)`,
        [b, contaB, contaA, AGORA],
      ),
    (e) => e.code === '23503',
  );
  // Reembolso de B ligado à movimentação de A.
  await assert.rejects(() => inserir(b, contaB, `reembolso_de_id=${movA.id}`), (e) => e.code === '23503');
});

test('excluir o usuário apaga todos os dados dele e nada do outro', async () => {
  const a = await novoUsuario(banco, 'cascata_a');
  const b = await novoUsuario(banco, 'cascata_b');
  for (const u of [a, b]) {
    const conta = await novaContaPg(banco, u);
    const [cat] = await banco.consultar(
      `INSERT INTO categorias (usuario_id, nome, tipo, criada_em, atualizada_em) VALUES ($1, 'Mercado', 'despesa', $2, $2) RETURNING id`,
      [u, AGORA],
    );
    const [mov] = await banco.consultar(
      `INSERT INTO movimentacoes (usuario_id, tipo, valor_centavos, conta_id, categoria_id, data_competencia, status, criada_em, atualizada_em)
       VALUES ($1, 'despesa', 500, $2, $3, '2026-06-01', 'pendente', $4, $4) RETURNING id`,
      [u, conta, cat.id, AGORA],
    );
    await banco.consultar(
      `INSERT INTO movimentacao_divisoes (usuario_id, movimentacao_id, categoria_id, valor_centavos) VALUES ($1, $2, $3, 500)`,
      [u, mov.id, cat.id],
    );
    const [cartao] = await banco.consultar(
      `INSERT INTO cartoes (usuario_id, nome, limite_centavos, dia_fechamento, dia_vencimento, conta_pagamento_id, criado_em, atualizado_em)
       VALUES ($1, 'Cartão', 100000, 10, 17, $2, $3, $3) RETURNING id`,
      [u, conta, AGORA],
    );
    const [fatura] = await banco.consultar(
      `INSERT INTO faturas (usuario_id, cartao_id, referencia, data_fechamento, data_vencimento, criada_em)
       VALUES ($1, $2, '2026-06', '2026-06-10', '2026-06-17', $3) RETURNING id`,
      [u, cartao.id, AGORA],
    );
    const [compra] = await banco.consultar(
      `INSERT INTO compras_cartao (usuario_id, cartao_id, valor_total_centavos, data_compra, parcelas_total, criada_em, atualizada_em)
       VALUES ($1, $2, 900, '2026-06-05', 1, $3, $3) RETURNING id`,
      [u, cartao.id, AGORA],
    );
    await banco.consultar(
      `INSERT INTO parcelas_cartao (usuario_id, compra_id, numero, valor_centavos, fatura_id) VALUES ($1, $2, 1, 900, $3)`,
      [u, compra.id, fatura.id],
    );
    await banco.consultar(
      `INSERT INTO pagamentos_fatura (usuario_id, fatura_id, conta_id, valor_centavos, data_pagamento, criado_em) VALUES ($1, $2, $3, 100, '2026-06-16', $4)`,
      [u, fatura.id, conta, AGORA],
    );
    await banco.consultar(
      `INSERT INTO anexos (usuario_id, movimentacao_id, nome, tipo_mime, tamanho_bytes, sha256, caminho_storage, criado_em)
       VALUES ($1, $2, 'nota.pdf', 'application/pdf', 10, 'abc', $3, $4)`,
      [u, mov.id, `${u}/obj-${u}`, AGORA],
    );
    await banco.consultar(`INSERT INTO config (usuario_id, chave, valor) VALUES ($1, 'fuso', 'America/Sao_Paulo')`, [u]);
    await banco.consultar(
      `INSERT INTO audit_log (usuario_id, entidade, entidade_id, acao, criado_em) VALUES ($1, 'conta', '1', 'criar', $2)`,
      [u, AGORA],
    );
    await banco.consultar(
      `INSERT INTO sessoes (id_hash, usuario_id, criada_em, expira_em) VALUES ($1, $2, $3, $3)`,
      [`hash-${u}`, u, AGORA],
    );
  }

  const contar = async (usuario) => {
    let total = 0;
    for (const { nome } of await tabelas()) {
      if (['usuarios', 'tentativas_login', 'schema_migrations'].includes(nome)) continue;
      const [{ n }] = await banco.consultar(`SELECT count(*)::int AS n FROM ${nome} WHERE usuario_id = $1`, [usuario]);
      total += n;
    }
    return total;
  };
  const antesB = await contar(b);
  assert.ok((await contar(a)) >= 12);

  await banco.consultar('DELETE FROM usuarios WHERE id = $1', [a]);

  assert.equal(await contar(a), 0);
  assert.equal(await contar(b), antesB);
  const [{ n }] = await banco.consultar('SELECT count(*)::int AS n FROM usuarios WHERE id = $1', [b]);
  assert.equal(n, 1);
});

test('anexo removido não tem objeto e anexo ativo sempre tem (CHECK)', async () => {
  const u = await novoUsuario(banco, 'anexo_check');
  const conta = await novaContaPg(banco, u);
  const [mov] = await banco.consultar(
    `INSERT INTO movimentacoes (usuario_id, tipo, valor_centavos, conta_id, data_competencia, status, criada_em, atualizada_em)
     VALUES ($1, 'despesa', 100, $2, '2026-06-01', 'pendente', $3, $3) RETURNING id`,
    [u, conta, AGORA],
  );
  const base = `INSERT INTO anexos (usuario_id, movimentacao_id, nome, tipo_mime, tamanho_bytes, sha256, caminho_storage, criado_em, excluido_em)`;
  await assert.rejects(() => banco.consultar(`${base} VALUES ($1, $2, 'a.pdf', 'application/pdf', 1, 'x', NULL, $3, NULL)`, [u, mov.id, AGORA]));
  await assert.rejects(() => banco.consultar(`${base} VALUES ($1, $2, 'a.pdf', 'application/pdf', 1, 'x', 'p', $3, $3)`, [u, mov.id, AGORA]));
  await banco.consultar(`${base} VALUES ($1, $2, 'a.pdf', 'application/pdf', 1, 'x', NULL, $3, $3)`, [u, mov.id, AGORA]);
});
