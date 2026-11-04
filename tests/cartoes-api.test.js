import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOST, ORIGEM, appDeTeste, entrar } from './ajuda.js';

async function sessao(t) {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  const { cookie, csrf } = await entrar(ctx.app);
  const chamar = (method, url, payload, { semCsrf = false } = {}) =>
    ctx.app.inject({
      method,
      url,
      headers: { host: HOST, origin: ORIGEM, cookie, ...(semCsrf ? {} : { 'x-csrf-token': csrf }) },
      payload,
    });
  return { ...ctx, chamar };
}

const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
const cartaoBase = (extra = {}) => ({
  nome: 'Cartão A', limite_centavos: 500000, dia_fechamento: 10, dia_vencimento: 17, conta_pagamento_id: null, ...extra,
});
const compraBase = (cartaoId, extra = {}) => ({
  cartao_id: cartaoId, descricao: 'Mercado', valor_total_centavos: 12000, data_compra: hoje(), parcelas_total: 3, ...extra,
});

test('API: as rotas de cartões exigem sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of [
    '/api/cartoes', '/api/cartoes/1', '/api/cartoes/1/faturas', '/api/cartoes/1/projecao', '/api/cartoes/1/compras',
    '/api/faturas/1', '/api/compras-cartao/1',
  ]) {
    const res = await app.inject({ method: 'GET', url, headers: { host: HOST } });
    assert.equal(res.statusCode, 401, url);
  }
});

test('API: escrita de cartão exige o token CSRF', async (t) => {
  const { chamar } = await sessao(t);
  const res = await chamar('POST', '/api/cartoes', cartaoBase(), { semCsrf: true });
  assert.equal(res.statusCode, 403);
});

test('RF-10: sem cartão cadastrado o resumo não traz bloco de cartões (nada de zero falso)', async (t) => {
  const { chamar } = await sessao(t);
  await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0 });
  const antes = (await chamar('GET', '/api/resumo')).json();
  assert.equal('cartoes' in antes, false);

  await chamar('POST', '/api/cartoes', cartaoBase());
  const depois = (await chamar('GET', '/api/resumo')).json();
  assert.equal(depois.cartoes.limite_total_centavos, 500000);
  assert.equal(depois.cartoes.limite_disponivel_centavos, 500000);
});

test('API: fluxo do cartão — compra parcelada, fatura, pagamento, estorno e exclusão', async (t) => {
  const { chamar } = await sessao(t);
  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 100000 })).json();
  const cartaoCriado = await chamar('POST', '/api/cartoes', cartaoBase({ conta_pagamento_id: conta.id }));
  assert.equal(cartaoCriado.statusCode, 201);
  const cartao = cartaoCriado.json();

  const compraRes = await chamar('POST', '/api/compras-cartao', compraBase(cartao.id));
  assert.equal(compraRes.statusCode, 201);
  const { compra, avisos } = compraRes.json();
  assert.deepEqual(avisos, []);
  assert.deepEqual(compra.parcelas.map((p) => p.valor_centavos), [4000, 4000, 4000]);

  const faturas = (await chamar('GET', `/api/cartoes/${cartao.id}/faturas`)).json().itens;
  assert.equal(faturas.length, 3);
  assert.ok(faturas.every((f) => ['aberta', 'fechada', 'parcial', 'paga', 'atrasada'].includes(f.status)));

  const resumo = (await chamar('GET', '/api/resumo')).json();
  assert.equal(resumo.realizado.despesas, 12000, 'compra no cartão é despesa realizada uma vez');
  assert.equal(resumo.saldos.total_centavos, 100000, 'e não mexe no saldo');

  const alvo = faturas.find((f) => f.saldo_centavos > 0);
  const pagamento = await chamar('POST', `/api/faturas/${alvo.id}/pagamentos`, { valor_centavos: 1000, conta_id: conta.id });
  assert.equal(pagamento.statusCode, 201);
  assert.equal(pagamento.json().pago_centavos, 1000);
  assert.equal((await chamar('GET', '/api/resumo')).json().saldos.total_centavos, 99000);
  assert.equal((await chamar('GET', '/api/resumo')).json().realizado.despesas, 12000, 'pagar fatura não é despesa nova');
  const movs = (await chamar('GET', '/api/movimentacoes')).json();
  assert.equal(movs.total, 0, 'pagamento de fatura não vira lançamento');

  const estorno = await chamar('POST', `/api/compras-cartao/${compra.id}/estornos`, { valor_centavos: 2000 });
  assert.equal(estorno.statusCode, 201);
  assert.equal(estorno.json().valor_liquido_centavos, 10000);

  const projecao = (await chamar('GET', `/api/cartoes/${cartao.id}/projecao`)).json();
  assert.ok(projecao.itens.length >= 1);

  assert.equal((await chamar('DELETE', `/api/compras-cartao/${compra.id}`)).statusCode, 409, 'fatura com pagamento maior que o novo total');
  await chamar('DELETE', `/api/pagamentos-fatura/${pagamento.json().pagamentos[0].id}`);
  assert.equal((await chamar('DELETE', `/api/compras-cartao/${compra.id}`)).statusCode, 204);
  assert.deepEqual((await chamar('GET', `/api/cartoes/${cartao.id}/faturas`)).json().itens, []);
});

