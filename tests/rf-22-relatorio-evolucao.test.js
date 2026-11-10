import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estornarCompra } from '../servidor/banco/repositorios/cartoes.js';
import { evolucaoDoRealizado } from '../servidor/banco/repositorios/relatorios.js';
import { evolucaoMensal, mesesAteHoje } from '../servidor/dominio/relatorio.js';
import { CTX, bancoComPadroes, novaCompra, novaConta, novaMov, novoCartao } from './ajuda.js';

test('RF-22: a lista de meses termina no mês de hoje, do mais antigo ao mais novo, atravessando o ano', () => {
  assert.deepEqual(mesesAteHoje('2026-02-10', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(mesesAteHoje('2026-06-15', 1), ['2026-06']);
});

const mov = (tipo, valor, dia) => ({ tipo, valor_centavos: valor, status: 'liquidada', data_competencia: dia, data_vencimento: null, data_liquidacao: dia });

test('RF-22: cada mês soma o realizado do próprio mês; pendente e transferência não entram', () => {
  const movs = [
    mov('receita', 500000, '2026-04-05'),
    mov('despesa', 120000, '2026-04-20'),
    mov('despesa', 80000, '2026-05-02'),
    { ...mov('despesa', 99999, '2026-05-03'), status: 'pendente', data_liquidacao: null, data_vencimento: '2026-05-03' },
    mov('transferencia', 70000, '2026-05-10'),
  ];
  const { meses } = evolucaoMensal(movs, ['2026-04', '2026-05']);
  assert.deepEqual(meses, [
    { mes: '2026-04', receitas: 500000, despesas: 120000, resultado: 380000 },
    { mes: '2026-05', receitas: 0, despesas: 80000, resultado: -80000 },
  ]);
});

test('RF-22: a média só conta a partir do primeiro mês com movimento e é null se nunca houve movimento', () => {
  const movs = [mov('receita', 300000, '2026-04-05'), mov('despesa', 100000, '2026-05-05')];
  const { media } = evolucaoMensal(movs, ['2026-02', '2026-03', '2026-04', '2026-05']);
  assert.deepEqual(media, { meses_considerados: 2, receitas_centavos: 150000, despesas_centavos: 50000, resultado_centavos: 100000 });
  assert.equal(evolucaoMensal([], ['2026-04', '2026-05']).media, null);
});

test('RF-22: pelo banco, cada mês fecha com o realizado do resumo (cartão pela compra, estorno pela data dele)', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'Conta A', 1000000);
  const cartao = await novoCartao(db);
  await novaMov(db, { tipo: 'receita', conta_id: conta.id, valor_centavos: 400000, data_competencia: '2026-05-05', data_liquidacao: '2026-05-05' });
  await novaMov(db, { conta_id: conta.id, valor_centavos: 15000, data_competencia: '2026-05-20', data_liquidacao: '2026-05-20' });
  await novaMov(db, { conta_id: conta.id, valor_centavos: 25000, data_competencia: '2026-06-02', data_liquidacao: '2026-06-02' });
  const compra = await novaCompra(db, cartao, { valor_total_centavos: 30000, parcelas_total: 3, data_compra: '2026-05-25' });
  await estornarCompra(db, compra.id, { valor_centavos: 4000, data_estorno: '2026-06-12' }, CTX);

  const r = await evolucaoDoRealizado(db, CTX.hoje, 3);
  assert.equal(r.de, '2026-04-01');
  assert.equal(r.ate, '2026-06-30');
  const por = Object.fromEntries(r.meses.map((m) => [m.mes, m]));
  assert.deepEqual(por['2026-04'], { mes: '2026-04', receitas: 0, despesas: 0, resultado: 0 });
  assert.deepEqual(por['2026-05'], { mes: '2026-05', receitas: 400000, despesas: 45000, resultado: 355000 });
  assert.deepEqual(por['2026-06'], { mes: '2026-06', receitas: 0, despesas: 21000, resultado: -21000 });
});
