import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TABELAS_DA_COPIA } from '../servidor/banco/repositorios/exportacao.js';
import { HOST, ORIGEM, SENHA, appDeTeste, entrar, novoUsuarioDeTeste } from './ajuda.js';

// Isolamento entre usuários (ADR 013): a conta B nunca enxerga nem altera o que é da conta A. Para provar que o
// 404 vem do isolamento (e não de um id inválido), cada pedido de B com um id da A é comparado com o mesmo pedido
// usando um id que não existe em lugar nenhum: a resposta tem de ser igual, sem revelar que o recurso existe.

const MARCA = 'Segredo-da-Ana';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('isolamento')]);
const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const mes = () => hoje().slice(0, 7);
const FANTASMA = 999_999_999;

async function montar(t) {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  await novoUsuarioDeTeste('bia');
  const sessaoA = await entrar(ctx.app);
  const sessaoB = await entrar(ctx.app, SENHA, 'bia');
  const como = (sessao) => (method, url, payload, headers = {}) =>
    ctx.app.inject({
      method,
      url,
      headers: { host: HOST, origin: ORIGEM, cookie: sessao.cookie, 'x-csrf-token': sessao.csrf, ...headers },
      payload,
    });
  return { ...ctx, ana: como(sessaoA), bia: como(sessaoB) };
}

const ok = (res, esperado = [200, 201, 204]) => {
  assert.ok(esperado.includes(res.statusCode), `${res.statusCode}: ${res.body}`);
  return res.statusCode === 204 ? null : res.json();
};

