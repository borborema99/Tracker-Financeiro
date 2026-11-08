import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maioresDespesas } from '../servidor/dominio/relatorio.js';
import { HOST, ORIGEM, appDeTeste, entrar } from './ajuda.js';

test('RF-24: o ranking vai da maior despesa para a menor, desempata pela mais recente e respeita o limite', () => {
  const itens = [
    { descricao: 'a', valor_centavos: 100, data: '2026-06-01' },
    { descricao: 'b', valor_centavos: 500, data: '2026-06-02' },
    { descricao: 'c', valor_centavos: 500, data: '2026-06-09' },
    { descricao: 'd', valor_centavos: 300, data: '2026-06-03' },
  ];
  assert.deepEqual(maioresDespesas(itens, 3).map((i) => i.descricao), ['c', 'b', 'd']);
  assert.equal(itens[0].descricao, 'a', 'não altera a lista original');
});

async function sessao(t) {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  const { cookie, csrf } = await entrar(ctx.app);
  return (method, url, payload) =>
    ctx.app.inject({ method, url, headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf }, payload });
}

const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test('API relatórios: exigem sessão e validam o período', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of ['/api/relatorios/evolucao', '/api/relatorios/categorias', '/api/relatorios/maiores-despesas']) {
    assert.equal((await app.inject({ method: 'GET', url, headers: { host: HOST } })).statusCode, 401, url);
  }
  const chamar = await sessao(t);
  const ruim = (url) => chamar('GET', url).then((r) => r.statusCode);
  assert.equal(await ruim('/api/relatorios/categorias?de=2026-06-10'), 400);
  assert.equal(await ruim('/api/relatorios/categorias?de=2026-06-10&ate=2026-06-01'), 400);
  assert.equal(await ruim('/api/relatorios/categorias?de=2024-01-01&ate=2026-06-01'), 400);
  assert.equal(await ruim('/api/relatorios/categorias?de=2026-13-01&ate=2026-14-01'), 400);
  assert.equal(await ruim('/api/relatorios/evolucao?meses=0'), 400);
  assert.equal(await ruim('/api/relatorios/evolucao?meses=25'), 400);
  assert.equal(await ruim('/api/relatorios/maiores-despesas?limite=51'), 400);
  assert.equal(await ruim('/api/relatorios/categorias?tipo=outro'), 400);
});

test('API relatórios: sem dados o mês atual vem vazio e, com dados, os relatórios batem com o resumo', async (t) => {
  const chamar = await sessao(t);
  const vazio = (await chamar('GET', '/api/relatorios/categorias')).json();
  assert.equal(vazio.total_centavos, 0);
  assert.deepEqual(vazio.itens, []);
  assert.equal((await chamar('GET', '/api/relatorios/evolucao')).json().media, null);

  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0 })).json();
  const base = { descricao: 'Compra grande', data_competencia: hoje(), status: 'liquidada', observacao: '', divisoes: [], tarifa_centavos: 0, conta_id: conta.id };
  assert.equal((await chamar('POST', '/api/movimentacoes', { ...base, tipo: 'despesa', valor_centavos: 90000 })).statusCode, 201);
  assert.equal((await chamar('POST', '/api/movimentacoes', { ...base, descricao: 'Pequena', tipo: 'despesa', valor_centavos: 1500 })).statusCode, 201);
  assert.equal((await chamar('POST', '/api/movimentacoes', { ...base, descricao: 'Salário', tipo: 'receita', valor_centavos: 300000 })).statusCode, 201);

  const resumo = (await chamar('GET', '/api/resumo')).json();
  const categorias = (await chamar('GET', '/api/relatorios/categorias')).json();
  assert.equal(categorias.total_centavos, resumo.realizado.despesas);
  const evolucao = (await chamar('GET', '/api/relatorios/evolucao?meses=3')).json();
  assert.equal(evolucao.meses.length, 3);
  assert.deepEqual(evolucao.meses[2], { mes: resumo.mes, ...resumo.realizado });

  const maiores = (await chamar('GET', '/api/relatorios/maiores-despesas?limite=1')).json();
  assert.equal(maiores.itens.length, 1);
  assert.equal(maiores.itens[0].descricao, 'Compra grande');
  assert.equal(maiores.itens[0].origem, 'lancamento');
});
