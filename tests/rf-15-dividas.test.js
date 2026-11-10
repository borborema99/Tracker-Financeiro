import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atualizarDivida, criarDivida, listarDividas, obterDivida } from '../servidor/banco/repositorios/dividas.js';
import { baixarParcial, liquidarMovimentacao } from '../servidor/banco/repositorios/movimentacoes.js';
import { criarConta } from '../servidor/banco/repositorios/contas.js';
import { descricaoDaParcela, gerarParcelas, resumoDaDivida } from '../servidor/dominio/divida.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaConta, saldoDe } from './ajuda.js';

const dados = (conta, extra = {}) => ({
  nome: 'Financiamento',
  credor: 'Banco X',
  valor_total_centavos: 100000,
  parcelas_total: 4,
  primeiro_vencimento: '2026-07-10',
  conta_id: conta.id,
  categoria_id: null,
  observacao: '',
  ...extra,
});
const parcelaIds = (divida) => divida.parcelas.map((p) => p.lancamento_id);

test('RF-15: a soma das parcelas fecha com o total e o resto de centavos fica na primeira', () => {
  const p = gerarParcelas({ valor_total_centavos: 100000, parcelas_total: 3, primeiro_vencimento: '2026-07-10' });
  assert.deepEqual(p.map((x) => x.valor_centavos), [33334, 33333, 33333]);
  assert.equal(p.reduce((s, x) => s + x.valor_centavos, 0), 100000);
  assert.deepEqual(p.map((x) => x.numero), [1, 2, 3]);
});

test('RF-15: o vencimento é mensal, atravessa o ano e o dia 31 vira o último dia do mês quando ele não existe', () => {
  const dez = gerarParcelas({ valor_total_centavos: 3000, parcelas_total: 3, primeiro_vencimento: '2026-11-20' });
  assert.deepEqual(dez.map((x) => x.data_vencimento), ['2026-11-20', '2026-12-20', '2027-01-20']);
  const fim = gerarParcelas({ valor_total_centavos: 4000, parcelas_total: 4, primeiro_vencimento: '2027-01-31' });
  assert.deepEqual(fim.map((x) => x.data_vencimento), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.equal(descricaoDaParcela('Carro', 3, 12), 'Carro (3/12)');
});

test('RF-15: criar a dívida gera uma despesa pendente por parcela, sem mexer no saldo (RF-01)', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'Conta A', 500000);
  const d = await criarDivida(db, dados(conta), CTX);

  assert.equal(d.parcelas.length, 4);
  assert.deepEqual(d.parcelas.map((p) => p.valor_centavos), [25000, 25000, 25000, 25000]);
  assert.deepEqual(d.parcelas.map((p) => p.data_vencimento), ['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10']);
  assert.ok(d.parcelas.every((p) => p.status === 'pendente'));
  const linhas = (await db.todos('SELECT tipo, descricao, status, conta_id, divida_id, divida_parcela FROM movimentacoes ORDER BY divida_parcela', []));
  assert.deepEqual(linhas.map((l) => l.descricao), ['Financiamento (1/4)', 'Financiamento (2/4)', 'Financiamento (3/4)', 'Financiamento (4/4)']);
  assert.ok(linhas.every((l) => l.tipo === 'despesa' && l.status === 'pendente' && l.divida_id === d.id && l.conta_id === conta.id));
  assert.equal(await saldoDe(db, conta.id), 500000, 'pendente não altera saldo');
  assert.equal(d.restante_centavos, 100000);
  assert.equal(d.pago_centavos, 0);
  assert.equal(d.situacao, 'em_dia');
});

test('RF-15: pago e restante saem dos lançamentos e sempre somam o total das parcelas', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'Conta A', 500000);
  const d = await criarDivida(db, dados(conta), CTX);
  const [p1, p2] = parcelaIds(d);

  await liquidarMovimentacao(db, p1, '2026-07-10', CTX);
  let atual = await obterDivida(db, d.id, CTX.hoje);
  assert.equal(atual.pago_centavos, 25000);
  assert.equal(atual.restante_centavos, 75000);
  assert.equal(atual.parcelas_pagas, 1);
  assert.equal(atual.percentual_pago, 25);
  assert.equal(atual.proxima.numero, 2);
  assert.equal(await saldoDe(db, conta.id), 475000, 'a parcela paga debita a conta');

  await liquidarMovimentacao(db, p2, '2026-08-10', CTX);
  atual = await obterDivida(db, d.id, CTX.hoje);
  assert.equal(atual.pago_centavos + atual.restante_centavos, 100000);
  assert.equal(atual.parcelas_pagas, 2);
});