/** A conta A com um recurso de cada tipo. Devolve os ids (lidos do banco, pelo escopo da A). */
async function popularAna({ ana, db }) {
  const id = async (tabela, onde = '') => (await db.um(`SELECT id FROM ${tabela} WHERE usuario_id = :u ${onde} ORDER BY id LIMIT 1`, [])).id;
  const conta = ok(await ana('POST', '/api/contas', { nome: `Corrente ${MARCA}`, tipo: 'corrente', saldo_inicial_centavos: 100000 }));
  const conta2 = ok(await ana('POST', '/api/contas', { nome: 'Poupança da Ana', tipo: 'poupanca', saldo_inicial_centavos: 5000 }));
  const categoria = ok(await ana('POST', '/api/categorias', { nome: `Pets ${MARCA}`, tipo: 'despesa' }));
  const lazer = (ok(await ana('GET', '/api/categorias')).itens).find((c) => c.nome === 'Lazer');

  const base = { tipo: 'despesa', valor_centavos: 1850, conta_id: conta.id, data_competencia: hoje() };
  const mov = ok(await ana('POST', '/api/movimentacoes', { ...base, descricao: `Padaria ${MARCA}`, categoria_id: lazer.id })).movimentacao;
  const pendente = ok(
    await ana('POST', '/api/movimentacoes', { ...base, descricao: `Conta de luz ${MARCA}`, status: 'pendente', data_vencimento: hoje() }),
  ).movimentacao;
  ok(
    await ana('POST', `/api/movimentacoes/${mov.id}/anexos`, PNG, {
      'content-type': 'image/png',
      'x-nome-arquivo': encodeURIComponent('recibo-da-ana.png'),
    }),
  );

  const cartao = ok(
    await ana('POST', '/api/cartoes', { nome: `Cartão ${MARCA}`, limite_centavos: 500000, dia_fechamento: 10, dia_vencimento: 17, conta_pagamento_id: conta.id }),
  );
  ok(await ana('POST', '/api/compras-cartao', { cartao_id: cartao.id, descricao: `Tênis ${MARCA}`, valor_total_centavos: 30000, data_compra: hoje(), parcelas_total: 3 }));
  const fatura = await id('faturas');
  ok(await ana('POST', `/api/faturas/${fatura}/pagamentos`, { valor_centavos: 1000, conta_id: conta.id }));
  const compra = await id('compras_cartao');
  ok(await ana('POST', `/api/compras-cartao/${compra}/estornos`, { valor_centavos: 2000 }));

  const recorrencia = ok(
    await ana('POST', '/api/recorrencias', { tipo: 'despesa', descricao: `Aluguel ${MARCA}`, valor_centavos: 50000, conta_id: conta.id, frequencia: 'mensal', data_inicio: hoje() }),
  );
  const assinatura = ok(
    await ana('POST', '/api/recorrencias', { tipo: 'despesa', descricao: `Streaming ${MARCA}`, valor_centavos: 3990, conta_id: conta.id, frequencia: 'mensal', data_inicio: hoje(), assinatura: true }),
  );
  const meta = ok(await ana('POST', '/api/metas', { nome: `Viagem ${MARCA}`, valor_alvo_centavos: 600000 }));
  ok(await ana('POST', `/api/metas/${meta.id}/aportes`, { tipo: 'aporte', valor_centavos: 1000, data: hoje() }));
  const divida = ok(
    await ana('POST', '/api/dividas', { nome: `Financiamento ${MARCA}`, credor: 'Banco X', valor_total_centavos: 120000, parcelas_total: 3, primeiro_vencimento: hoje(), conta_id: conta.id }),
  );
  const investimento = ok(await ana('POST', '/api/investimentos', { nome: `Tesouro ${MARCA}`, tipo: 'tesouro' }));
  ok(await ana('POST', `/api/investimentos/${investimento.id}/operacoes`, { tipo: 'aporte', valor_centavos: 1000, data: hoje(), conta_id: null }));
  ok(await ana('POST', `/api/investimentos/${investimento.id}/avaliacoes`, { data: hoje(), valor_centavos: 1100 }));
  const contaMoeda = ok(await ana('POST', '/api/moedas/contas', { nome: `Viagem ${MARCA}`, moeda: 'USD', saldo_inicial_centavos: 0 }));
  ok(await ana('POST', `/api/moedas/contas/${contaMoeda.id}/operacoes`, { tipo: 'deposito', valor_centavos: 1000, data: hoje() }));
  ok(await ana('POST', '/api/moedas/cotacoes', { moeda: 'USD', data: hoje(), taxa_micros: 5_000_000 }));

  return {
    conta: conta.id,
    conta2: conta2.id,
    categoria: categoria.id,
    categoriaOrcada: lazer.id,
    mov: mov.id,
    pendente: pendente.id,
    anexo: await id('anexos'),
    cartao: cartao.id,
    fatura,
    compra,
    pagamento: await id('pagamentos_fatura'),
    estorno: await id('estornos_cartao'),
    recorrencia: recorrencia.id ?? (await id('recorrencias', 'AND assinatura = false')),
    assinatura: assinatura.id ?? (await id('recorrencias', 'AND assinatura = true')),
    meta: meta.id,
    aporte: await id('metas_aportes'),
    divida: divida.id ?? (await id('dividas')),
    investimento: investimento.id,
    operacaoInv: await id('investimentos_operacoes'),
    avaliacao: await id('investimentos_avaliacoes'),
    contaMoeda: contaMoeda.id,
    operacaoMoeda: await id('moeda_operacoes'),
    cotacao: await id('moeda_cotacoes'),
  };
}

/** Os recursos da B: o necessário para que o 404 só possa vir do id da A. */
async function popularBia({ bia }) {
  const conta = ok(await bia('POST', '/api/contas', { nome: 'Conta da Bia', tipo: 'corrente', saldo_inicial_centavos: 777 }));
  const cartao = ok(await bia('POST', '/api/cartoes', { nome: 'Cartão da Bia', limite_centavos: 100000, dia_fechamento: 10, dia_vencimento: 17, conta_pagamento_id: null }));
  const meta = ok(await bia('POST', '/api/metas', { nome: 'Meta da Bia', valor_alvo_centavos: 1000 }));
  const investimento = ok(await bia('POST', '/api/investimentos', { nome: 'Investimento da Bia', tipo: 'tesouro' }));
  const contaMoeda = ok(await bia('POST', '/api/moedas/contas', { nome: 'Dólar da Bia', moeda: 'USD', saldo_inicial_centavos: 0 }));
  return { conta: conta.id, cartao: cartao.id, meta: meta.id, investimento: investimento.id, contaMoeda: contaMoeda.id };
}

