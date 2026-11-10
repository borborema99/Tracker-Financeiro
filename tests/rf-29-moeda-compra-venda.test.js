import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esquemaOperacaoMoeda } from '../contratos/moedas.js';
import { excluirConta, atualizarConta } from '../servidor/banco/repositorios/contas.js';
import {
  criarContaMoeda,
  excluirOperacaoMoeda,
  obterContaMoeda,
  registrarOperacaoMoeda,
} from '../servidor/banco/repositorios/moedas.js';
import { movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { resumoDoPeriodo } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, novaConta, saldoDe } from './ajuda.js';

const conta = { nome: 'Viagem', moeda: 'USD', saldo_inicial_centavos: 0, observacao: '' };
const compra = (extra) => ({
  tipo: 'compra',
  valor_centavos: 10000,
  valor_brl_centavos: 54000,
  data: '2026-06-10',
  conta_id: null,
  observacao: '',
  ...extra,
});

async function cenario() {
  const db = await bancoComPadroes();
  const reais = await novaConta(db, 'Conta A', 500000);
  const dolar = await criarContaMoeda(db, conta, CTX);
  return { db, reais, dolar };
}

test('RF-29: comprar moeda debita a conta em reais e vender credita, sem virar despesa nem receita', async () => {
  const { db, reais, dolar } = await cenario();
  const comprada = await registrarOperacaoMoeda(db, dolar.id, compra({ conta_id: reais.id }), CTX);
  assert.equal(comprada.saldo_centavos, 10000);
  assert.equal(await saldoDe(db, reais.id), 446000);
  assert.equal(comprada.operacoes[0].taxa_micros, 5400000, 'a cotação embutida na compra aparece na operação');

  const vendida = await registrarOperacaoMoeda(
    db,
    dolar.id,
    compra({ tipo: 'venda', valor_centavos: 4000, valor_brl_centavos: 22400, data: '2026-06-12', conta_id: reais.id }),
    CTX,
  );
  assert.equal(vendida.saldo_centavos, 6000);
  assert.equal(await saldoDe(db, reais.id), 468400);

  const resumo = resumoDoPeriodo(await movimentacoesDoPeriodo(db, '2026-06-01', '2026-06-30'), { de: '2026-06-01', ate: '2026-06-30' });
  assert.deepEqual(resumo.realizado, { receitas: 0, despesas: 0, resultado: 0 });
  assert.deepEqual(resumo.previsto, { receitas: 0, despesas: 0 });
});

test('RF-29: remover a compra devolve o dinheiro à conta em reais', async () => {
  const { db, reais, dolar } = await cenario();
  const c = await registrarOperacaoMoeda(db, dolar.id, compra({ conta_id: reais.id }), CTX);
  await excluirOperacaoMoeda(db, dolar.id, c.operacoes[0].id, CTX);
  assert.equal(await saldoDe(db, reais.id), 500000);
  assert.equal((await obterContaMoeda(db, dolar.id, CTX.hoje)).saldo_centavos, 0);
});

test('RF-29: venda maior que o saldo em moeda é recusada e nada muda na conta em reais', async () => {
  const { db, reais, dolar } = await cenario();
  await registrarOperacaoMoeda(db, dolar.id, compra({ conta_id: reais.id }), CTX);
  await assert.rejects(
    async () => await registrarOperacaoMoeda(db, dolar.id, compra({ tipo: 'venda', valor_centavos: 10001, conta_id: reais.id }), CTX),
    (e) => e.statusCode === 409,
  );
  assert.equal(await saldoDe(db, reais.id), 446000);
});

test('RF-29: compra e venda exigem conta em reais e valor em reais; depósito e saque não aceitam nenhum dos dois', () => {
  const base = { valor_centavos: 100, data: '2026-06-10', observacao: '' };
  const campos = (o) => esquemaOperacaoMoeda.safeParse(o).error?.issues.map((i) => i.path[0]);
  assert.deepEqual(campos({ ...base, tipo: 'compra' }), ['valor_brl_centavos', 'conta_id']);
  assert.deepEqual(campos({ ...base, tipo: 'venda', valor_brl_centavos: 500 }), ['conta_id']);
  assert.deepEqual(campos({ ...base, tipo: 'deposito', conta_id: 1 }), ['tipo']);
  assert.deepEqual(campos({ ...base, tipo: 'saque', valor_brl_centavos: 500 }), ['tipo']);
  assert.equal(esquemaOperacaoMoeda.safeParse({ ...base, tipo: 'compra', valor_brl_centavos: 500, conta_id: 1 }).success, true);
  assert.equal(esquemaOperacaoMoeda.safeParse({ ...base, tipo: 'deposito' }).success, true);
});

test('RF-29: conta em reais inexistente ou arquivada é recusada', async () => {
  const { db, reais, dolar } = await cenario();
  await assert.rejects(async () => await registrarOperacaoMoeda(db, dolar.id, compra({ conta_id: 999 }), CTX), (e) => e.statusCode === 400);
  await atualizarConta(db, reais.id, { nome: 'Conta A', tipo: 'corrente', saldo_inicial_centavos: 500000, arquivada: true }, CTX);
  await assert.rejects(async () => await registrarOperacaoMoeda(db, dolar.id, compra({ conta_id: reais.id }), CTX), (e) => e.statusCode === 400);
});

test('RF-29 (RF-08): conta em reais com compra ou venda de moeda só arquiva, e nada fica órfão', async () => {
  const { db, reais, dolar } = await cenario();
  await registrarOperacaoMoeda(db, dolar.id, compra({ conta_id: reais.id }), CTX);
  await assert.rejects(async () => await excluirConta(db, reais.id, CTX), (e) => e.statusCode === 409);
  assert.equal(await saldoDe(db, reais.id), 446000);
});
