import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alternarAssinatura } from '../servidor/banco/repositorios/assinaturas.js';
import { criarRecorrencia, excluirRecorrencia, gerarOcorrencias } from '../servidor/banco/repositorios/recorrencias.js';
import { liquidarMovimentacao } from '../servidor/banco/repositorios/movimentacoes.js';
import { esquemaRecorrencia } from '../contratos/recorrencias.js';
import { CTX, bancoComPadroes, novaConta } from './ajuda.js';

const base = (conta, extra = {}) => ({
  tipo: 'despesa',
  descricao: 'Streaming',
  valor_centavos: 3990,
  conta_id: conta.id,
  categoria_id: null,
  frequencia: 'mensal',
  data_inicio: '2026-06-01',
  data_fim: null,
  ativa: true,
  assinatura: true,
  observacao: '',
  ...extra,
});
const cobrancas = async (db, id) =>
  (await db.todos('SELECT data_ocorrencia AS data, status FROM movimentacoes WHERE recorrencia_id = ? AND excluida_em IS NULL ORDER BY data_ocorrencia', [id]));
const em = (hoje) => ({ hoje, agora: new Date(`${hoje}T15:00:00Z`) });

test('RF-18: pausar a assinatura tira as cobranças futuras pendentes e não gera novas', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const a = await criarRecorrencia(db, base(conta), CTX); // 01/06 (vencida), 01/07, 01/08, 01/09
  assert.equal((await cobrancas(db, a.id)).length, 4);

  await alternarAssinatura(db, a.id, false, CTX);
  assert.deepEqual((await cobrancas(db, a.id)).map((c) => c.data), ['2026-06-01'], 'fica só o que já venceu');
  assert.equal(await gerarOcorrencias(db, em('2026-08-20')), 0, 'pausada não gera');
});

test('RF-18: reativar depois de meses não recria as cobranças do período pausado, só as futuras', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const a = await criarRecorrencia(db, base(conta), CTX);
  await alternarAssinatura(db, a.id, false, CTX);

  await alternarAssinatura(db, a.id, true, em('2026-09-15'));

  assert.deepEqual(
    (await cobrancas(db, a.id)).map((c) => c.data),
    ['2026-06-01', '2026-10-01', '2026-11-01', '2026-12-01'],
    'julho, agosto e setembro (pausada) não voltam como atrasadas',
  );
  assert.equal(await gerarOcorrencias(db, em('2026-09-15')), 0, 'e rodar de novo não cria nada');
});

test('RF-18: reativar no mesmo dia da pausa refaz as futuras como antes', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const a = await criarRecorrencia(db, base(conta), CTX);
  await alternarAssinatura(db, a.id, false, CTX);
  await alternarAssinatura(db, a.id, true, CTX);
  assert.deepEqual((await cobrancas(db, a.id)).map((c) => c.data), ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']);
});

test('RF-18: o que já foi pago continua pago ao pausar, reativar ou excluir a assinatura', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const a = await criarRecorrencia(db, base(conta), CTX);
  const [primeira] = (await db.todos('SELECT id FROM movimentacoes WHERE recorrencia_id = ? ORDER BY data_ocorrencia', [a.id]));
  await liquidarMovimentacao(db, primeira.id, '2026-06-02', CTX);

  await alternarAssinatura(db, a.id, false, CTX);
  await alternarAssinatura(db, a.id, true, em('2026-08-20'));
  assert.equal((await cobrancas(db, a.id))[0].status, 'liquidada');

  await excluirRecorrencia(db, a.id, em('2026-08-20'));
  assert.deepEqual((await cobrancas(db, a.id)).map((c) => c.status), ['liquidada']);
});

test('RF-18: só assinatura pode ser pausada por aqui; recorrência comum e id inexistente dão 404', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const comum = await criarRecorrencia(db, base(conta, { assinatura: false }), CTX);
  await assert.rejects(async () => await alternarAssinatura(db, comum.id, false, CTX), (e) => e.statusCode === 404);
  await assert.rejects(async () => await alternarAssinatura(db, 9999, false, CTX), (e) => e.statusCode === 404);
});

test('RF-18: só despesa pode ser assinatura (o contrato recusa receita)', () => {
  const dados = { tipo: 'receita', descricao: 'Salário', valor_centavos: 100, conta_id: 1, frequencia: 'mensal', data_inicio: '2026-06-01', assinatura: true };
  const r = esquemaRecorrencia.safeParse(dados);
  assert.equal(r.success, false);
  assert.match(r.error.issues[0].message, /despesa/);
  assert.equal(esquemaRecorrencia.safeParse({ ...dados, tipo: 'despesa' }).success, true);
  assert.equal(esquemaRecorrencia.parse({ ...dados, tipo: 'despesa', assinatura: undefined }).assinatura, false, 'padrão: não é assinatura');
});
