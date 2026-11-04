import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  anteciparParcelas,
  estornarCompra,
  excluirEstorno,
  faturasDoCartao,
  movimentosDeCartaoDoPeriodo,
  obterCompra,
} from '../servidor/banco/repositorios/cartoes.js';
import {
  atualizarMovimentacao,
  excluirMovimentacao,
  obterMovimentacao,
} from '../servidor/banco/repositorios/movimentacoes.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { CTX, bancoComPadroes, novaCompra, novaConta, novaMov, novoCartao, saldoDe } from './ajuda.js';

const despesasNoPeriodo = (db, de, ate) =>
  resumoRealizado(movimentosDeCartaoDoPeriodo(db, de, ate), de, ate).despesas;
const faturas = (db, cartao) =>
  faturasDoCartao(db, cartao.id, CTX.hoje).sort((a, b) => a.referencia.localeCompare(b.referencia));

test('RF-05: a compra parcelada gera uma parcela por fatura, cada uma com seu vencimento', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });

  assert.deepEqual(compra.parcelas.map((p) => p.referencia), ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(compra.parcelas.map((p) => p.data_vencimento), ['2026-06-17', '2026-07-17', '2026-08-17']);
  assert.deepEqual(compra.parcelas.map((p) => p.valor_centavos), [4000, 4000, 4000]);
  assert.deepEqual(faturas(db, cartao).map((f) => f.total_centavos), [4000, 4000, 4000]);
});

test('RF-05: a soma das parcelas fecha com o total e o resto de centavos fica na primeira', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 10000, parcelas_total: 3 });
  assert.deepEqual(compra.parcelas.map((p) => p.valor_centavos), [3334, 3333, 3333]);
  assert.equal(compra.parcelas.reduce((s, p) => s + p.valor_centavos, 0), compra.valor_total_centavos);
});

test('RF-05: a compra parcelada atravessa a virada do ano mantendo um vencimento por fatura', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 9000, parcelas_total: 3, data_compra: '2026-11-20' });
  assert.deepEqual(compra.parcelas.map((p) => p.referencia), ['2026-12', '2027-01', '2027-02']);
  assert.deepEqual(compra.parcelas.map((p) => p.data_vencimento), ['2026-12-17', '2027-01-17', '2027-02-17']);
});

test('RF-05: o estorno parcial ajusta a compra original e abate a fatura aberta', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });

  const ajustada = estornarCompra(db, compra.id, { valor_centavos: 3000, descricao: 'Item devolvido' }, CTX);

  assert.equal(ajustada.valor_total_centavos, 12000, 'a compra original continua registrada');
  assert.equal(ajustada.estornado_centavos, 3000);
  assert.equal(ajustada.valor_liquido_centavos, 9000);
  // Hoje (15/06) a fatura aberta é a de julho: 4000 de parcela − 3000 de crédito.
  const [junho, julho, agosto] = faturas(db, cartao);
  assert.equal(junho.total_centavos, 4000);
  assert.equal(julho.total_centavos, 1000);
  assert.equal(agosto.total_centavos, 4000);
  assert.equal(despesasNoPeriodo(db, '2026-06-01', '2026-06-30'), 9000, 'a despesa cai na data do estorno');
});

test('RF-05: estornar a compra inteira reverte a despesa e o que sobrar de crédito vai para as faturas seguintes', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });

  const revertida = estornarCompra(db, compra.id, { valor_centavos: 12000 }, CTX);

  assert.equal(revertida.valor_liquido_centavos, 0);
  assert.equal(despesasNoPeriodo(db, '2026-06-01', '2026-12-31'), 0);
  const [junho, julho, agosto] = faturas(db, cartao);
  assert.equal(junho.total_centavos, 4000, 'a fatura de junho já fechou: o crédito entra a partir da aberta');
  assert.equal(julho.total_centavos, 0);
  assert.equal(agosto.total_centavos, 0);
  assert.equal(agosto.credito_a_transportar_centavos, 4000, 'sobra de crédito para a próxima compra');
});

test('RF-05: estorno acima do que resta da compra, antes dela ou no futuro é recusado', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000 });
  estornarCompra(db, compra.id, { valor_centavos: 5000 }, CTX);

  const recusa = (dados, campo) =>
    assert.throws(
      () => estornarCompra(db, compra.id, dados, CTX),
      (erro) => erro.statusCode === 400 && campo in erro.campos,
    );
  recusa({ valor_centavos: 7001 }, 'valor_centavos');
  recusa({ valor_centavos: 1000, data_estorno: '2026-06-04' }, 'data_estorno');
  recusa({ valor_centavos: 1000, data_estorno: '2026-06-16' }, 'data_estorno');
  assert.equal(obterCompra(db, compra.id).estornado_centavos, 5000);
});

