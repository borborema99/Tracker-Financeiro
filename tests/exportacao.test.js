import assert from 'node:assert/strict';
import { test } from 'node:test';
import { celulaDinheiro, celulaTexto, montarCsv } from '../servidor/dominio/csv.js';
import { HOST, ORIGEM, appDeTeste, entrar } from './ajuda.js';

test('csv: texto com separador, aspas ou quebra de linha é protegido', () => {
  assert.equal(celulaTexto('Mercado; feira'), '"Mercado; feira"');
  assert.equal(celulaTexto('Disse "oi"'), '"Disse ""oi"""');
  assert.equal(celulaTexto('linha 1\nlinha 2'), '"linha 1\nlinha 2"');
  assert.equal(celulaTexto('Normal'), 'Normal');
  assert.equal(celulaTexto(null), '');
});

test('csv: injeção de fórmula é neutralizada em texto digitado', () => {
  for (const perigoso of ['=1+1', '+55 11 9999', '-2+3', '@SOMA(A1)', '=HYPERLINK("http://x")', '\t=1']) {
    assert.ok(celulaTexto(perigoso).replace(/^"/, '').startsWith("'"), perigoso);
  }
  assert.equal(celulaTexto('ok = ok'), 'ok = ok');
});

test('csv: dinheiro sai como número com vírgula decimal, sem float e sem apóstrofo, inclusive negativo', () => {
  assert.equal(celulaDinheiro(123456), '1234,56');
  assert.equal(celulaDinheiro(5), '0,05');
  assert.equal(celulaDinheiro(-1050), '-10,50');
  assert.equal(celulaDinheiro(null), '');
  assert.equal(montarCsv([{ titulo: 'V', valor: (l) => l, dinheiro: true }], [-100]), 'V\r\n-1,00\r\n');
});

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

test('API: as rotas de exportação exigem sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of ['/api/exportar/lancamentos.csv', '/api/exportar/compras-cartao.csv', '/api/exportar/tudo.json']) {
    const res = await app.inject({ method: 'GET', url, headers: { host: HOST } });
    assert.equal(res.statusCode, 401, url);
  }
});

test('exportar lançamentos: CSV com BOM, cabeçalho de download, nomes de conta e categoria, valor e situação', async (t) => {
  const { chamar } = await sessao(t);
  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0 })).json();
  const nova = (extra) =>
    chamar('POST', '/api/movimentacoes', {
      tipo: 'despesa', valor_centavos: 123456, conta_id: conta.id, data_competencia: hoje(), status: 'liquidada', ...extra,
    });
  await nova({ descricao: 'Aluguel; maio' });
  await nova({ descricao: '=CMD()', valor_centavos: 100 });
  await nova({ descricao: 'Velha', status: 'pendente', data_competencia: '2020-01-01', data_vencimento: '2020-01-10' });

  const res = await chamar('GET', '/api/exportar/lancamentos.csv');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /^text\/csv; charset=utf-8/);
  assert.match(res.headers['content-disposition'], /^attachment; filename="lancamentos-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.body.charCodeAt(0), 0xfeff);

  const linhas = res.body.slice(1).trimEnd().split('\r\n');
  assert.equal(linhas.length, 4);
  assert.equal(linhas[0].split(';')[0], 'ID');
  assert.ok(linhas.some((l) => l.includes('"Aluguel; maio"') && l.includes(';1234,56;')));
  assert.ok(linhas.some((l) => l.includes(";'=CMD();") && l.includes(';1,00;')));
  assert.ok(linhas.some((l) => l.includes('Corrente') && l.includes(';Atrasada;')));
  assert.ok(!res.body.includes(';=CMD()'), 'nenhuma célula começa com =');
});

test('exportar lançamentos: respeita os filtros da tela e valida a query', async (t) => {
  const { chamar } = await sessao(t);
  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0 })).json();
  for (const [tipo, descricao] of [['despesa', 'Gasto'], ['receita', 'Ganho']]) {
    await chamar('POST', '/api/movimentacoes', { tipo, descricao, valor_centavos: 500, conta_id: conta.id, data_competencia: hoje() });
  }
  const so = await chamar('GET', '/api/exportar/lancamentos.csv?tipo=receita');
  assert.equal(so.body.slice(1).trimEnd().split('\r\n').length, 2);
  assert.ok(so.body.includes('Ganho') && !so.body.includes('Gasto'));
  assert.equal((await chamar('GET', '/api/exportar/lancamentos.csv?tipo=nada')).statusCode, 400);
});

test('exportar lançamentos: passa de 100 itens (várias páginas) sem perder nenhum', async (t) => {
  const { chamar, db } = await sessao(t);
  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0 })).json();
  const inserir = db.prepare(
    `INSERT INTO movimentacoes (tipo, descricao, valor_centavos, conta_id, data_competencia, data_liquidacao, status, criada_em, atualizada_em)
     VALUES ('despesa', ?, 100, ?, ?, ?, 'liquidada', 'a', 'a')`,
  );
  for (let i = 0; i < 230; i++) inserir.run(`Item ${i}`, conta.id, hoje(), hoje());
  const res = await chamar('GET', '/api/exportar/lancamentos.csv');
  assert.equal(res.body.slice(1).trimEnd().split('\r\n').length, 231);
});

test('exportar compras no cartão: uma linha por compra, com estorno', async (t) => {
  const { chamar } = await sessao(t);
  const cartao = (
    await chamar('POST', '/api/cartoes', { nome: 'Roxo', limite_centavos: 500000, dia_fechamento: 10, dia_vencimento: 17, conta_pagamento_id: null })
  ).json();
  const compra = (
    await chamar('POST', '/api/compras-cartao', {
      cartao_id: cartao.id, descricao: 'Tênis', valor_total_centavos: 30000, data_compra: hoje(), parcelas_total: 3,
    })
  ).json();
  assert.ok(compra.compra?.id ?? compra.id, 'compra criada');
  const res = await chamar('GET', '/api/exportar/compras-cartao.csv');
  assert.equal(res.statusCode, 200);
  const linhas = res.body.slice(1).trimEnd().split('\r\n');
  assert.equal(linhas.length, 2);
  assert.ok(linhas[1].includes('Roxo') && linhas[1].includes('Tênis') && linhas[1].includes(';300,00;3;0,00;'));
});

test('exportar JSON: cópia completa dos dados, sem senha, sessões nem log', async (t) => {
  const { chamar } = await sessao(t);
  const conta = (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 777 })).json();
  await chamar('POST', '/api/movimentacoes', { tipo: 'despesa', valor_centavos: 100, conta_id: conta.id, data_competencia: hoje() });

  const res = await chamar('GET', '/api/exportar/tudo.json');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-disposition'], /^attachment; filename="tracker-\d{4}-\d{2}-\d{2}\.json"$/);
  const copia = JSON.parse(res.body);
  assert.equal(copia.sistema, 'tracker-financeiro');
  assert.match(copia.versao_do_esquema, /^\d{3}_/);
  assert.equal(copia.dados.contas[0].saldo_inicial_centavos, 777);
  assert.equal(copia.dados.movimentacoes.length, 1);
  assert.ok(copia.dados.categorias.length > 0);
  for (const proibido of ['config', 'sessoes', 'tentativas_login', 'audit_log']) {
    assert.ok(!(proibido in copia.dados), proibido);
  }
  assert.ok(!/scrypt|senha_hash|sessao=/i.test(res.body), 'nenhum vestígio de senha ou sessão');
});