test('RF-15: pagar todas as parcelas quita a dívida', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const d = await criarDivida(db, dados(conta, { valor_total_centavos: 3000, parcelas_total: 3 }), CTX);
  for (const id of parcelaIds(d)) await liquidarMovimentacao(db, id, '2026-06-15', CTX);
  const q = await obterDivida(db, d.id, CTX.hoje);
  assert.equal(q.situacao, 'quitada');
  assert.equal(q.restante_centavos, 0);
  assert.equal(q.proxima, null);
  assert.equal(q.percentual_pago, 100);
});

test('RF-15: a baixa parcial mantém o vínculo com a dívida e a parcela só conta como paga quando nada dela está pendente', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'Conta A', 500000);
  const d = await criarDivida(db, dados(conta), CTX);
  const [p1] = parcelaIds(d);

  const { restante } = await baixarParcial(db, p1, { valor_centavos: 10000, data_liquidacao: '2026-06-15' }, CTX);
  assert.equal(restante.divida_id, d.id);
  assert.equal(restante.divida_parcela, 1);
  const atual = await obterDivida(db, d.id, CTX.hoje);
  assert.equal(atual.pago_centavos, 10000);
  assert.equal(atual.restante_centavos, 90000);
  assert.equal(atual.pago_centavos + atual.restante_centavos, 100000);
  assert.equal(atual.parcelas_pagas, 0, 'a parcela 1 ainda tem R$ 150,00 pendentes');
  assert.equal(atual.parcelas_em_aberto, 4);
  assert.equal(atual.parcelas.filter((p) => p.numero === 1).length, 2, 'a parcela aparece em duas linhas');

  await liquidarMovimentacao(db, restante.id, '2026-06-15', CTX);
  assert.equal((await obterDivida(db, d.id, CTX.hoje)).parcelas_pagas, 1);
});

test('RF-15: a lista põe atrasadas primeiro, depois em dia e quitadas', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  await criarDivida(db, dados(conta, { nome: 'Em dia', primeiro_vencimento: '2026-07-10' }), CTX);
  await criarDivida(db, dados(conta, { nome: 'Atrasada', primeiro_vencimento: '2026-05-10' }), CTX);
  const paga = await criarDivida(db, dados(conta, { nome: 'Quitada', parcelas_total: 1, valor_total_centavos: 500 }), CTX);
  await liquidarMovimentacao(db, parcelaIds(paga)[0], '2026-06-15', CTX);

  assert.deepEqual((await listarDividas(db, CTX.hoje)).map((d) => [d.nome, d.situacao]), [
    ['Atrasada', 'atrasada'],
    ['Em dia', 'em_dia'],
    ['Quitada', 'quitada'],
  ]);
});

test('RF-15: dívida sem nenhuma parcela não aparece como quitada', () => {
  assert.equal(resumoDaDivida([], CTX.hoje).situacao, 'sem_parcelas');
});

test('RF-15: conta arquivada, conta inexistente e categoria de receita são recusadas (400)', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const arquivada = await criarConta(db, { nome: 'Velha', tipo: 'corrente', saldo_inicial_centavos: 0, arquivada: true }, CTX);
  const recusa = async (extra, campo) =>
    await assert.rejects(async () => await criarDivida(db, dados(conta, extra), CTX), (e) => e.statusCode === 400 && Boolean(e.campos[campo]));
  await recusa({ conta_id: arquivada.id }, 'conta_id');
  await recusa({ conta_id: 9999 }, 'conta_id');
  await recusa({ categoria_id: (await categoriaPorNome(db, 'Salário')).id }, 'categoria_id');
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM movimentacoes', [])).n, 0, 'nada foi gravado');
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM dividas', [])).n, 0);
});

test('RF-15: editar a dívida muda só os textos e o nome novo vai para cada parcela', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const d = await criarDivida(db, dados(conta), CTX);
  await liquidarMovimentacao(db, parcelaIds(d)[0], '2026-07-10', CTX);
  const depois = await atualizarDivida(db, d.id, { nome: 'Carro', credor: 'Banco Y', observacao: 'renegociada' }, CTX);
  assert.equal(depois.credor, 'Banco Y');
  assert.equal(depois.valor_total_centavos, 100000, 'o valor contratado não muda por aqui');
  assert.deepEqual(
    (await db.todos('SELECT descricao FROM movimentacoes WHERE divida_id = ? ORDER BY divida_parcela', [d.id])).map((l) => l.descricao),
    ['Carro (1/4)', 'Carro (2/4)', 'Carro (3/4)', 'Carro (4/4)'],
  );
});
