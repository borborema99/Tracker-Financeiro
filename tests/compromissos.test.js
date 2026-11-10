import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarCompromissos } from '../servidor/banco/repositorios/compromissos.js';
import { alertasDoApp, calendarioDoMes, fluxoDeCaixa, projecaoDeSaldo } from '../servidor/banco/repositorios/fluxo.js';
import { baixarParcial, liquidarMovimentacao, obterMovimentacao, reagendar } from '../servidor/banco/repositorios/movimentacoes.js';
import { criarRecorrencia, gerarOcorrencias } from '../servidor/banco/repositorios/recorrencias.js';
import { pagarFatura } from '../servidor/banco/repositorios/cartoes.js';
import { CTX, bancoComPadroes, categoriaPorNome, novaCompra, novaConta, novaMov, novoCartao, saldoDe } from './ajuda.js';

const pendente = async (db, conta, extra = {}) =>
  await novaMov(db, { conta_id: conta.id, status: 'pendente', descricao: 'Conta', valor_centavos: 1000, data_vencimento: '2026-06-20', ...extra });
const filtros = { tipo: 'despesa', pagina: 1, por_pagina: 50 };

test('baixa parcial: liquida só o valor baixado e deixa o restante pendente, com o mesmo vencimento', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 5000);
  const m = await pendente(db, conta);
  const { liquidada, restante } = await baixarParcial(db, m.id, { valor_centavos: 400 }, CTX);

  assert.equal(liquidada.id, m.id);
  assert.equal(liquidada.status, 'liquidada');
  assert.equal(liquidada.valor_centavos, 400);
  assert.equal(liquidada.data_liquidacao, CTX.hoje);
  assert.equal(restante.status, 'pendente');
  assert.equal(restante.valor_centavos, 600);
  assert.equal(restante.baixa_de_id, m.id);
  assert.equal(restante.data_vencimento, '2026-06-20');
  assert.equal(await saldoDe(db, conta.id), 5000 - 400);
  assert.equal((await listarCompromissos(db, filtros, CTX.hoje)).totais.total_centavos, 600);
  // soma do que foi baixado + o que falta = valor original
  assert.equal(liquidada.valor_centavos + restante.valor_centavos, 1000);
});

test('baixa parcial: baixar de novo o restante até zerar; valor maior que o saldo é recusado', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 5000);
  const m = await pendente(db, conta);
  const { restante } = await baixarParcial(db, m.id, { valor_centavos: 400 }, CTX);
  await assert.rejects(async () => await baixarParcial(db, restante.id, { valor_centavos: 601 }, CTX), (e) => e.statusCode === 400 && 'valor_centavos' in e.campos);

  const fim = await baixarParcial(db, restante.id, { valor_centavos: 600, data_liquidacao: '2026-06-14' }, CTX);
  assert.equal(fim.restante, null);
  assert.equal(fim.liquidada.status, 'liquidada');
  assert.equal(fim.liquidada.data_liquidacao, '2026-06-14');
  assert.equal(await saldoDe(db, conta.id), 4000);
  assert.equal((await listarCompromissos(db, filtros, CTX.hoje)).total, 0);
});

test('baixa parcial: recusa liquidada, dividida, com reembolso, data futura e transferência', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 5000);
  const b = await novaConta(db, 'B');
  const paga = await novaMov(db, { conta_id: a.id });
  await assert.rejects(async () => await baixarParcial(db, paga.id, { valor_centavos: 100 }, CTX), (e) => e.statusCode === 409);

  const mercado = await categoriaPorNome(db, 'Mercado');
  const lazer = await categoriaPorNome(db, 'Lazer');
  const dividida = await pendente(db, a, {
    categoria_id: null,
    divisoes: [{ categoria_id: mercado.id, valor_centavos: 600 }, { categoria_id: lazer.id, valor_centavos: 400 }],
  });
  await assert.rejects(async () => await baixarParcial(db, dividida.id, { valor_centavos: 100 }, CTX), (e) => e.statusCode === 409);

  const comReembolso = await pendente(db, a);
  await novaMov(db, { tipo: 'receita', conta_id: a.id, valor_centavos: 100, reembolso_de_id: comReembolso.id });
  await assert.rejects(async () => await baixarParcial(db, comReembolso.id, { valor_centavos: 100 }, CTX), (e) => e.statusCode === 409);

  const simples = await pendente(db, a);
  await assert.rejects(async () => await baixarParcial(db, simples.id, { valor_centavos: 100, data_liquidacao: '2026-07-01' }, CTX), (e) => 'data_liquidacao' in e.campos);

  const transf = await novaMov(db, { tipo: 'transferencia', conta_id: a.id, conta_destino_id: b.id, status: 'pendente' });
  await assert.rejects(async () => await baixarParcial(db, transf.id, { valor_centavos: 100 }, CTX), (e) => e.statusCode === 404);
  await assert.rejects(async () => await baixarParcial(db, 9999, { valor_centavos: 100 }, CTX), (e) => e.statusCode === 404);
});

