import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarMovimentacoes, movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { esquemaFiltros } from '../contratos/movimentacoes.js';
import { bancoComPadroes, categoriaPorNome, novaConta, novaMov, saldoDe } from './ajuda.js';

const JUNHO = ['2026-06-01', '2026-06-30'];

function transferir(db, origem, destino, valor, extra = {}) {
  return novaMov(db, { tipo: 'transferencia', valor_centavos: valor, conta_id: origem.id, conta_destino_id: destino.id, ...extra });
}

test('RF-03: transferência liquidada tira da origem e põe no destino', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A', 100000);
  const b = novaConta(db, 'B', 0);
  transferir(db, a, b, 40000);
  assert.equal(saldoDe(db, a.id), 60000);
  assert.equal(saldoDe(db, b.id), 40000);
});

test('RF-03: transferência não é receita nem despesa realizada', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A', 100000);
  const b = novaConta(db, 'B', 0);
  transferir(db, a, b, 40000);
  assert.deepEqual(resumoRealizado(movimentacoesDoPeriodo(db, ...JUNHO), ...JUNHO), { receitas: 0, despesas: 0, resultado: 0 });
  const { totais } = listarMovimentacoes(db, esquemaFiltros.parse({}));
  assert.equal(totais.realizado.receitas, 0);
  assert.equal(totais.realizado.despesas, 0);
});

test('RF-03: a soma dos saldos não muda numa transferência sem tarifa', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A', 70000);
  const b = novaConta(db, 'B', 5000);
  const antes = saldoDe(db, a.id) + saldoDe(db, b.id);
  transferir(db, a, b, 12345);
  assert.equal(saldoDe(db, a.id) + saldoDe(db, b.id), antes);
});

test('RF-03: transferência pendente não altera nenhum saldo', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A', 1000);
  const b = novaConta(db, 'B', 0);
  transferir(db, a, b, 500, { status: 'pendente' });
  assert.equal(saldoDe(db, a.id), 1000);
  assert.equal(saldoDe(db, b.id), 0);
});

test('RF-03: a tarifa da transferência é despesa (na categoria de tarifas) e sai da origem', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A', 100000);
  const b = novaConta(db, 'B', 0);
  const t = transferir(db, a, b, 40000, { tarifa_centavos: 990, descricao: 'Reserva' });
  assert.equal(t.tarifa_centavos, 990);
  assert.equal(saldoDe(db, a.id), 100000 - 40000 - 990);
  assert.equal(saldoDe(db, b.id), 40000);

  const tarifa = db.prepare('SELECT * FROM movimentacoes WHERE transferencia_id = ?').get(t.id);
  assert.equal(tarifa.tipo, 'despesa');
  assert.equal(tarifa.valor_centavos, 990);
  assert.equal(tarifa.conta_id, a.id);
  assert.equal(tarifa.categoria_id, categoriaPorNome(db, 'Tarifas bancárias').id);
  assert.equal(tarifa.status, 'liquidada');

  const r = resumoRealizado(movimentacoesDoPeriodo(db, ...JUNHO), ...JUNHO);
  assert.deepEqual(r, { receitas: 0, despesas: 990, resultado: -990 });
});

test('RF-03: tarifa de transferência pendente é despesa prevista, não realizada', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A', 1000);
  const b = novaConta(db, 'B', 0);
  transferir(db, a, b, 500, { tarifa_centavos: 100, status: 'pendente', data_vencimento: '2026-06-20' });
  assert.equal(saldoDe(db, a.id), 1000);
  assert.equal(resumoRealizado(movimentacoesDoPeriodo(db, ...JUNHO), ...JUNHO).despesas, 0);
});

test('RF-03: liquidar a transferência liquida a tarifa junto', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A', 10000);
  const b = novaConta(db, 'B', 0);
  const t = transferir(db, a, b, 1000, { tarifa_centavos: 50, status: 'pendente' });
  assert.equal(saldoDe(db, a.id), 10000);
  return import('../servidor/banco/repositorios/movimentacoes.js').then(({ liquidarMovimentacao }) => {
    liquidarMovimentacao(db, t.id, '2026-06-12', { hoje: '2026-06-15', agora: new Date() });
    assert.equal(saldoDe(db, a.id), 10000 - 1000 - 50);
    assert.equal(saldoDe(db, b.id), 1000);
  });
});

test('RF-03: origem e destino precisam ser diferentes; transferência não tem categoria nem divisão', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A');
  const b = novaConta(db, 'B');
  const cat = categoriaPorNome(db, 'Salário');
  assert.throws(() => transferir(db, a, a, 100), (e) => Boolean(e.statusCode === 400 && e.campos.conta_destino_id));
  assert.throws(() => novaMov(db, { tipo: 'transferencia', valor_centavos: 100, conta_id: a.id }), (e) => Boolean(e.campos.conta_destino_id));
  assert.throws(() => transferir(db, a, b, 100, { categoria_id: cat.id }), (e) => Boolean(e.campos.categoria_id));
  assert.throws(
    () => transferir(db, a, b, 100, { divisoes: [{ categoria_id: cat.id, valor_centavos: 50 }, { categoria_id: cat.id, valor_centavos: 50 }] }),
    (e) => Boolean(e.campos.divisoes),
  );
});

test('RF-03: só transferência tem destino e tarifa', () => {
  const db = bancoComPadroes();
  const a = novaConta(db, 'A');
  const b = novaConta(db, 'B');
  assert.throws(() => novaMov(db, { conta_id: a.id, conta_destino_id: b.id }), (e) => Boolean(e.campos.conta_destino_id));
  assert.throws(() => novaMov(db, { conta_id: a.id, tarifa_centavos: 10 }), (e) => Boolean(e.campos.tarifa_centavos));
});
