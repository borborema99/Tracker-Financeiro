import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TABELAS_DA_COPIA } from '../servidor/banco/repositorios/exportacao.js';
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
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
const mesAtual = () => hoje().slice(0, 7);

const categorias = async (chamar) => (await chamar('GET', '/api/categorias')).json();
const porNome = (lista, nome) => (lista.itens ?? lista).find((c) => c.nome === nome);

async function contaComSaldo(chamar) {
  return (await chamar('POST', '/api/contas', { nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 500000 })).json();
}

test('API planejamento: as rotas exigem sessão', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  for (const url of ['/api/orcamento', '/api/metas', '/api/metas/1']) {
    const res = await app.inject({ method: 'GET', url, headers: { host: HOST } });
    assert.equal(res.statusCode, 401, url);
  }
});

test('API orçamento: define o limite, mostra o gasto do mês e mantém o resto sem orçamento', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);
  const lista = await categorias(chamar);
  const lazer = porNome(lista, 'Lazer');
  const saude = porNome(lista, 'Saúde');

  const vazio = (await chamar('GET', '/api/orcamento')).json();
  assert.deepEqual(vazio.itens, []);
  assert.equal(vazio.mes, mesAtual());

  assert.equal((await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: mesAtual(), limite_centavos: 30000 })).statusCode, 200);
  const lancar = (categoria, valor) =>
    chamar('POST', '/api/movimentacoes', {
      tipo: 'despesa', conta_id: conta.id, categoria_id: categoria.id, valor_centavos: valor, descricao: 'x',
      data_competencia: hoje(), status: 'liquidada', data_liquidacao: hoje(),
    });
  assert.equal((await lancar(lazer, 25000)).statusCode, 201);
  assert.equal((await lancar(saude, 4000)).statusCode, 201);

  const o = (await chamar('GET', '/api/orcamento')).json();
  assert.equal(o.itens.length, 1);
  assert.equal(o.itens[0].realizado_centavos, 25000);
  assert.equal(o.itens[0].situacao, 'atencao');
  assert.equal(o.itens[0].restante_centavos, 5000);
  assert.deepEqual(o.sem_orcamento.map((s) => [s.nome, s.realizado_centavos]), [['Saúde', 4000]]);

  const anterior = (await chamar('GET', '/api/orcamento?mes=2000-01')).json();
  assert.deepEqual(anterior.itens, [], 'antes do mês de início não há limite');
});

test('API orçamento: valida categoria, mês e limite, e responde 400 com os campos', async (t) => {
  const { chamar } = await sessao(t);
  const lista = await categorias(chamar);
  const mercado = porNome(lista, 'Mercado');
  const salario = porNome(lista, 'Salário');
  const lazer = porNome(lista, 'Lazer');

  const sub = await chamar('PUT', `/api/orcamento/${mercado.id}`, { mes_inicio: mesAtual(), limite_centavos: 1000 });
  assert.equal(sub.statusCode, 400);
  assert.ok(sub.json().campos.categoria_id);
  assert.equal((await chamar('PUT', `/api/orcamento/${salario.id}`, { mes_inicio: mesAtual(), limite_centavos: 1000 })).statusCode, 400);
  assert.equal((await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: '2026-13', limite_centavos: 1000 })).statusCode, 400);
  assert.equal((await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: mesAtual(), limite_centavos: -1 })).statusCode, 400);
  assert.equal((await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: mesAtual(), limite_centavos: 10.5 })).statusCode, 400);
  assert.equal((await chamar('PUT', '/api/orcamento/abc', { mes_inicio: mesAtual(), limite_centavos: 1000 })).statusCode, 404);
  assert.equal((await chamar('GET', '/api/orcamento?mes=2026-1')).statusCode, 400);
});

test('API orçamento: cada alteração fica no histórico e a categoria com orçamento não vira subcategoria nem é excluída', async (t) => {
  const { chamar, db } = await sessao(t);
  const lista = await categorias(chamar);
  const lazer = porNome(lista, 'Lazer');
  const vestuario = porNome(lista, 'Vestuário');
  await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: mesAtual(), limite_centavos: 30000 });
  await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: mesAtual(), limite_centavos: 40000 });
  const acoes = (await db.todos("SELECT acao FROM audit_log WHERE entidade = 'orcamento' ORDER BY id", [])).map((l) => l.acao);
  assert.deepEqual(acoes, ['criar', 'editar']);

  await chamar('PUT', `/api/orcamento/${vestuario.id}`, { mes_inicio: mesAtual(), limite_centavos: 10000 });
  const mover = await chamar('PUT', `/api/categorias/${vestuario.id}`, { nome: 'Vestuário', tipo: 'despesa', pai_id: lazer.id, arquivada: false });
  assert.equal(mover.statusCode, 400);
  assert.ok(mover.json().campos.pai_id);
  const excluir = await chamar('DELETE', `/api/categorias/${vestuario.id}`);
  assert.equal(excluir.statusCode, 409);

  await chamar('PUT', `/api/orcamento/${vestuario.id}`, { mes_inicio: mesAtual(), limite_centavos: 0 });
  assert.equal((await chamar('DELETE', `/api/categorias/${vestuario.id}`)).statusCode, 204, 'zerado o limite, pode excluir');
});