test('baixa parcial de ocorrência recorrente: o restante sai da série e nada é gerado em duplicidade', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 5000);
  const r = await criarRecorrencia(
    db,
    { tipo: 'despesa', descricao: 'Internet', valor_centavos: 1000, conta_id: conta.id, categoria_id: null, frequencia: 'mensal', data_inicio: '2026-06-15', data_fim: null, ativa: true, observacao: '' },
    CTX,
  );
  const primeira = (await db.um('SELECT id FROM movimentacoes WHERE recorrencia_id = ? ORDER BY data_ocorrencia', [r.id]));
  const { liquidada, restante } = await baixarParcial(db, primeira.id, { valor_centavos: 300 }, CTX);
  assert.equal(liquidada.recorrencia_id, r.id);
  assert.equal(restante.recorrencia_id, null);
  assert.equal(await gerarOcorrencias(db, CTX), 0);
  assert.equal((await db.um('SELECT COUNT(*) AS n FROM movimentacoes WHERE recorrencia_id = ? AND excluida_em IS NULL', [r.id])).n, 3);
});

test('reagendar muda só o vencimento; liquidada e transferência não reagendam; fica no audit_log', async () => {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'A', 5000);
  const m = await pendente(db, conta, { data_competencia: '2026-06-10' });
  const novo = await reagendar(db, m.id, { data_vencimento: '2026-07-05' }, CTX);
  assert.equal(novo.data_vencimento, '2026-07-05');
  assert.equal(novo.data_competencia, '2026-06-10');
  const log = (await db.um("SELECT antes, depois FROM audit_log WHERE entidade = 'movimentacao' AND entidade_id = ? AND acao = 'editar'", [String(m.id)]));
  assert.equal(log.antes.data_vencimento, '2026-06-20');
  assert.equal(log.depois.data_vencimento, '2026-07-05');

  // reagendar uma atrasada tira do atraso (a situação é recalculada)
  const velha = await pendente(db, conta, { data_vencimento: '2026-06-01' });
  assert.equal((await listarCompromissos(db, { ...filtros, situacao: 'atrasada' }, CTX.hoje)).total, 1);
  await reagendar(db, velha.id, { data_vencimento: '2026-06-30' }, CTX);
  assert.equal((await listarCompromissos(db, { ...filtros, situacao: 'atrasada' }, CTX.hoje)).total, 0);

  await liquidarMovimentacao(db, m.id, null, CTX);
  await assert.rejects(async () => await reagendar(db, m.id, { data_vencimento: '2026-08-01' }, CTX), (e) => e.statusCode === 409);
  assert.equal((await obterMovimentacao(db, m.id)).data_vencimento, '2026-07-05');
});

test('fluxo realizado: só liquidado entra; transferência é neutra; pagamento de fatura sai, a compra no cartão não', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 100000);
  const b = await novaConta(db, 'B');
  await novaMov(db, { tipo: 'receita', conta_id: a.id, valor_centavos: 5000, data_competencia: '2026-06-02', data_liquidacao: '2026-06-02' });
  await novaMov(db, { conta_id: a.id, valor_centavos: 2000, data_competencia: '2026-06-03', data_liquidacao: '2026-06-03' });
  await novaMov(db, { tipo: 'transferencia', conta_id: a.id, conta_destino_id: b.id, valor_centavos: 9000, data_competencia: '2026-06-04', data_liquidacao: '2026-06-04' });
  await pendente(db, a, { valor_centavos: 777 });
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { valor_total_centavos: 30000, data_compra: '2026-06-05' });
  const antes = await fluxoDeCaixa(db, { de: '2026-06-01', ate: '2026-06-30', agrupar: 'mes' });
  assert.deepEqual(antes.totais, { entradas_centavos: 5000, saidas_centavos: 2000, resultado_centavos: 3000 });

  const fatura = (await db.um('SELECT id FROM faturas', []));
  await pagarFatura(db, fatura.id, { conta_id: a.id, valor_centavos: 12000, data_pagamento: '2026-06-12' }, CTX);
  const depois = await fluxoDeCaixa(db, { de: '2026-06-01', ate: '2026-06-30', agrupar: 'semana' });
  assert.equal(depois.totais.saidas_centavos, 14000);
  assert.ok(depois.periodos.length >= 2);
});

test('projeção: saldo atual + pendentes no vencimento + faturas em aberto no vencimento da fatura', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 10000);
  await pendente(db, a, { valor_centavos: 3000, data_vencimento: '2026-06-20' });
  await novaMov(db, { tipo: 'receita', conta_id: a.id, status: 'pendente', valor_centavos: 500, data_vencimento: '2026-06-25' });
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { valor_total_centavos: 4000, data_compra: '2026-06-05' }); // fatura de junho vence 17/06

  const p = await projecaoDeSaldo(db, CTX.hoje, 30);
  assert.equal(p.saldo_inicial_centavos, 10000);
  assert.equal(p.serie.find((d) => d.data === '2026-06-17').saldo_centavos, 6000);
  assert.equal(p.serie.find((d) => d.data === '2026-06-20').saldo_centavos, 3000);
  assert.equal(p.saldo_final_centavos, 3500);
  assert.deepEqual(p.periodos_negativos, []);
});

