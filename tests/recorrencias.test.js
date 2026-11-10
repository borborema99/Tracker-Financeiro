import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liquidarMovimentacao, excluirMovimentacao } from '../servidor/banco/repositorios/movimentacoes.js';
import {
  atualizarRecorrencia,
  criarRecorrencia,
  excluirRecorrencia,
  gerarOcorrencias,
  listarRecorrencias,
} from '../servidor/banco/repositorios/recorrencias.js';
import { CTX, bancoComPadroes, novaConta, saldoDe } from './ajuda.js';

const base = (conta, extra = {}) => ({
  tipo: 'despesa',
  descricao: 'Aluguel',
  valor_centavos: 100000,
  conta_id: conta.id,
  categoria_id: null,
  frequencia: 'mensal',
  data_inicio: '2026-06-15',
  data_fim: null,
  ativa: true,
  observacao: '',
  ...extra,
});

const ocorrencias = async (db, id) =>
  (await db.todos(`SELECT id, valor_centavos, status, data_ocorrencia, data_vencimento FROM movimentacoes
        WHERE recorrencia_id = ? AND excluida_em IS NULL ORDER BY data_ocorrencia`, [id]));

test('recorrência: gera as ocorrências até 90 dias à frente, como pendentes no vencimento', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta), CTX);
  const lista = await ocorrencias(db, r.id);
  assert.deepEqual(lista.map((o) => o.data_ocorrencia), ['2026-06-15', '2026-07-15', '2026-08-15']);
  assert.ok(lista.every((o) => o.status === 'pendente' && o.data_vencimento === o.data_ocorrencia));
  assert.equal(await saldoDe(db, conta.id), 0); // pendente não mexe no saldo
});

test('recorrência: gerar de novo (abrir o app várias vezes) não duplica nada', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta), CTX);
  assert.equal(await gerarOcorrencias(db, CTX), 0);
  assert.equal(await gerarOcorrencias(db, CTX), 0);
  assert.equal((await ocorrencias(db, r.id)).length, 3);

  // Dias depois entra o que o horizonte passou a cobrir.
  assert.equal(await gerarOcorrencias(db, { ...CTX, hoje: '2026-06-16' }), 0); // 16/06 + 90 dias = 14/09: ainda não cabe 15/09
  assert.equal(await gerarOcorrencias(db, { ...CTX, hoje: '2026-06-20' }), 1); // 20/06 + 90 dias = 18/09: entra 15/09
  assert.equal(await gerarOcorrencias(db, { ...CTX, hoje: '2026-06-25' }), 0);
  assert.equal((await ocorrencias(db, r.id)).length, 4);
});

test('recorrência: a idempotência é garantida pelo banco (índice único)', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta), CTX);
  await assert.rejects(async () =>
    (await db.rodar(`INSERT INTO movimentacoes (tipo, descricao, valor_centavos, conta_id, data_competencia, status, recorrencia_id,
           data_ocorrencia, criada_em, atualizada_em)
         VALUES ('despesa', 'x', 1, ?, '2026-06-15', 'pendente', ?, '2026-06-15', 'a', 'a')`, [conta.id, r.id])),
  );
});

test('recorrência: ocorrência apagada pelo dono não volta a ser gerada', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta), CTX);
  const julho = (await ocorrencias(db, r.id))[1];
  await excluirMovimentacao(db, julho.id, CTX);
  assert.equal(await gerarOcorrencias(db, CTX), 0);
  assert.deepEqual((await ocorrencias(db, r.id)).map((o) => o.data_ocorrencia), ['2026-06-15', '2026-08-15']);
});

test('recorrência: editar vale daqui para frente (futuras pendentes refeitas, liquidada e passado ficam)', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta, { data_inicio: '2026-06-01' }), CTX); // 01/06 já venceu
  assert.deepEqual((await ocorrencias(db, r.id)).map((o) => o.data_ocorrencia), ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']);
  const [passada, julho] = await ocorrencias(db, r.id);
  await liquidarMovimentacao(db, julho.id, '2026-06-15', CTX);

  await atualizarRecorrencia(db, r.id, base(conta, { data_inicio: '2026-06-01', valor_centavos: 200000 }), CTX);
  const depois = await ocorrencias(db, r.id);
  // 01/06 (vencida) e 01/07 (liquidada) não mudam; as pendentes de hoje em diante são refeitas.
  assert.deepEqual(depois.map((o) => [o.data_ocorrencia, o.valor_centavos]), [
    ['2026-06-01', 100000],
    ['2026-07-01', 100000],
    ['2026-08-01', 200000],
    ['2026-09-01', 200000],
  ]);
  assert.equal(depois[0].id, passada.id);
  assert.equal(depois[1].status, 'liquidada');
});

test('recorrência: pausar ou excluir tira as futuras pendentes e preserva o que foi liquidado', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta), CTX);
  await liquidarMovimentacao(db, (await ocorrencias(db, r.id))[0].id, '2026-06-15', CTX);

  await atualizarRecorrencia(db, r.id, base(conta, { ativa: false }), CTX);
  assert.deepEqual((await ocorrencias(db, r.id)).map((o) => o.status), ['liquidada']);
  assert.equal(await gerarOcorrencias(db, CTX), 0); // pausada não gera

  await atualizarRecorrencia(db, r.id, base(conta, { ativa: true }), CTX);
  assert.equal((await ocorrencias(db, r.id)).length, 3);

  await excluirRecorrencia(db, r.id, CTX);
  assert.deepEqual((await ocorrencias(db, r.id)).map((o) => o.status), ['liquidada']);
  assert.equal((await listarRecorrencias(db)).length, 0);
  assert.equal(await gerarOcorrencias(db, CTX), 0);
});

test('recorrência: toda escrita vai para o audit_log (a recorrência e cada ocorrência gerada)', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta), CTX);
  const n = async (entidade, acao) =>
    (await db.um('SELECT COUNT(*) AS n FROM audit_log WHERE entidade = ? AND acao = ?', [entidade, acao])).n;
  assert.equal(await n('recorrencia', 'criar'), 1);
  assert.equal(await n('movimentacao', 'criar'), 3);
  await atualizarRecorrencia(db, r.id, base(conta, { valor_centavos: 5 }), CTX);
  assert.equal(await n('recorrencia', 'editar'), 1);
  assert.equal(await n('movimentacao', 'excluir'), 3);
});

test('recorrência: data final antes do início e conta ou categoria inexistente são recusadas', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  await assert.rejects(async () => await criarRecorrencia(db, base({ id: 999 }), CTX), (e) => e.statusCode === 400 && 'conta_id' in e.campos);
  await assert.rejects(async () => await criarRecorrencia(db, base(conta, { categoria_id: 99999 }), CTX), (e) => 'categoria_id' in e.campos);
  await assert.rejects(async () => await atualizarRecorrencia(db, 12345, base(conta), CTX), (e) => e.statusCode === 404);
});

test('recorrência: receita recorrente gera recebimentos pendentes', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const r = await criarRecorrencia(db, base(conta, { tipo: 'receita', descricao: 'Salário', frequencia: 'semanal', data_inicio: '2026-06-19' }), CTX);
  assert.equal((await ocorrencias(db, r.id)).length, 13); // 19/06 + 7·12 = 11/09, dentro dos 90 dias (até 13/09)
  assert.equal((await db.um("SELECT COUNT(*) AS n FROM movimentacoes WHERE recorrencia_id = ? AND tipo = 'receita'", [r.id])).n, 13);
});
