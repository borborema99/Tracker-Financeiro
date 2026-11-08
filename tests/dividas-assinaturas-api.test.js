import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOST, ORIGEM, appDeTeste, entrar } from './ajuda.js';

async function sessao(t) {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  const { cookie, csrf } = await entrar(ctx.app);
  const chamar = (method, url, payload) =>
    ctx.app.inject({ method, url, headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf }, payload });
  return { ...ctx, chamar };
}

const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dias = (n) => {
  const d = new Date(`${hoje()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const contaComSaldo = async (chamar) =>
  (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 500000 })).json();
const divida = (conta, extra = {}) => ({
  nome: 'Financiamento', credor: 'Banco X', valor_total_centavos: 120000, parcelas_total: 3,
  primeiro_vencimento: dias(10), conta_id: conta.id, ...extra,
});
const assinatura = (conta, extra = {}) => ({
  tipo: 'despesa', descricao: 'Streaming', valor_centavos: 3990, conta_id: conta.id, frequencia: 'mensal',
  data_inicio: dias(5), assinatura: true, ...extra,
});

test('API dívidas e assinaturas: as rotas exigem sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of ['/api/dividas', '/api/dividas/1', '/api/assinaturas']) {
    assert.equal((await app.inject({ method: 'GET', url, headers: { host: HOST } })).statusCode, 401, url);
  }
});

test('API dívidas: cria com parcelas, paga pelas rotas de compromissos e acompanha o saldo devedor', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);

  const criada = await chamar('POST', '/api/dividas', divida(conta));
  assert.equal(criada.statusCode, 201);
  const d = criada.json();
  assert.equal(d.parcelas.length, 3);
  assert.equal(d.restante_centavos, 120000);
  assert.equal(d.situacao, 'em_dia');

  const pendentes = (await chamar('GET', '/api/compromissos?tipo=despesa')).json();
  assert.equal(pendentes.total, 3);
  assert.equal(pendentes.itens[0].descricao, 'Financiamento (1/3)');

  const baixa = await chamar('POST', `/api/compromissos/${d.parcelas[0].lancamento_id}/baixa-parcial`, { valor_centavos: 10000 });
  assert.equal(baixa.statusCode, 200);
  const paga = await chamar('POST', `/api/movimentacoes/${d.parcelas[1].lancamento_id}/liquidar`, {});
  assert.equal(paga.statusCode, 200);

  const atual = (await chamar('GET', `/api/dividas/${d.id}`)).json();
  assert.equal(atual.pago_centavos, 50000);
  assert.equal(atual.restante_centavos, 70000);
  assert.equal(atual.parcelas_pagas, 1);
  assert.equal((await chamar('GET', '/api/dividas')).json().itens[0].restante_centavos, 70000);

  const resumo = (await chamar('GET', '/api/resumo')).json();
  assert.equal(resumo.dividas.restante_centavos, 70000);
  assert.equal(resumo.dividas.abertas, 1);
});

test('API dívidas: valida os dados (400 com campos), edita só os textos e exclui', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);

  for (const extra of [{ nome: ' ' }, { valor_total_centavos: 0 }, { parcelas_total: 0 }, { parcelas_total: 361 }, { parcelas_total: 2.5 }, { primeiro_vencimento: '2026-02-30' }]) {
    assert.equal((await chamar('POST', '/api/dividas', divida(conta, extra))).statusCode, 400, JSON.stringify(extra));
  }
  assert.equal((await chamar('POST', '/api/dividas', divida(conta, { conta_id: 999 }))).json().campos.conta_id, 'Conta não encontrada.');

  const d = (await chamar('POST', '/api/dividas', divida(conta))).json();
  const editada = await chamar('PUT', `/api/dividas/${d.id}`, { nome: 'Carro', credor: 'Banco Y', observacao: 'x', valor_total_centavos: 1 });
  assert.equal(editada.json().nome, 'Carro');
  assert.equal(editada.json().valor_total_centavos, 120000, 'o valor não muda pela edição');

  assert.equal((await chamar('DELETE', `/api/dividas/${d.id}`)).statusCode, 204);
  assert.equal((await chamar('GET', `/api/dividas/${d.id}`)).statusCode, 404);
  assert.equal((await chamar('GET', '/api/compromissos?tipo=despesa')).json().total, 0);
  assert.equal((await chamar('GET', '/api/resumo')).json().dividas, undefined, 'RF-10: sem dívida em aberto não há bloco');
  assert.equal((await chamar('DELETE', '/api/dividas/abc')).statusCode, 404);
});

test('API assinaturas: cria como recorrência marcada, calcula custos, pausa e reativa', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);

  assert.deepEqual((await chamar('GET', '/api/assinaturas')).json(), { itens: [], totais: { ativas: 0, pausadas: 0, anual_centavos: 0, mensal_centavos: 0 } });
  assert.equal((await chamar('GET', '/api/resumo')).json().assinaturas, undefined);

  const criada = await chamar('POST', '/api/recorrencias', assinatura(conta));
  assert.equal(criada.statusCode, 201);
  assert.equal(criada.json().assinatura, true);
  await chamar('POST', '/api/recorrencias', assinatura(conta, { descricao: 'Aluguel', valor_centavos: 100000, assinatura: false }));

  const lista = (await chamar('GET', '/api/assinaturas')).json();
  assert.equal(lista.itens.length, 1);
  assert.equal(lista.itens[0].custo_mensal_centavos, 3990);
  assert.equal(lista.itens[0].custo_anual_centavos, 47880);
  assert.equal(lista.itens[0].proximo_vencimento, dias(5));
  assert.equal(lista.totais.mensal_centavos, 3990);
  assert.equal((await chamar('GET', '/api/resumo')).json().assinaturas.ativas, 1);

  const id = criada.json().id;
  const pausada = await chamar('POST', `/api/assinaturas/${id}/pausar`);
  assert.equal(pausada.json().ativa, false);
  const depois = (await chamar('GET', '/api/assinaturas')).json();
  assert.equal(depois.itens[0].proximo_vencimento, null, 'sem cobranças futuras');
  assert.equal(depois.totais.ativas, 0);
  assert.equal((await chamar('GET', '/api/resumo')).json().assinaturas, undefined, 'RF-10');

  assert.equal((await chamar('POST', `/api/assinaturas/${id}/reativar`)).json().ativa, true);
  assert.equal((await chamar('GET', '/api/assinaturas')).json().itens[0].proximo_vencimento, dias(5));
});

test('API assinaturas: receita não pode ser assinatura, e recorrência comum não é pausada por aqui', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);
  const receita = await chamar('POST', '/api/recorrencias', assinatura(conta, { tipo: 'receita' }));
  assert.equal(receita.statusCode, 400);
  assert.ok(receita.json().campos.assinatura);
  const comum = (await chamar('POST', '/api/recorrencias', assinatura(conta, { assinatura: false }))).json();
  assert.equal((await chamar('POST', `/api/assinaturas/${comum.id}/pausar`)).statusCode, 404);
  assert.equal((await chamar('POST', '/api/assinaturas/999/reativar')).statusCode, 404);
});

test('Dívidas: a cópia JSON inclui a tabela de dívidas', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);
  await chamar('POST', '/api/dividas', divida(conta));
  const copia = (await chamar('GET', '/api/exportar/tudo.json')).json();
  assert.equal(copia.dados.dividas[0].nome, 'Financiamento');
  assert.equal(copia.dados.movimentacoes.filter((m) => m.divida_id != null).length, 3);
});
