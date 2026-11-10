import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estornarCompra } from '../servidor/banco/repositorios/cartoes.js';
import { definirLimite, orcamentoDoMes, orcamentoSeExistir } from '../servidor/banco/repositorios/orcamentos.js';
import { criarCategoria } from '../servidor/banco/repositorios/categorias.js';
import {
  categoriaPrincipal,
  limiteVigente,
  montarOrcamento,
  percentualConsumido,
  situacaoDoOrcamento,
} from '../servidor/dominio/orcamento.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaCompra, novaConta, novaMov, novoCartao } from './ajuda.js';

const MES = '2026-06';
const limite = async (db, categoria, centavos, mes = MES) =>
  await definirLimite(db, categoria.id, { mes_inicio: mes, limite_centavos: centavos }, CTX);
const item = (o, nome) => o.itens.find((i) => i.nome === nome);

test('RF-11: o limite vale do mês de início em diante e meses anteriores não mudam', () => {
  const registros = [
    { categoria_id: 1, mes_inicio: '2026-03', limite_centavos: 50000 },
    { categoria_id: 1, mes_inicio: '2026-06', limite_centavos: 80000 },
    { categoria_id: 2, mes_inicio: '2026-01', limite_centavos: 10000 },
  ];
  assert.equal(limiteVigente(registros, 1, '2026-02'), null, 'antes do primeiro registro não há limite');
  assert.equal(limiteVigente(registros, 1, '2026-03'), 50000);
  assert.equal(limiteVigente(registros, 1, '2026-05'), 50000, 'o mês seguinte herda o limite anterior');
  assert.equal(limiteVigente(registros, 1, '2026-06'), 80000);
  assert.equal(limiteVigente(registros, 1, '2027-01'), 80000);
  assert.equal(limiteVigente(registros, 2, '2026-06'), 10000, 'cada categoria tem a sua vigência');
});

test('RF-11: limite zero tira o orçamento daquele mês em diante, sem apagar o passado', () => {
  const registros = [
    { categoria_id: 1, mes_inicio: '2026-03', limite_centavos: 50000 },
    { categoria_id: 1, mes_inicio: '2026-08', limite_centavos: 0 },
  ];
  assert.equal(limiteVigente(registros, 1, '2026-07'), 50000);
  assert.equal(limiteVigente(registros, 1, '2026-08'), null);
  assert.equal(limiteVigente(registros, 1, '2026-12'), null);
});

test('RF-11: a situação é calculada em centavos: ok, atenção a partir de 80% e estourado só acima do limite', () => {
  assert.equal(situacaoDoOrcamento(0, 10000), 'ok');
  assert.equal(situacaoDoOrcamento(7999, 10000), 'ok');
  assert.equal(situacaoDoOrcamento(8000, 10000), 'atencao');
  assert.equal(situacaoDoOrcamento(10000, 10000), 'atencao', 'gastar exatamente o limite ainda não estoura');
  assert.equal(situacaoDoOrcamento(10001, 10000), 'estourado');
  assert.equal(percentualConsumido(13000, 10000), 130);
  assert.equal(percentualConsumido(-500, 10000), 0, 'estorno maior que o gasto não gera percentual negativo');
});

test('RF-11: subcategorias somam na categoria principal', () => {
  const categorias = [
    { id: 1, nome: 'Alimentação', tipo: 'despesa', pai_id: null },
    { id: 2, nome: 'Mercado', tipo: 'despesa', pai_id: 1 },
    { id: 3, nome: 'Lazer', tipo: 'despesa', pai_id: null },
  ];
  assert.equal(categoriaPrincipal(categorias, 2), 1);
  assert.equal(categoriaPrincipal(categorias, 1), 1);
  assert.equal(categoriaPrincipal(categorias, null), null);
  const o = montarOrcamento({
    mes: MES,
    categorias,
    registros: [{ categoria_id: 1, mes_inicio: MES, limite_centavos: 100000 }],
    realizado: [
      { categoria_id: 1, valor_centavos: 10000 },
      { categoria_id: 2, valor_centavos: 25000 },
    ],
    previsto: [],
  });
  assert.equal(item(o, 'Alimentação').realizado_centavos, 35000);
  assert.equal(item(o, 'Alimentação').restante_centavos, 65000);
});

