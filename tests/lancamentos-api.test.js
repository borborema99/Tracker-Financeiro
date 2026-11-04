import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOST, ORIGEM, appDeTeste, entrar } from './ajuda.js';

async function sessao(t) {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  const { cookie, csrf } = await entrar(ctx.app);
  const chamar = (method, url, payload) =>
    ctx.app.inject({
      method,
      url,
      headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf },
      payload,
    });
  return { ...ctx, chamar };
}

const conta = (nome, saldo = 0) => ({ nome, tipo: 'corrente', saldo_inicial_centavos: saldo });
const despesa = (contaId, extra = {}) => ({
  tipo: 'despesa', descricao: 'Padaria', valor_centavos: 1850, conta_id: contaId, data_competencia: '2026-06-10', ...extra,
});

test('API: as rotas de contas, categorias, lançamentos e resumo exigem sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of ['/api/contas', '/api/categorias', '/api/movimentacoes', '/api/movimentacoes/1', '/api/movimentacoes/1/historico', '/api/resumo']) {
    const res = await app.inject({ method: 'GET', url, headers: { host: HOST } });
    assert.equal(res.statusCode, 401, url);
  }
});

test('API: fluxo completo de conta e lançamento, com saldo calculado', async (t) => {
  const { chamar } = await sessao(t);
  const criada = await chamar('POST', '/api/contas', conta('Corrente', 10000));
  assert.equal(criada.statusCode, 201);
  const contaId = criada.json().id;

  const novo = await chamar('POST', '/api/movimentacoes', despesa(contaId));
  assert.equal(novo.statusCode, 201);
  const { movimentacao, avisos } = novo.json();
  assert.deepEqual(avisos, []);
  assert.equal(movimentacao.status, 'liquidada');
  assert.ok(movimentacao.data_liquidacao, 'liquidada sem data usa hoje');

  const contas = (await chamar('GET', '/api/contas')).json().itens;
  assert.equal(contas[0].saldo_centavos, 10000 - 1850);
  assert.equal('excluida_em' in contas[0], false, 'campo interno não vaza');

  const editada = await chamar('PUT', `/api/movimentacoes/${movimentacao.id}`, despesa(contaId, { valor_centavos: 2000 }));
  assert.equal(editada.statusCode, 200);
  assert.equal((await chamar('GET', '/api/contas')).json().itens[0].saldo_centavos, 8000);

  const excluida = await chamar('DELETE', `/api/movimentacoes/${movimentacao.id}`);
  assert.equal(excluida.statusCode, 204);
  assert.equal((await chamar('GET', `/api/movimentacoes/${movimentacao.id}`)).statusCode, 404);
  assert.equal((await chamar('GET', '/api/contas')).json().itens[0].saldo_centavos, 10000);
});

test('API: duplicidade avisa e não bloqueia (RF-09)', async (t) => {
  const { chamar } = await sessao(t);
  const { id } = (await chamar('POST', '/api/contas', conta('A'))).json();
  await chamar('POST', '/api/movimentacoes', despesa(id));
  const segunda = await chamar('POST', '/api/movimentacoes', despesa(id));
  assert.equal(segunda.statusCode, 201);
  assert.equal(segunda.json().avisos[0].codigo, 'possivel_duplicidade');
});

test('API: validação devolve 400 com campos; Zod barra tipo e data inválidos', async (t) => {
  const { chamar } = await sessao(t);
  const { id } = (await chamar('POST', '/api/contas', conta('A'))).json();
  const semValor = await chamar('POST', '/api/movimentacoes', { ...despesa(id), valor_centavos: 0 });
  assert.equal(semValor.statusCode, 400);
  assert.ok(semValor.json().campos.valor_centavos);
  const decimal = await chamar('POST', '/api/movimentacoes', { ...despesa(id), valor_centavos: 10.5 });
  assert.equal(decimal.statusCode, 400);
  const data = await chamar('POST', '/api/movimentacoes', { ...despesa(id), data_competencia: '2026-02-30' });
  assert.equal(data.statusCode, 400);
  const tipo = await chamar('POST', '/api/movimentacoes', { ...despesa(id), tipo: 'doacao' });
  assert.equal(tipo.statusCode, 400);
  const regra = await chamar('POST', '/api/movimentacoes', { tipo: 'transferencia', valor_centavos: 100, conta_id: id, conta_destino_id: id, data_competencia: '2026-06-10' });
  assert.equal(regra.statusCode, 400);
  assert.ok(regra.json().campos.conta_destino_id);
});