test('API orçamento: estouro gera alerta calculado, e sem limite não há alerta nem bloco no resumo', async (t) => {
  const { chamar } = await sessao(t);
  const conta = await contaComSaldo(chamar);
  const lazer = porNome(await categorias(chamar), 'Lazer');

  const antes = (await chamar('GET', '/api/resumo')).json();
  assert.equal('orcamento' in antes, false);
  assert.equal('metas' in antes, false);
  assert.equal((await chamar('GET', '/api/alertas')).json().alertas.some((a) => a.codigo.startsWith('orcamento')), false);

  await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: mesAtual(), limite_centavos: 10000 });
  await chamar('POST', '/api/movimentacoes', {
    tipo: 'despesa', conta_id: conta.id, categoria_id: lazer.id, valor_centavos: 12000, descricao: 'Show',
    data_competencia: hoje(), status: 'liquidada', data_liquidacao: hoje(),
  });
  const alerta = (await chamar('GET', '/api/alertas')).json().alertas.find((a) => a.codigo === 'orcamento_estourado');
  assert.ok(alerta);
  assert.match(alerta.mensagem, /Lazer \(120%\)/);
  assert.equal(alerta.link, '/orcamento');
  const resumo = (await chamar('GET', '/api/resumo')).json();
  assert.equal(resumo.orcamento.estourados, 1);
  assert.equal(resumo.orcamento.limite_centavos, 10000);
});

test('API metas: criar, aportar, resgatar, editar e excluir, com o progresso calculado pelo servidor', async (t) => {
  const { chamar } = await sessao(t);
  const prazo = `${Number(hoje().slice(0, 4)) + 1}-12-31`;
  const criada = await chamar('POST', '/api/metas', { nome: 'Viagem', valor_alvo_centavos: 600000, prazo });
  assert.equal(criada.statusCode, 201);
  const id = criada.json().id;
  assert.equal(criada.json().acumulado_centavos, 0);
  assert.ok(criada.json().necessario_por_mes_centavos > 0);

  const aportou = await chamar('POST', `/api/metas/${id}/aportes`, { tipo: 'aporte', valor_centavos: 150000, data: hoje() });
  assert.equal(aportou.statusCode, 201);
  assert.equal(aportou.json().acumulado_centavos, 150000);
  assert.equal(aportou.json().percentual, 25);

  const recusado = await chamar('POST', `/api/metas/${id}/aportes`, { tipo: 'resgate', valor_centavos: 150001, data: hoje() });
  assert.equal(recusado.statusCode, 409);
  assert.equal((await chamar('POST', `/api/metas/${id}/aportes`, { tipo: 'aporte', valor_centavos: 0, data: hoje() })).statusCode, 400);
  assert.equal((await chamar('POST', `/api/metas/${id}/aportes`, { tipo: 'outro', valor_centavos: 5, data: hoje() })).statusCode, 400);

  const resumo = (await chamar('GET', '/api/resumo')).json();
  assert.deepEqual(resumo.metas, { abertas: 1, atrasadas: 0, acumulado_centavos: 150000, alvo_centavos: 600000 });

  const editada = await chamar('PUT', `/api/metas/${id}`, { nome: 'Viagem Europa', valor_alvo_centavos: 150000, prazo: null });
  assert.equal(editada.json().situacao, 'concluida');
  assert.equal(editada.json().necessario_por_mes_centavos, null);

  const { aportes } = (await chamar('GET', `/api/metas/${id}`)).json();
  const removida = await chamar('DELETE', `/api/metas/${id}/aportes/${aportes[0].id}`);
  assert.equal(removida.json().acumulado_centavos, 0);
  assert.equal((await chamar('DELETE', `/api/metas/${id}/aportes/abc`)).statusCode, 404);

  assert.equal((await chamar('DELETE', `/api/metas/${id}`)).statusCode, 204);
  assert.equal((await chamar('GET', `/api/metas/${id}`)).statusCode, 404);
  assert.deepEqual((await chamar('GET', '/api/metas')).json().itens, []);
});

test('API metas: o nome é obrigatório e o valor alvo precisa ser positivo', async (t) => {
  const { chamar } = await sessao(t);
  const sem = await chamar('POST', '/api/metas', { nome: '  ', valor_alvo_centavos: 1000 });
  assert.equal(sem.statusCode, 400);
  assert.ok(sem.json().campos.nome);
  assert.equal((await chamar('POST', '/api/metas', { nome: 'X', valor_alvo_centavos: 0 })).statusCode, 400);
  assert.equal((await chamar('POST', '/api/metas', { nome: 'X', valor_alvo_centavos: 1000, prazo: '2026-02-30' })).statusCode, 400);
});

test('Planejamento: a cópia JSON inclui orçamentos e metas', async (t) => {
  assert.ok(['orcamentos', 'metas', 'metas_aportes'].every((tabela) => TABELAS_DA_COPIA.includes(tabela)));
  const { chamar } = await sessao(t);
  const lazer = porNome(await categorias(chamar), 'Lazer');
  await chamar('PUT', `/api/orcamento/${lazer.id}`, { mes_inicio: mesAtual(), limite_centavos: 1000 });
  await chamar('POST', '/api/metas', { nome: 'Reserva', valor_alvo_centavos: 5000 });
  const copia = (await chamar('GET', '/api/exportar/tudo.json')).json();
  assert.equal(copia.dados.orcamentos.length, 1);
  assert.equal(copia.dados.metas[0].nome, 'Reserva');
});