test('RF-11 e RF-02: realizado, previsto e projetado ficam em campos separados e a situação olha só o realizado', () => {
  const categorias = [{ id: 1, nome: 'Lazer', tipo: 'despesa', pai_id: null }];
  const registros = [{ categoria_id: 1, mes_inicio: MES, limite_centavos: 10000 }];
  const o = montarOrcamento({
    mes: MES,
    categorias,
    registros,
    realizado: [{ categoria_id: 1, valor_centavos: 6000 }],
    previsto: [{ categoria_id: 1, valor_centavos: 7000 }],
  });
  const lazer = item(o, 'Lazer');
  assert.equal(lazer.realizado_centavos, 6000);
  assert.equal(lazer.previsto_centavos, 7000);
  assert.equal(lazer.projetado_centavos, 13000);
  assert.equal(lazer.restante_centavos, 4000, 'o restante desconta só o realizado');
  assert.equal(lazer.situacao, 'ok', 'conta a pagar pendente não estoura o orçamento sozinha');
  assert.equal(lazer.vai_estourar, true, 'mas o projetado avisa que vai passar do limite');
});

test('RF-11: categoria sem orçamento não aparece nos itens e o que ela gastou fica em "sem orçamento"', () => {
  const categorias = [
    { id: 1, nome: 'Lazer', tipo: 'despesa', pai_id: null },
    { id: 2, nome: 'Saúde', tipo: 'despesa', pai_id: null },
    { id: 3, nome: 'Salário', tipo: 'receita', pai_id: null },
  ];
  const o = montarOrcamento({
    mes: MES,
    categorias,
    registros: [{ categoria_id: 1, mes_inicio: MES, limite_centavos: 10000 }],
    realizado: [
      { categoria_id: 1, valor_centavos: 1000 },
      { categoria_id: 2, valor_centavos: 5000 },
      { categoria_id: null, valor_centavos: 300 },
    ],
    previsto: [],
  });
  assert.deepEqual(o.itens.map((i) => i.nome), ['Lazer']);
  assert.deepEqual(o.sem_orcamento.map((s) => [s.nome, s.realizado_centavos]), [['Saúde', 5000], ['Sem categoria', 300]]);
  assert.equal(o.totais.limite_centavos, 10000);
  assert.equal(o.totais.realizado_centavos, 1000, 'o total só soma categorias com orçamento');
});

test('RF-11: o gasto da categoria inclui compra no cartão, desconta estorno e conta o lançamento dividido em cada categoria', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'Conta A', 1000000);
  const cartao = await novoCartao(db);
  const lazer = await categoriaPorNome(db, 'Lazer');
  const mercado = await categoriaPorNome(db, 'Mercado'); // subcategoria de Alimentação
  const alimentacao = await categoriaPorNome(db, 'Alimentação');
  const vestuario = await categoriaPorNome(db, 'Vestuário');
  await limite(db, lazer, 50000);
  await limite(db, alimentacao, 100000);

  await novaMov(db, { conta_id: conta.id, categoria_id: lazer.id, valor_centavos: 10000 });
  await novaMov(db, { conta_id: conta.id, categoria_id: mercado.id, valor_centavos: 20000 });
  await novaMov(db, {
    conta_id: conta.id,
    valor_centavos: 9000,
    categoria_id: null,
    divisoes: [
      { categoria_id: lazer.id, valor_centavos: 4000 },
      { categoria_id: vestuario.id, valor_centavos: 5000 },
    ],
  });
  const compra = await novaCompra(db, cartao, { categoria_id: lazer.id, valor_total_centavos: 12000, data_compra: '2026-06-05' });
  await estornarCompra(db, compra.id, { valor_centavos: 2000, data_estorno: '2026-06-12' }, CTX);

  const o = await orcamentoDoMes(db, MES);
  // Lazer: 10.000 + 4.000 (divisão) + 12.000 (cartão) − 2.000 (estorno)
  assert.equal(item(o, 'Lazer').realizado_centavos, 24000);
  assert.equal(item(o, 'Alimentação').realizado_centavos, 20000, 'a subcategoria Mercado soma na principal');
  assert.equal(o.sem_orcamento.find((s) => s.nome === 'Vestuário').realizado_centavos, 5000);
});