test('API: liquidar e reabrir; liquidar duas vezes é conflito', async (t) => {
  const { chamar } = await sessao(t);
  const { id } = (await chamar('POST', '/api/contas', conta('A', 1000))).json();
  const { movimentacao } = (await chamar('POST', '/api/movimentacoes', despesa(id, { status: 'pendente', data_vencimento: '2026-06-30' }))).json();
  assert.equal((await chamar('GET', '/api/contas')).json().itens[0].saldo_centavos, 1000);
  const liq = await chamar('POST', `/api/movimentacoes/${movimentacao.id}/liquidar`, { data_liquidacao: '2026-06-12' });
  assert.equal(liq.json().data_liquidacao, '2026-06-12');
  assert.equal((await chamar('GET', '/api/contas')).json().itens[0].saldo_centavos, 1000 - 1850);
  assert.equal((await chamar('POST', `/api/movimentacoes/${movimentacao.id}/liquidar`, {})).statusCode, 409);
  assert.equal((await chamar('POST', `/api/movimentacoes/${movimentacao.id}/reabrir`)).json().status, 'pendente');
});

test('API: histórico do lançamento mostra criação, edição e exclusão com antes e depois', async (t) => {
  const { chamar } = await sessao(t);
  const { id } = (await chamar('POST', '/api/contas', conta('A'))).json();
  const { movimentacao } = (await chamar('POST', '/api/movimentacoes', despesa(id))).json();
  await chamar('PUT', `/api/movimentacoes/${movimentacao.id}`, despesa(id, { valor_centavos: 3000 }));
  await chamar('DELETE', `/api/movimentacoes/${movimentacao.id}`);
  const h = await chamar('GET', `/api/movimentacoes/${movimentacao.id}/historico`);
  assert.equal(h.statusCode, 200);
  const itens = h.json().itens;
  assert.deepEqual(itens.map((i) => i.acao), ['criar', 'editar', 'excluir']);
  assert.equal(itens[1].antes.valor_centavos, 1850);
  assert.equal(itens[1].depois.valor_centavos, 3000);
  assert.equal((await chamar('GET', '/api/movimentacoes/9999/historico')).statusCode, 404);
  assert.equal((await chamar('GET', '/api/movimentacoes/abc/historico')).statusCode, 404);
});

test('API: listagem com filtros na query string, paginação e totais', async (t) => {
  const { chamar } = await sessao(t);
  const { id } = (await chamar('POST', '/api/contas', conta('A'))).json();
  for (let i = 1; i <= 5; i++) await chamar('POST', '/api/movimentacoes', despesa(id, { descricao: `Item ${i}`, valor_centavos: i * 100 }));
  const r = (await chamar('GET', '/api/movimentacoes?por_pagina=2&pagina=2&ordenar=valor&direcao=asc&q=item')).json();
  assert.equal(r.total, 5);
  assert.deepEqual(r.itens.map((m) => m.valor_centavos), [300, 400]);
  assert.equal(r.totais.realizado.despesas, 1500);
  assert.equal((await chamar('GET', '/api/movimentacoes?ordenar=senha')).statusCode, 400);
  assert.equal((await chamar('GET', '/api/movimentacoes?por_pagina=1000')).statusCode, 400);
});

test('API: conta com lançamentos não exclui; categoria CRUD; a de tarifas é protegida', async (t) => {
  const { chamar } = await sessao(t);
  const { id } = (await chamar('POST', '/api/contas', conta('A'))).json();
  await chamar('POST', '/api/movimentacoes', despesa(id));
  assert.equal((await chamar('DELETE', `/api/contas/${id}`)).statusCode, 409);

  const cats = (await chamar('GET', '/api/categorias')).json().itens;
  const tarifa = cats.find((c) => c.papel === 'tarifa');
  assert.equal((await chamar('DELETE', `/api/categorias/${tarifa.id}`)).statusCode, 409);
  const criada = await chamar('POST', '/api/categorias', { nome: 'Pets', tipo: 'despesa' });
  assert.equal(criada.statusCode, 201);
  assert.equal((await chamar('DELETE', `/api/categorias/${criada.json().id}`)).statusCode, 204);
});

test('API: escrita sem CSRF ou sem Origin é recusada nas novas rotas', async (t) => {
  const { app } = await sessao(t);
  const semOrigem = await app.inject({ method: 'POST', url: '/api/contas', headers: { host: HOST }, payload: conta('X') });
  assert.equal(semOrigem.statusCode, 403);
  const { cookie } = await entrar(app);
  const semCsrf = await app.inject({ method: 'POST', url: '/api/contas', headers: { host: HOST, origin: ORIGEM, cookie }, payload: conta('X') });
  assert.equal(semCsrf.statusCode, 403);
});

test('banco: as colunas filtradas têm índice', async (t) => {
  const { db } = await sessao(t);
  const indices = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'movimentacoes'").all().map((i) => i.name);
  for (const esperado of ['idx_mov_competencia', 'idx_mov_vencimento', 'idx_mov_liquidacao', 'idx_mov_conta', 'idx_mov_categoria', 'idx_mov_tipo_status', 'idx_mov_valor', 'idx_mov_excluida']) {
    assert.ok(indices.includes(esperado), esperado);
  }
});