/**
 * Pedidos que a B faz usando ids de recurso. `i` são os ids "alheios" (da A, ou o fantasma) e `b` os da própria B.
 * Cada item: [método, rota-com-parâmetros, parâmetros, corpo]. `rota` é o padrão registrado no Fastify.
 */
const pedidosPorId = (i, b) => {
  const mov = { tipo: 'despesa', descricao: 'x', valor_centavos: 100, conta_id: b.conta, data_competencia: hoje() };
  const cartao = { nome: 'X', limite_centavos: 1000, dia_fechamento: 10, dia_vencimento: 17, conta_pagamento_id: null };
  const compra = { cartao_id: b.cartao, descricao: 'x', valor_total_centavos: 1000, data_compra: hoje(), parcelas_total: 1 };
  const recorrencia = { tipo: 'despesa', descricao: 'x', valor_centavos: 100, conta_id: b.conta, frequencia: 'mensal', data_inicio: hoje() };
  return [
    ['PUT', '/api/contas/:id', { id: i.conta }, { nome: 'X', tipo: 'corrente', saldo_inicial_centavos: 0, arquivada: false }],
    ['DELETE', '/api/contas/:id', { id: i.conta }],
    ['PUT', '/api/categorias/:id', { id: i.categoria }, { nome: 'X', tipo: 'despesa' }],
    ['DELETE', '/api/categorias/:id', { id: i.categoria }],
    ['GET', '/api/movimentacoes/:id', { id: i.mov }],
    ['GET', '/api/movimentacoes/:id/historico', { id: i.mov }],
    ['PUT', '/api/movimentacoes/:id', { id: i.mov }, mov],
    ['DELETE', '/api/movimentacoes/:id', { id: i.mov }],
    ['POST', '/api/movimentacoes/:id/liquidar', { id: i.pendente }, {}],
    ['POST', '/api/movimentacoes/:id/reabrir', { id: i.mov }],
    ['GET', '/api/movimentacoes/:id/anexos', { id: i.mov }],
    ['POST', '/api/movimentacoes/:id/anexos', { id: i.mov }, PNG, { 'content-type': 'image/png', 'x-nome-arquivo': 'a.png' }],
    ['GET', '/api/anexos/:id/arquivo', { id: i.anexo }],
    ['DELETE', '/api/anexos/:id', { id: i.anexo }],
    ['GET', '/api/cartoes/:id', { id: i.cartao }],
    ['PUT', '/api/cartoes/:id', { id: i.cartao }, cartao],
    ['DELETE', '/api/cartoes/:id', { id: i.cartao }],
    ['GET', '/api/cartoes/:id/faturas', { id: i.cartao }],
    ['GET', '/api/cartoes/:id/projecao', { id: i.cartao }],
    ['GET', '/api/cartoes/:id/compras', { id: i.cartao }],
    ['GET', '/api/faturas/:id', { id: i.fatura }],
    ['POST', '/api/faturas/:id/pagamentos', { id: i.fatura }, { valor_centavos: 100, conta_id: b.conta }],
    ['DELETE', '/api/pagamentos-fatura/:id', { id: i.pagamento }],
    ['GET', '/api/compras-cartao/:id', { id: i.compra }],
    ['PUT', '/api/compras-cartao/:id', { id: i.compra }, compra],
    ['DELETE', '/api/compras-cartao/:id', { id: i.compra }],
    ['POST', '/api/compras-cartao/:id/estornos', { id: i.compra }, { valor_centavos: 100 }],
    ['DELETE', '/api/estornos-cartao/:id', { id: i.estorno }],
    ['POST', '/api/compras-cartao/:id/antecipar', { id: i.compra }, { parcelas: [1] }],
    ['POST', '/api/compromissos/:id/baixa-parcial', { id: i.pendente }, { valor_centavos: 100 }],
    ['POST', '/api/compromissos/:id/reagendar', { id: i.pendente }, { data_vencimento: hoje() }],
    ['GET', '/api/recorrencias/:id', { id: i.recorrencia }],
    ['PUT', '/api/recorrencias/:id', { id: i.recorrencia }, recorrencia],
    ['DELETE', '/api/recorrencias/:id', { id: i.recorrencia }],
    ['POST', '/api/assinaturas/:id/pausar', { id: i.assinatura }],
    ['POST', '/api/assinaturas/:id/reativar', { id: i.assinatura }],
    ['PUT', '/api/orcamento/:id', { id: i.categoriaOrcada }, { mes_inicio: mes(), limite_centavos: 1000 }],
    ['GET', '/api/metas/:id', { id: i.meta }],
    ['PUT', '/api/metas/:id', { id: i.meta }, { nome: 'X', valor_alvo_centavos: 1000 }],
    ['DELETE', '/api/metas/:id', { id: i.meta }],
    ['POST', '/api/metas/:id/aportes', { id: i.meta }, { tipo: 'aporte', valor_centavos: 100, data: hoje() }],
    ['DELETE', '/api/metas/:id/aportes/:aporteId', { id: i.meta, aporteId: i.aporte }],
    ['DELETE', '/api/metas/:id/aportes/:aporteId', { id: b.meta, aporteId: i.aporte }], // meta da B, aporte da A
    ['GET', '/api/dividas/:id', { id: i.divida }],
    ['PUT', '/api/dividas/:id', { id: i.divida }, { nome: 'X', credor: 'Y' }],
    ['DELETE', '/api/dividas/:id', { id: i.divida }],
    ['GET', '/api/investimentos/:id', { id: i.investimento }],
    ['PUT', '/api/investimentos/:id', { id: i.investimento }, { nome: 'X', tipo: 'tesouro' }],
    ['DELETE', '/api/investimentos/:id', { id: i.investimento }],
    ['POST', '/api/investimentos/:id/operacoes', { id: i.investimento }, { tipo: 'aporte', valor_centavos: 100, data: hoje() }],
    ['DELETE', '/api/investimentos/:id/operacoes/:operacaoId', { id: i.investimento, operacaoId: i.operacaoInv }],
    ['DELETE', '/api/investimentos/:id/operacoes/:operacaoId', { id: b.investimento, operacaoId: i.operacaoInv }],
    ['POST', '/api/investimentos/:id/avaliacoes', { id: i.investimento }, { data: hoje(), valor_centavos: 100 }],
    ['DELETE', '/api/investimentos/:id/avaliacoes/:avaliacaoId', { id: i.investimento, avaliacaoId: i.avaliacao }],
    ['DELETE', '/api/investimentos/:id/avaliacoes/:avaliacaoId', { id: b.investimento, avaliacaoId: i.avaliacao }],
    ['GET', '/api/moedas/contas/:id', { id: i.contaMoeda }],
    ['PUT', '/api/moedas/contas/:id', { id: i.contaMoeda }, { nome: 'X' }],
    ['DELETE', '/api/moedas/contas/:id', { id: i.contaMoeda }],
    ['POST', '/api/moedas/contas/:id/operacoes', { id: i.contaMoeda }, { tipo: 'deposito', valor_centavos: 100, data: hoje() }],
    ['DELETE', '/api/moedas/contas/:id/operacoes/:operacaoId', { id: i.contaMoeda, operacaoId: i.operacaoMoeda }],
    ['DELETE', '/api/moedas/contas/:id/operacoes/:operacaoId', { id: b.contaMoeda, operacaoId: i.operacaoMoeda }],
    ['DELETE', '/api/moedas/cotacoes/:id', { id: i.cotacao }],
  ];
};