test('RF-11: a previsão do mês vem de lançamentos pendentes e não entra no realizado', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db);
  const lazer = await categoriaPorNome(db, 'Lazer');
  await limite(db, lazer, 30000);
  await novaMov(db, { conta_id: conta.id, categoria_id: lazer.id, valor_centavos: 5000 });
  await novaMov(db, {
    conta_id: conta.id,
    categoria_id: lazer.id,
    valor_centavos: 40000,
    status: 'pendente',
    data_competencia: '2026-06-28',
    data_vencimento: '2026-06-28',
  });
  const lazerDoMes = item(await orcamentoDoMes(db, MES), 'Lazer');
  assert.equal(lazerDoMes.realizado_centavos, 5000);
  assert.equal(lazerDoMes.previsto_centavos, 40000);
  assert.equal(lazerDoMes.situacao, 'ok');
  assert.equal(lazerDoMes.vai_estourar, true);
});

test('RF-11: mudar o limite a partir de um mês não altera os meses anteriores', async () => {
  const db = await bancoComPadroes();
  const lazer = await categoriaPorNome(db, 'Lazer');
  await limite(db, lazer, 50000, '2026-04');
  await limite(db, lazer, 80000, '2026-07');
  assert.equal(item(await orcamentoDoMes(db, '2026-05'), 'Lazer').limite_centavos, 50000);
  assert.equal(item(await orcamentoDoMes(db, '2026-06'), 'Lazer').limite_centavos, 50000);
  assert.equal(item(await orcamentoDoMes(db, '2026-07'), 'Lazer').limite_centavos, 80000);
  await limite(db, lazer, 0, '2026-09');
  assert.equal(item(await orcamentoDoMes(db, '2026-08'), 'Lazer').limite_centavos, 80000);
  assert.equal(item(await orcamentoDoMes(db, '2026-09'), 'Lazer'), undefined);
});

test('RF-11 e RF-10: sem nenhum limite em vigor não há bloco de orçamento (nada de zero falso)', async () => {
  const db = await bancoComPadroes();
  assert.equal(await orcamentoSeExistir(db, MES), null);
  const lazer = await categoriaPorNome(db, 'Lazer');
  await limite(db, lazer, 10000, '2026-08');
  assert.equal(await orcamentoSeExistir(db, MES), null, 'o limite só começa em agosto');
  assert.ok(await orcamentoSeExistir(db, '2026-08'));
  await limite(db, lazer, 0, '2026-08');
  assert.equal(await orcamentoSeExistir(db, '2026-08'), null, 'limite zerado volta a não ter orçamento');
});

test('RF-11: só categoria principal de despesa recebe limite, e arquivada não recebe novo limite', async () => {
  const db = await bancoComPadroes();
  const recusa = async (id, centavos, campo = 'categoria_id') =>
    await assert.rejects(
      async () => await definirLimite(db, id, { mes_inicio: MES, limite_centavos: centavos }, CTX),
      (e) => e.statusCode === 400 && Boolean(e.campos[campo]),
    );
  await recusa((await categoriaPorNome(db, 'Mercado')).id, 1000);
  await recusa((await categoriaPorNome(db, 'Salário')).id, 1000);
  await recusa(99999, 1000);
  const extra = await criarCategoria(db, { nome: 'Pets', tipo: 'despesa', arquivada: true }, CTX);
  await recusa(extra.id, 1000);
  assert.ok(await definirLimite(db, extra.id, { mes_inicio: MES, limite_centavos: 0 }, CTX), 'zerar uma arquivada é permitido');
});