test('RF-05: excluir o estorno devolve a compra ao valor original e a fatura ao total anterior', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 3 });
  const estornada = estornarCompra(db, compra.id, { valor_centavos: 3000 }, CTX);

  const restaurada = excluirEstorno(db, estornada.estornos[0].id, CTX);
  assert.equal(restaurada.valor_liquido_centavos, 12000);
  assert.deepEqual(faturas(db, cartao).map((f) => f.total_centavos), [4000, 4000, 4000]);
  assert.equal(despesasNoPeriodo(db, '2026-06-01', '2026-06-30'), 12000);
});

test('RF-05: antecipar leva parcelas futuras para a fatura aberta sem mudar o valor da compra', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 4 });

  const antecipada = anteciparParcelas(db, compra.id, { parcelas: [3, 4] }, CTX);

  assert.deepEqual(antecipada.parcelas.map((p) => p.referencia), ['2026-06', '2026-07', '2026-07', '2026-07']);
  assert.equal(antecipada.valor_total_centavos, 12000);
  assert.deepEqual(faturas(db, cartao).map((f) => [f.referencia, f.total_centavos]), [
    ['2026-06', 3000],
    ['2026-07', 9000],
  ]);
});

test('RF-05: não antecipa parcela que já está na fatura aberta (ou antes) nem parcela inexistente', () => {
  const db = bancoComPadroes();
  const cartao = novoCartao(db);
  const compra = novaCompra(db, cartao, { valor_total_centavos: 12000, parcelas_total: 4 });
  const recusa = (parcelas) =>
    assert.throws(
      () => anteciparParcelas(db, compra.id, { parcelas }, CTX),
      (erro) => erro.statusCode === 400 && 'parcelas' in erro.campos,
    );
  recusa([1]);
  recusa([2]);
  recusa([9]);
});

// --- Reembolso: receita ligada à despesa original ---

const reembolsoDe = (db, despesa, conta, valor, extra = {}) =>
  novaMov(db, { tipo: 'receita', valor_centavos: valor, conta_id: conta.id, reembolso_de_id: despesa.id, ...extra });

test('RF-05: o reembolso fica ligado à despesa original e conta como receita, sem apagar a despesa', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const despesa = novaMov(db, { tipo: 'despesa', valor_centavos: 10000, conta_id: conta.id });

  const reembolso = reembolsoDe(db, despesa, conta, 4000);

  assert.equal(reembolso.reembolso_de_id, despesa.id);
  assert.equal(obterMovimentacao(db, despesa.id).reembolsado_centavos, 4000);
  assert.equal(obterMovimentacao(db, despesa.id).reembolsavel_centavos, 6000, 'a API devolve o que ainda dá para reembolsar');
  assert.equal(obterMovimentacao(db, despesa.id).valor_centavos, 10000, 'a despesa original não muda');
  assert.equal(saldoDe(db, conta.id), 100000 - 10000 + 4000);
});

test('RF-05: o reembolso não passa do que resta da despesa e só vale para despesa', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const despesa = novaMov(db, { tipo: 'despesa', valor_centavos: 10000, conta_id: conta.id });
  const outraReceita = novaMov(db, { tipo: 'receita', valor_centavos: 500, conta_id: conta.id });
  reembolsoDe(db, despesa, conta, 7000);

  assert.throws(
    () => reembolsoDe(db, despesa, conta, 3001),
    (erro) => erro.statusCode === 400 && 'valor_centavos' in erro.campos,
  );
  reembolsoDe(db, despesa, conta, 3000); // fecha exatamente o valor
  assert.throws(
    () => reembolsoDe(db, outraReceita, conta, 100),
    (erro) => erro.statusCode === 400 && 'reembolso_de_id' in erro.campos,
  );
  assert.throws(
    () => novaMov(db, { tipo: 'despesa', valor_centavos: 100, conta_id: conta.id, reembolso_de_id: despesa.id }),
    (erro) => erro.statusCode === 400 && 'reembolso_de_id' in erro.campos,
    'só receita pode ser reembolso',
  );
});

test('RF-08: a despesa que tem reembolso não pode ser excluída nem ficar menor que ele', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'A', 100000);
  const despesa = novaMov(db, { tipo: 'despesa', valor_centavos: 10000, conta_id: conta.id });
  const reembolso = reembolsoDe(db, despesa, conta, 4000);

  assert.throws(() => excluirMovimentacao(db, despesa.id, CTX), (erro) => erro.statusCode === 409);
  const menor = {
    tipo: 'despesa', descricao: '', valor_centavos: 3000, conta_id: conta.id, data_competencia: '2026-06-10',
    status: 'liquidada', observacao: '', divisoes: [], tarifa_centavos: 0,
  };
  assert.throws(() => atualizarMovimentacao(db, despesa.id, menor, CTX), (erro) => erro.statusCode === 409);

  excluirMovimentacao(db, reembolso.id, CTX);
  atualizarMovimentacao(db, despesa.id, menor, CTX);
  excluirMovimentacao(db, despesa.id, CTX);
  assert.equal(obterMovimentacao(db, despesa.id), null);
});