/** Pedidos em que o id alheio vai no corpo ou na query (o recurso da B é novo, o referenciado é da A). */
const pedidosComIdNoCorpo = (i, b) => {
  const mov = { tipo: 'despesa', descricao: 'x', valor_centavos: 100, conta_id: b.conta, data_competencia: hoje() };
  return [
    ['POST', '/api/movimentacoes', {}, { ...mov, conta_id: i.conta }],
    ['POST', '/api/movimentacoes', {}, { ...mov, categoria_id: i.categoria }],
    ['POST', '/api/movimentacoes', {}, { ...mov, tipo: 'transferencia', conta_destino_id: i.conta2 }],
    ['POST', '/api/movimentacoes', {}, { ...mov, tipo: 'receita', reembolso_de_id: i.mov }],
    ['POST', '/api/categorias', {}, { nome: 'Filha', tipo: 'despesa', pai_id: i.categoria }],
    ['POST', '/api/cartoes', {}, { nome: 'X', limite_centavos: 1000, dia_fechamento: 10, dia_vencimento: 17, conta_pagamento_id: i.conta }],
    ['POST', '/api/compras-cartao', {}, { cartao_id: i.cartao, descricao: 'x', valor_total_centavos: 1000, data_compra: hoje(), parcelas_total: 1 }],
    ['POST', '/api/compras-cartao', {}, { cartao_id: b.cartao, descricao: 'x', valor_total_centavos: 1000, data_compra: hoje(), parcelas_total: 1, categoria_id: i.categoria }],
    ['POST', '/api/faturas/:id/pagamentos', { id: i.fatura }, { valor_centavos: 100, conta_id: i.conta }],
    ['POST', '/api/recorrencias', {}, { tipo: 'despesa', descricao: 'x', valor_centavos: 100, conta_id: i.conta, frequencia: 'mensal', data_inicio: hoje() }],
    ['POST', '/api/dividas', {}, { nome: 'X', credor: 'Y', valor_total_centavos: 3000, parcelas_total: 3, primeiro_vencimento: hoje(), conta_id: i.conta }],
    ['POST', '/api/investimentos/:id/operacoes', { id: b.investimento }, { tipo: 'aporte', valor_centavos: 100, data: hoje(), conta_id: i.conta }],
    ['POST', '/api/moedas/contas/:id/operacoes', { id: b.contaMoeda }, { tipo: 'compra', valor_centavos: 100, valor_brl_centavos: 500, data: hoje(), conta_id: i.conta }],
    ['POST', '/api/importacao/ofx/confirmar', {}, { conta_id: i.conta, itens: [{ fitid: 'x1', data: hoje(), valor_centavos: -100 }] }],
    ['POST', `/api/importacao/ofx/previa?conta_id=${i.conta}`, {}, 'OFXHEADER:100', { 'content-type': 'application/x-ofx' }],
  ];
};

