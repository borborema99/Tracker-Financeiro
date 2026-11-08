import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularPatrimonio } from '../servidor/dominio/patrimonio.js';
import { HOST, ORIGEM, appDeTeste, entrar } from './ajuda.js';

test('RF-21: patrimônio = contas + investimentos − cartão (faturas e parcelas futuras) − dívidas', () => {
  const p = calcularPatrimonio({
    contas: [{ saldo_centavos: 500000 }, { saldo_centavos: -20000 }],
    investimentos: { valor_atual_centavos: 300000 },
    cartoes: { faturas_nao_pagas_centavos: 80000, parcelas_futuras_centavos: 40000 },
    dividas: { restante_centavos: 200000 },
  });
  assert.equal(p.ativos.contas_centavos, 480000);
  assert.equal(p.ativos.investimentos_centavos, 300000);
  assert.equal(p.ativos.total_centavos, 780000);
  assert.equal(p.passivos.cartoes_centavos, 120000);
  assert.equal(p.passivos.dividas_centavos, 200000);
  assert.equal(p.passivos.total_centavos, 320000);
  assert.equal(p.patrimonio_liquido_centavos, 460000);
});

test('RF-21: parte de módulo que não existe fica fora (nada de zero falso) e o patrimônio pode ser negativo', () => {
  const p = calcularPatrimonio({ contas: [{ saldo_centavos: 10000 }], investimentos: null, cartoes: null, dividas: { restante_centavos: 50000 } });
  assert.deepEqual(Object.keys(p.ativos), ['contas_centavos', 'total_centavos']);
  assert.deepEqual(Object.keys(p.passivos), ['dividas_centavos', 'total_centavos']);
  assert.equal(p.patrimonio_liquido_centavos, -40000);
});

async function sessao(t) {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  const { cookie, csrf } = await entrar(ctx.app);
  const chamar = (method, url, payload) =>
    ctx.app.inject({ method, url, headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf }, payload });
  return chamar;
}

const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test('RF-21 e RF-10: pela API, o início só mostra patrimônio e carteira quando há investimento, cartão ou dívida', async (t) => {
  const chamar = await sessao(t);
  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 500000 })).json();

  let resumo = (await chamar('GET', '/api/resumo')).json();
  assert.equal(resumo.patrimonio, undefined);
  assert.equal(resumo.investimentos, undefined);
  const vazio = (await chamar('GET', '/api/patrimonio')).json();
  assert.equal(vazio.patrimonio_liquido_centavos, 500000);
  assert.equal(vazio.passivos.total_centavos, 0);
  assert.equal(vazio.passivos.cartoes_centavos, undefined);

  const inv = (await chamar('POST', '/api/investimentos', { nome: 'Tesouro', tipo: 'tesouro' })).json();
  assert.equal((await chamar('GET', '/api/resumo')).json().investimentos, undefined);
  const op = await chamar('POST', `/api/investimentos/${inv.id}/operacoes`, { tipo: 'aporte', valor_centavos: 100000, data: hoje(), conta_id: conta.id });
  assert.equal(op.statusCode, 201);
  await chamar('POST', `/api/investimentos/${inv.id}/avaliacoes`, { data: hoje(), valor_centavos: 105000 });

  resumo = (await chamar('GET', '/api/resumo')).json();
  assert.equal(resumo.saldos.total_centavos, 400000);
  assert.equal(resumo.investimentos.valor_atual_centavos, 105000);
  assert.equal(resumo.investimentos.resultado_centavos, 5000);
  assert.equal(resumo.patrimonio.patrimonio_liquido_centavos, 505000);
  assert.deepEqual(resumo.realizado, { receitas: 0, despesas: 0, resultado: 0 });

  const lista = (await chamar('GET', '/api/investimentos')).json();
  assert.equal(lista.itens.length, 1);
  assert.equal(lista.totais.valor_atual_centavos, 105000);
});

test('API investimentos: exigem sessão, validam o corpo e recusam excluir o que tem operações', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of ['/api/investimentos', '/api/investimentos/1', '/api/patrimonio']) {
    assert.equal((await app.inject({ method: 'GET', url, headers: { host: HOST } })).statusCode, 401, url);
  }

  const chamar = await sessao(t);
  assert.equal((await chamar('POST', '/api/investimentos', { nome: '', tipo: 'acoes' })).statusCode, 400);
  assert.equal((await chamar('POST', '/api/investimentos', { nome: 'X', tipo: 'nao-existe' })).statusCode, 400);
  const inv = (await chamar('POST', '/api/investimentos', { nome: 'Fundo', tipo: 'fundo' })).json();
  assert.equal((await chamar('POST', `/api/investimentos/${inv.id}/operacoes`, { tipo: 'resgate', valor_centavos: 100, data: hoje() })).statusCode, 409);
  await chamar('POST', `/api/investimentos/${inv.id}/operacoes`, { tipo: 'aporte', valor_centavos: 100, data: hoje() });
  assert.equal((await chamar('DELETE', `/api/investimentos/${inv.id}`)).statusCode, 409);
  assert.equal((await chamar('GET', '/api/investimentos/999')).statusCode, 404);
});
