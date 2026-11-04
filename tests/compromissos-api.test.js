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
  return { ...ctx, chamar, cookie };
}

const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
const dias = (n) => {
  const d = new Date(`${hoje()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function contaComSaldo(chamar, saldo = 100000) {
  return (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: saldo })).json();
}
const recorrenciaBase = (conta, extra = {}) => ({
  tipo: 'despesa', descricao: 'Aluguel', valor_centavos: 50000, conta_id: conta.id, frequencia: 'mensal', data_inicio: hoje(), ...extra,
});

test('API: as rotas de compromissos, recorrências, fluxo, calendário e alertas exigem sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of [
    '/api/compromissos', '/api/recorrencias', '/api/recorrencias/1', '/api/fluxo?de=2026-01-01&ate=2026-12-31',
    '/api/fluxo/projecao', '/api/calendario', '/api/alertas',
  ]) {
    const res = await app.inject({ method: 'GET', url, headers: { host: HOST } });
    assert.equal(res.statusCode, 401, url);
  }
});

test('API: escrita de recorrência, baixa parcial e reagendamento exigem CSRF e Origin', async (t) => {
  const { chamar, app, cookie } = await sessao(t);
  const conta = await contaComSaldo(chamar);
  assert.equal((await chamar('POST', '/api/recorrencias', recorrenciaBase(conta), { semCsrf: true })).statusCode, 403);
  assert.equal((await chamar('POST', '/api/compromissos/1/baixa-parcial', { valor_centavos: 1 }, { semCsrf: true })).statusCode, 403);
  assert.equal((await chamar('POST', '/api/compromissos/1/reagendar', { data_vencimento: hoje() }, { semCsrf: true })).statusCode, 403);
  const semOrigem = await app.inject({ method: 'POST', url: '/api/recorrencias', headers: { host: HOST, cookie }, payload: recorrenciaBase(conta) });
  assert.equal(semOrigem.statusCode, 403);
});

test('API: recorrência cria os compromissos; abrir o app e listar não duplica; excluir limpa o futuro', async (t) => {
  const { chamar, cookie, app } = await sessao(t);
  const conta = await contaComSaldo(chamar);
  const criada = await chamar('POST', '/api/recorrencias', recorrenciaBase(conta));
  assert.equal(criada.statusCode, 201);
  const id = criada.json().id;

  const quantos = async () => (await chamar('GET', '/api/compromissos?tipo=despesa')).json().total;
  const inicial = await quantos();
  assert.ok(inicial >= 3);
  for (let i = 0; i < 3; i++) {
    await app.inject({ method: 'GET', url: '/api/sessao', headers: { host: HOST, cookie } });
    await chamar('GET', '/api/recorrencias');
    await chamar('GET', '/api/resumo');
  }
  assert.equal(await quantos(), inicial);

  const lista = (await chamar('GET', '/api/recorrencias')).json().itens;
  assert.equal(lista[0].proximo_vencimento, hoje());

  assert.equal((await chamar('DELETE', `/api/recorrencias/${id}`)).statusCode, 204);
  assert.equal(await quantos(), 0);
  assert.equal((await chamar('GET', `/api/recorrencias/${id}`)).statusCode, 404);
  assert.equal((await chamar('DELETE', `/api/recorrencias/${id}`)).statusCode, 404);
});

test('RF-10: sem nada pendente o resumo não traz bloco de compromissos (nada de zero falso)', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar, 1000);
  assert.equal('compromissos' in (await chamar('GET', '/api/resumo')).json(), false);

  await chamar('POST', '/api/movimentacoes', {
    tipo: 'despesa', valor_centavos: 100, conta_id: conta.id, data_competencia: hoje(), data_vencimento: dias(2), status: 'pendente',
  });
  const resumo = (await chamar('GET', '/api/resumo')).json();
  assert.equal(resumo.compromissos.a_pagar.vence_em_breve_centavos, 100);
  assert.equal(resumo.compromissos.a_receber.total_centavos, 0);
});

test('API: valida recorrência (campos, data final, conta inexistente) com mensagens por campo', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);
  const vazia = await chamar('POST', '/api/recorrencias', {});
  assert.equal(vazia.statusCode, 400);
  assert.ok('descricao' in vazia.json().campos);
  const fim = await chamar('POST', '/api/recorrencias', recorrenciaBase(conta, { data_fim: dias(-5) }));
  assert.equal(fim.statusCode, 400);
  assert.ok('data_fim' in fim.json().campos);
  const semConta = await chamar('POST', '/api/recorrencias', recorrenciaBase({ id: 9999 }));
  assert.equal(semConta.statusCode, 400);
  assert.ok('conta_id' in semConta.json().campos);
  const editar = await chamar('PUT', '/api/recorrencias/77', recorrenciaBase(conta));
  assert.equal(editar.statusCode, 404);
});

test('API: compromissos — lista, atraso calculado, baixa parcial e reagendar', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar, 100000);
  const nova = (extra) =>
    chamar('POST', '/api/movimentacoes', {
      tipo: 'despesa', descricao: 'Luz', valor_centavos: 10000, conta_id: conta.id, data_competencia: dias(-10), status: 'pendente', ...extra,
    });
  const atrasada = (await nova({ data_vencimento: dias(-3) })).json().movimentacao;
  await nova({ data_vencimento: dias(5), descricao: 'Água' });

  const lista = (await chamar('GET', '/api/compromissos?tipo=despesa')).json();
  assert.equal(lista.itens[0].situacao, 'atrasada');
  assert.equal(lista.itens[0].dias_de_atraso, 3);
  assert.equal(lista.totais.atrasado_centavos, 10000);
  assert.equal((await chamar('GET', '/api/compromissos?tipo=despesa&situacao=atrasada')).json().total, 1);
  assert.equal((await chamar('GET', '/api/compromissos?tipo=despesa&situacao=qualquer')).statusCode, 400);

  // RF-07: a listagem de lançamentos também marca o atraso, calculado contra a data de hoje.
  const lancamentos = (await chamar('GET', '/api/movimentacoes')).json();
  assert.deepEqual(lancamentos.itens.filter((i) => i.atrasada).map((i) => i.id), [atrasada.id]);

  const baixa = await chamar('POST', `/api/compromissos/${atrasada.id}/baixa-parcial`, { valor_centavos: 4000 });
  assert.equal(baixa.statusCode, 200);
  assert.equal(baixa.json().restante.valor_centavos, 6000);
  assert.equal((await chamar('POST', `/api/compromissos/${atrasada.id}/baixa-parcial`, { valor_centavos: 1 })).statusCode, 409);
  assert.equal((await chamar('POST', `/api/compromissos/${baixa.json().restante.id}/baixa-parcial`, { valor_centavos: 99999 })).statusCode, 400);
  assert.equal((await chamar('POST', '/api/compromissos/9999/baixa-parcial', { valor_centavos: 1 })).statusCode, 404);

  const resto = baixa.json().restante;
  const novoVenc = await chamar('POST', `/api/compromissos/${resto.id}/reagendar`, { data_vencimento: dias(10) });
  assert.equal(novoVenc.statusCode, 200);
  assert.equal(novoVenc.json().data_vencimento, dias(10));
  assert.equal((await chamar('POST', `/api/compromissos/${resto.id}/reagendar`, { data_vencimento: 'ontem' })).statusCode, 400);
  const sem = (await chamar('GET', '/api/compromissos?tipo=despesa&situacao=atrasada')).json();
  assert.equal(sem.total, 0);
});

test('API: fluxo, projeção, calendário e alertas', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar, 1000);
  await chamar('POST', '/api/movimentacoes', {
    tipo: 'despesa', descricao: 'Aluguel', valor_centavos: 5000, conta_id: conta.id, data_competencia: dias(-2), data_vencimento: dias(3), status: 'pendente',
  });

  const fluxo = await chamar('GET', `/api/fluxo?de=${dias(-30)}&ate=${dias(30)}&agrupar=semana`);
  assert.equal(fluxo.statusCode, 200);
  assert.deepEqual(fluxo.json().totais, { entradas_centavos: 0, saidas_centavos: 0, resultado_centavos: 0 });
  assert.equal((await chamar('GET', `/api/fluxo?de=${dias(5)}&ate=${dias(-5)}`)).statusCode, 400);
  assert.equal((await chamar('GET', '/api/fluxo')).statusCode, 400);

  const proj = (await chamar('GET', '/api/fluxo/projecao?dias=15')).json();
  assert.equal(proj.dias, 15);
  assert.equal(proj.serie.length, 16);
  assert.equal(proj.saldo_final_centavos, -4000);
  assert.equal(proj.periodos_negativos.length, 1);
  assert.equal((await chamar('GET', '/api/fluxo/projecao?dias=10')).statusCode, 400);
  assert.equal((await chamar('GET', '/api/fluxo/projecao')).json().dias, 30);

  const mes = dias(3).slice(0, 7);
  const cal = (await chamar('GET', `/api/calendario?mes=${mes}`)).json();
  assert.ok(cal.dias.some((d) => d.data === dias(3) && d.saidas_centavos === 5000));
  assert.equal((await chamar('GET', '/api/calendario?mes=13-2026')).statusCode, 400);

  const alertas = (await chamar('GET', '/api/alertas')).json();
  assert.ok(alertas.alertas.some((a) => a.codigo === 'saldo_negativo_projetado'));
  assert.equal(alertas.total, alertas.alertas.length);
});