const urlDe = (padrao, params) => padrao.replace(/:(\w+)/g, (_, nome) => String(params[nome]));

async function executar(chamar, pedidos) {
  const respostas = [];
  for (const [metodo, padrao, params, corpo, cabecalhos] of pedidos) {
    const res = await chamar(metodo, urlDe(padrao, params), corpo, cabecalhos);
    respostas.push({ pedido: `${metodo} ${urlDe(padrao, params)}`, padrao: `${metodo} ${padrao.split('?')[0]}`, status: res.statusCode, corpo: res.body });
  }
  return respostas;
}

test('isolamento: com ids da Ana, a Bia recebe 404 em toda rota de leitura e escrita, igual a um id que não existe', async (t) => {
  const ctx = await montar(t);
  const ana = await popularAna(ctx);
  const bia = await popularBia(ctx);
  const fantasma = Object.fromEntries(Object.keys(ana).map((k) => [k, FANTASMA]));

  const alheios = await executar(ctx.bia, pedidosPorId(ana, bia));
  const inexistentes = await executar(ctx.bia, pedidosPorId(fantasma, bia));

  for (const [n, r] of alheios.entries()) {
    // O orçamento é identificado pela categoria: a categoria alheia vira erro de campo, igual à inexistente.
    const esperado = r.padrao === 'PUT /api/orcamento/:id' ? 400 : 404;
    assert.equal(r.status, esperado, `${r.pedido} → ${r.status} ${r.corpo}`);
    assert.equal(r.status, inexistentes[n].status, r.pedido);
    assert.equal(r.corpo, inexistentes[n].corpo, `${r.pedido}: a resposta muda se o id existe na outra conta`);
  }
  assert.ok(alheios.length >= 60, 'a tabela cobre as rotas com id');
});