test('alertas: atraso e vencimento próximo aparecem; resolvidos somem', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 100000);
  assert.equal((await alertasDoApp(db, CTX.hoje)).total, 0);

  const velha = await pendente(db, a, { descricao: 'Luz', data_vencimento: '2026-06-01' });
  await pendente(db, a, { descricao: 'Água', data_vencimento: '2026-06-17' });
  const codigos = (await alertasDoApp(db, CTX.hoje)).alertas.map((x) => x.codigo);
  assert.ok(codigos.includes('atraso_pagar'));
  assert.ok(codigos.includes('vencimento_proximo'));

  await liquidarMovimentacao(db, velha.id, null, CTX);
  assert.ok(!(await alertasDoApp(db, CTX.hoje)).alertas.some((x) => x.codigo === 'atraso_pagar'));
});

test('alertas: saldo projetado negativo e fechamento de fatura', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 1000);
  await pendente(db, a, { valor_centavos: 5000, data_vencimento: '2026-06-28' });
  const cartao = await novoCartao(db); // fecha dia 10: a fatura de julho fecha em 10/07, longe de hoje
  await novaCompra(db, cartao, { valor_total_centavos: 100, data_compra: '2026-06-12' });
  const lista = (await alertasDoApp(db, CTX.hoje)).alertas.map((x) => x.codigo);
  assert.ok(lista.includes('saldo_negativo_projetado'));
  assert.ok(!lista.includes('fechamento_fatura'));
  assert.ok((await alertasDoApp(db, '2026-07-08')).alertas.some((x) => x.codigo === 'fechamento_fatura'));
});

test('calendário do mês: compromissos e vencimentos de fatura por dia, com a situação de cada um', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 100000);
  await pendente(db, a, { descricao: 'Luz', data_vencimento: '2026-06-10' });
  await novaMov(db, { tipo: 'receita', conta_id: a.id, status: 'pendente', valor_centavos: 5000, data_vencimento: '2026-06-10' });
  await pendente(db, a, { descricao: 'Fora', data_vencimento: '2026-07-10' });
  const cartao = await novoCartao(db);
  await novaCompra(db, cartao, { valor_total_centavos: 4000, data_compra: '2026-06-05' });

  const cal = await calendarioDoMes(db, '2026-06', CTX.hoje);
  assert.deepEqual(cal.dias.map((d) => d.data), ['2026-06-10', '2026-06-17']);
  const dia10 = cal.dias[0];
  assert.equal(dia10.entradas_centavos, 5000);
  assert.equal(dia10.saidas_centavos, 1000);
  assert.ok(dia10.itens.every((i) => i.situacao === 'atrasada'));
  const fatura = cal.dias[1].itens[0];
  assert.equal(fatura.tipo, 'fatura');
  assert.equal(fatura.situacao, 'a_vencer');
});

test('compromissos: listam só pendentes de receita/despesa, do vencimento mais antigo ao mais novo, e paginam', async () => {
  const db = await bancoComPadroes();
  const a = await novaConta(db, 'A', 100000);
  const b = await novaConta(db, 'B');
  await pendente(db, a, { descricao: 'C', data_vencimento: '2026-06-30' });
  await pendente(db, a, { descricao: 'A', data_vencimento: '2026-06-01' });
  await pendente(db, a, { descricao: 'B', data_vencimento: null, data_competencia: '2026-06-12' });
  await novaMov(db, { conta_id: a.id }); // liquidada: fora
  await novaMov(db, { tipo: 'transferencia', conta_id: a.id, conta_destino_id: b.id, status: 'pendente' }); // fora
  await novaMov(db, { tipo: 'receita', conta_id: a.id, status: 'pendente', data_vencimento: '2026-06-20' }); // outro tipo

  const lista = await listarCompromissos(db, filtros, CTX.hoje);
  assert.deepEqual(lista.itens.map((i) => i.descricao), ['A', 'B', 'C']);
  assert.equal(lista.total, 3);
  assert.equal(lista.itens[0].dias_de_atraso, 14);
  assert.equal(lista.itens[1].vencimento, '2026-06-12');
  const pagina2 = await listarCompromissos(db, { ...filtros, por_pagina: 2, pagina: 2 }, CTX.hoje);
  assert.deepEqual(pagina2.itens.map((i) => i.descricao), ['C']);
  assert.equal((await listarCompromissos(db, { ...filtros, tipo: 'receita' }, CTX.hoje)).total, 1);
});