test('API: valida os dados do cartão e da compra e responde 404 no que não existe', async (t) => {
  const { chamar } = await sessao(t);
  const ruim = await chamar('POST', '/api/cartoes', cartaoBase({ dia_fechamento: 31 }));
  assert.equal(ruim.statusCode, 400);
  assert.ok(ruim.json().campos.dia_fechamento);

  const cartao = (await chamar('POST', '/api/cartoes', cartaoBase())).json();
  const repetido = await chamar('POST', '/api/cartoes', cartaoBase());
  assert.equal(repetido.statusCode, 400, 'nome repetido');

  const semParcelas = await chamar('POST', '/api/compras-cartao', compraBase(cartao.id, { parcelas_total: 0 }));
  assert.equal(semParcelas.statusCode, 400);
  const pequeno = await chamar('POST', '/api/compras-cartao', compraBase(cartao.id, { valor_total_centavos: 2, parcelas_total: 3 }));
  assert.equal(pequeno.statusCode, 400);
  const semCartao = await chamar('POST', '/api/compras-cartao', compraBase(999));
  assert.equal(semCartao.statusCode, 400);

  for (const [metodo, url] of [
    ['GET', '/api/cartoes/999'], ['GET', '/api/compras-cartao/999'], ['GET', '/api/faturas/999'],
    ['DELETE', '/api/compras-cartao/999'], ['DELETE', '/api/estornos-cartao/999'], ['DELETE', '/api/pagamentos-fatura/999'],
  ]) {
    assert.equal((await chamar(metodo, url)).statusCode, 404, `${metodo} ${url}`);
  }
});

test('API: o reembolso de uma despesa chega ligado ao original', async (t) => {
  const { chamar } = await sessao(t);
  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0 })).json();
  const base = { descricao: 'Almoço', conta_id: conta.id, data_competencia: hoje() };
  const despesa = (await chamar('POST', '/api/movimentacoes', { ...base, tipo: 'despesa', valor_centavos: 5000 })).json().movimentacao;
  const reembolso = await chamar('POST', '/api/movimentacoes', {
    ...base, descricao: 'Reembolso do almoço', tipo: 'receita', valor_centavos: 2000, reembolso_de_id: despesa.id,
  });
  assert.equal(reembolso.statusCode, 201);
  assert.equal(reembolso.json().movimentacao.reembolso_de_id, despesa.id);
  const original = (await chamar('GET', `/api/movimentacoes/${despesa.id}`)).json();
  assert.equal(original.reembolsado_centavos, 2000);
  assert.equal((await chamar('DELETE', `/api/movimentacoes/${despesa.id}`)).statusCode, 409);
});