test('isolamento: id da Ana no corpo ou na query de um pedido da Bia se comporta como id inexistente e não grava nada', async (t) => {
  const ctx = await montar(t);
  const ana = await popularAna(ctx);
  const bia = await popularBia(ctx);
  const fantasma = Object.fromEntries(Object.keys(ana).map((k) => [k, FANTASMA]));
  const antesBia = await ctx.bia('GET', '/api/exportar/tudo.json');

  const alheios = await executar(ctx.bia, pedidosComIdNoCorpo(ana, bia));
  const inexistentes = await executar(ctx.bia, pedidosComIdNoCorpo(fantasma, bia));

  for (const [n, r] of alheios.entries()) {
    assert.equal(r.status, inexistentes[n].status, `${r.pedido}: a resposta muda se o id existe na outra conta`);
    assert.equal(r.corpo, inexistentes[n].corpo, r.pedido);
    // Id de outra conta num campo do corpo é erro de validação do campo (400) ou "não encontrado" (404), nunca sucesso.
    assert.ok([400, 404].includes(r.status), `${r.pedido} → ${r.status} ${r.corpo}`);
  }
  const depoisBia = await ctx.bia('GET', '/api/exportar/tudo.json');
  assert.deepEqual(JSON.parse(depoisBia.body).dados, JSON.parse(antesBia.body).dados, 'nada foi gravado na conta da Bia');
});

test('isolamento: tudo o que a Bia tentou não mudou nenhum dado da Ana', async (t) => {
  const ctx = await montar(t);
  const ana = await popularAna(ctx);
  const bia = await popularBia(ctx);
  const antes = JSON.parse((await ctx.ana('GET', '/api/exportar/tudo.json')).body).dados;
  const objetosAntes = ctx.armazenamento.caminhos().length;

  await executar(ctx.bia, pedidosPorId(ana, bia));
  await executar(ctx.bia, pedidosComIdNoCorpo(ana, bia));

  const depois = JSON.parse((await ctx.ana('GET', '/api/exportar/tudo.json')).body).dados;
  assert.deepEqual(depois, antes);
  assert.equal(ctx.armazenamento.caminhos().length, objetosAntes, 'nenhum comprovante da Ana foi apagado');
  const arquivo = await ctx.ana('GET', `/api/anexos/${ana.anexo}/arquivo`);
  assert.equal(arquivo.statusCode, 200, 'a Ana ainda baixa o próprio comprovante');
  assert.ok(arquivo.rawPayload.equals(PNG));
});

test('isolamento: nenhuma listagem, resumo, relatório ou exportação da Bia traz dado da Ana', async (t) => {
  const ctx = await montar(t);
  const ana = await popularAna(ctx);
  await popularBia(ctx);
  const de = `${mes()}-01`;
  const ate = hoje();

  const leituras = [
    '/api/contas', '/api/categorias', '/api/movimentacoes', '/api/resumo', '/api/cartoes', '/api/compromissos',
    '/api/recorrencias', '/api/assinaturas', '/api/orcamento', '/api/metas', '/api/dividas', '/api/investimentos',
    '/api/patrimonio', '/api/moedas', `/api/fluxo?de=${de}&ate=${ate}`, '/api/fluxo/projecao', '/api/calendario',
    '/api/alertas', '/api/relatorios/evolucao', `/api/relatorios/categorias?de=${de}&ate=${ate}`,
    `/api/relatorios/maiores-despesas?de=${de}&ate=${ate}`, '/api/exportar/lancamentos.csv',
    '/api/exportar/compras-cartao.csv', '/api/exportar/tudo.json', `/api/cartoes/${ana.cartao}/faturas`,
  ];
  for (const url of leituras) {
    const res = await ctx.bia('GET', url);
    if (url.includes(`/api/cartoes/${ana.cartao}`)) {
      assert.equal(res.statusCode, 404, url);
      continue;
    }
    assert.equal(res.statusCode, 200, `${url}: ${res.body}`);
    assert.doesNotMatch(res.body, new RegExp(MARCA), `${url} vazou dado da Ana`);
    assert.doesNotMatch(res.body, /Poupança da Ana|recibo-da-ana/, url);
  }

  const contas = (await ctx.bia('GET', '/api/contas')).json().itens;
  assert.deepEqual(contas.map((c) => [c.nome, c.saldo_centavos]), [['Conta da Bia', 777]]);
  assert.equal((await ctx.bia('GET', '/api/movimentacoes')).json().total, 0);

  const copia = JSON.parse((await ctx.bia('GET', '/api/exportar/tudo.json')).body).dados;
  for (const tabela of ['movimentacoes', 'recorrencias', 'dividas', 'orcamentos', 'compras_cartao', 'anexos', 'moeda_cotacoes', 'investimentos_operacoes']) {
    assert.equal(copia[tabela].length, 0, `${tabela} da Bia`);
  }
  assert.equal(copia.contas.length, 1);
  assert.equal(copia.cartoes.length, 1);
  assert.ok(copia.categorias.every((c) => !c.nome.includes(MARCA)));
});

test('isolamento: toda rota da API com id em /api está na tabela deste teste (rota nova sem teste de isolamento quebra aqui)', async (t) => {
  const ctx = await montar(t);
  const ana = await popularAna(ctx);
  const bia = await popularBia(ctx);
  const cobertas = new Set(
    [...pedidosPorId(ana, bia), ...pedidosComIdNoCorpo(ana, bia)].map(([metodo, padrao]) => `${metodo} ${padrao.split('?')[0]}`),
  );
  // Rotas de conta/sessão do próprio usuário (sem recurso de outra pessoa no caminho) ficam de fora.
  const propriaSessao = new Set(['/api/login', '/api/logout', '/api/cadastro', '/api/senha', '/api/sessao', '/api/sessoes/encerrar-outras', '/api/conta', '/api/config', '/api/saude']);
  const faltando = ctx.app.rotas
    .filter((r) => !r.publica && !propriaSessao.has(r.url) && r.url.includes(':'))
    .map((r) => `${r.metodo} ${r.url}`)
    .filter((rota) => !cobertas.has(rota));
  assert.deepEqual(faltando, [], 'rotas com id sem teste de isolamento');
});

test('isolamento: excluir a conta da Ana não toca na da Bia (dados e comprovantes)', async (t) => {
  const ctx = await montar(t);
  const ana = await popularAna(ctx);
  await popularBia(ctx);
  await ctx.ana('POST', `/api/movimentacoes/${ana.mov}/anexos`, PNG, {
    'content-type': 'image/png',
    'x-nome-arquivo': encodeURIComponent('outro.png'),
  });
  const copiaBia = async () => JSON.parse((await ctx.bia('GET', '/api/exportar/tudo.json')).body).dados;
  const antesBia = await copiaBia();

  const res = await ctx.ana('DELETE', '/api/conta', { confirmacao: 'tester', senha: SENHA });
  assert.equal(res.statusCode, 204);

  assert.deepEqual(await copiaBia(), antesBia);
  assert.equal(ctx.armazenamento.caminhos().length, 0, 'os comprovantes da Ana saíram do armazenamento');
  const sobrou = await ctx.banco.consultar(
    `SELECT (SELECT COUNT(*) FROM contas WHERE usuario_id = $1) AS contas,
            (SELECT COUNT(*) FROM movimentacoes WHERE usuario_id = $1) AS movs,
            (SELECT COUNT(*) FROM audit_log WHERE usuario_id = $1) AS auditoria`,
    [ctx.usuarioId],
  );
  assert.deepEqual(sobrou[0], { contas: 0, movs: 0, auditoria: 0 });
  for (const tabela of TABELAS_DA_COPIA) {
    const [{ n }] = await ctx.banco.consultar(`SELECT COUNT(*) AS n FROM ${tabela} WHERE usuario_id = $1`, [ctx.usuarioId]);
    assert.equal(n, 0, tabela);
  }
});
