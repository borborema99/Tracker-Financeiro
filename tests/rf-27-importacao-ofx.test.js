import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmarOfx, previaOfx } from '../servidor/banco/repositorios/importacao.js';
import { excluirMovimentacao, movimentacoesDoPeriodo } from '../servidor/banco/repositorios/movimentacoes.js';
import { resumoRealizado } from '../servidor/dominio/resumo.js';
import { CTX, HOST, ORIGEM, appDeTeste, bancoComPadroes, categoriaPorNome, entrar, novaConta, novaMov, saldoDe } from './ajuda.js';

const ofx = (transacoes, curdef = 'BRL') =>
  Buffer.from(
    `OFXHEADER:100\nCHARSET:1252\n\n<OFX><CURDEF>${curdef}<BANKTRANLIST>\n` +
      transacoes
        .map(([fitid, data, valor, memo]) => `<STMTTRN><DTPOSTED>${data}<TRNAMT>${valor}<FITID>${fitid}<MEMO>${memo}</STMTTRN>`)
        .join('\n') +
      '\n</BANKTRANLIST></OFX>',
    'latin1',
  );

const ARQUIVO = ofx([
  ['F1', '20260610', '-45.90', 'MERCADO CENTRAL'],
  ['F2', '20260611', '3000.00', 'SALARIO'],
  ['F3', '20260612', '-120.00', 'ENERGIA'],
]);

const itens = (previa, extra = {}) =>
  previa.itens.map((i) => ({ fitid: i.fitid, data: i.data, valor_centavos: i.valor_centavos, descricao: i.descricao, ...extra }));

test('RF-27: a prévia marca nova, já importada e possível duplicidade, e não grava nada', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 0);
  // Mesmo valor, data, conta e descrição de F1, lançado à mão.
  novaMov(db, { conta_id: conta.id, valor_centavos: 4590, data_competencia: '2026-06-10', data_liquidacao: '2026-06-10', descricao: 'mercado central' });
  const antes = db.prepare('SELECT COUNT(*) AS n FROM movimentacoes').get().n;

  const previa = previaOfx(db, conta.id, ARQUIVO);
  assert.deepEqual(previa.itens.map((i) => [i.fitid, i.situacao]), [['F1', 'possivel_duplicidade'], ['F2', 'nova'], ['F3', 'nova']]);
  assert.deepEqual(previa.resumo, { total: 3, novas: 2, ja_importadas: 0, possiveis_duplicidades: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimentacoes').get().n, antes);

  confirmarOfx(db, { conta_id: conta.id, itens: itens(previa).filter((i) => i.fitid === 'F2') }, CTX);
  const de = previaOfx(db, conta.id, ARQUIVO);
  assert.equal(de.itens.find((i) => i.fitid === 'F2').situacao, 'ja_importada');
});

test('RF-27: importar cria lançamentos liquidados que entram no saldo e no realizado, uma vez só', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 100000);
  const previa = previaOfx(db, conta.id, ARQUIVO);
  const r = confirmarOfx(db, { conta_id: conta.id, itens: itens(previa) }, CTX);
  assert.equal(r.importadas, 3);
  assert.equal(r.ignoradas, 0);
  assert.equal(saldoDe(db, conta.id), 100000 - 4590 + 300000 - 12000);

  const movs = movimentacoesDoPeriodo(db, '2026-06-01', '2026-06-30');
  assert.deepEqual(resumoRealizado(movs, '2026-06-01', '2026-06-30'), { receitas: 300000, despesas: 16590, resultado: 283410 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'importacao_ofx'").get().n, 1);
});

test('RF-27: o mesmo extrato importado de novo não duplica nada', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 0);
  const primeira = confirmarOfx(db, { conta_id: conta.id, itens: itens(previaOfx(db, conta.id, ARQUIVO)) }, CTX);
  assert.equal(primeira.importadas, 3);
  const saldo = saldoDe(db, conta.id);

  const repetida = previaOfx(db, conta.id, ARQUIVO);
  assert.equal(repetida.resumo.ja_importadas, 3);
  const segunda = confirmarOfx(db, { conta_id: conta.id, itens: itens(repetida) }, CTX);
  assert.deepEqual([segunda.importadas, segunda.ignoradas], [0, 3]);
  assert.equal(saldoDe(db, conta.id), saldo);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimentacoes WHERE excluida_em IS NULL').get().n, 3);

  // O mesmo FITID repetido dentro da própria confirmação também entra uma vez só.
  const outra = novaConta(db, 'Conta B', 0);
  const dobro = confirmarOfx(db, { conta_id: outra.id, itens: [...itens(repetida), ...itens(repetida)] }, CTX);
  assert.deepEqual([dobro.importadas, dobro.ignoradas], [3, 3]);
});

test('RF-27: quem excluiu o lançamento importado pode importar o extrato de novo; a duplicidade só avisa', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 0);
  const unica = ofx([['U1', '20260610', '-10.00', 'PADARIA']]);
  const { ids } = confirmarOfx(db, { conta_id: conta.id, itens: itens(previaOfx(db, conta.id, unica)) }, CTX);
  excluirMovimentacao(db, ids[0], CTX);
  assert.equal(previaOfx(db, conta.id, unica).itens[0].situacao, 'nova');
  const de = confirmarOfx(db, { conta_id: conta.id, itens: itens(previaOfx(db, conta.id, unica)) }, CTX);
  assert.equal(de.importadas, 1);
  assert.equal(saldoDe(db, conta.id), -1000);

  // Com um lançamento igual já existente (outra origem), confirmar não bloqueia: só conta o aviso.
  const manual = ofx([['M1', '20260620', '-33.00', 'Almoço']]);
  novaMov(db, { conta_id: conta.id, valor_centavos: 3300, data_competencia: '2026-06-20', data_liquidacao: '2026-06-20', descricao: 'almoco' });
  const r = confirmarOfx(db, { conta_id: conta.id, itens: itens(previaOfx(db, conta.id, manual)) }, CTX);
  assert.deepEqual([r.importadas, r.avisos_de_duplicidade], [1, 1]);
});

test('RF-27: tudo ou nada; categoria precisa combinar com receita ou despesa; conta arquivada e moeda estrangeira são recusadas', () => {
  const db = bancoComPadroes();
  const conta = novaConta(db, 'Conta A', 0);
  const salario = categoriaPorNome(db, 'Salário');
  const mercado = categoriaPorNome(db, 'Mercado');
  const previa = previaOfx(db, conta.id, ARQUIVO);

  // F1 é despesa e recebe categoria de receita: o lote inteiro falha e nada fica gravado.
  const ruim = itens(previa).map((i) => (i.fitid === 'F1' ? { ...i, categoria_id: salario.id } : i));
  assert.throws(() => confirmarOfx(db, { conta_id: conta.id, itens: ruim }, CTX));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimentacoes').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM importacoes_ofx').get().n, 0);

  const bom = itens(previa).map((i) => (i.fitid === 'F1' ? { ...i, categoria_id: mercado.id } : i));
  assert.equal(confirmarOfx(db, { conta_id: conta.id, itens: bom }, CTX).importadas, 3);

  assert.throws(() => previaOfx(db, conta.id, ofx([['D1', '20260601', '-1.00', 'X']], 'USD')), (e) => e.statusCode === 400 && /USD/.test(e.campos.arquivo));
  assert.throws(() => previaOfx(db, conta.id, Buffer.from('nada a ver')), (e) => e.statusCode === 400 && 'arquivo' in e.campos);
  assert.throws(() => previaOfx(db, 9999, ARQUIVO), (e) => e.statusCode === 404);
  db.prepare('UPDATE contas SET arquivada = 1 WHERE id = ?').run(conta.id);
  assert.throws(() => previaOfx(db, conta.id, ARQUIVO), (e) => e.statusCode === 400);
});

test('API importação: exige sessão, recebe o arquivo cru, confirma e não aceita corpo vazio nem excesso', async (t) => {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  for (const url of ['/api/importacao/ofx/previa?conta_id=1', '/api/importacao/ofx/confirmar']) {
    const r = await ctx.app.inject({ method: 'POST', url, headers: { host: HOST, origin: ORIGEM } });
    assert.equal(r.statusCode, 401, url);
  }
  const { cookie, csrf } = await entrar(ctx.app);
  const chamar = (url, payload, tipo = 'application/json') =>
    ctx.app.inject({ method: 'POST', url, headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf, 'content-type': tipo }, payload });
  const conta = novaConta(ctx.db, 'Conta A', 0);

  const vazio = await chamar(`/api/importacao/ofx/previa?conta_id=${conta.id}`, Buffer.alloc(0), 'application/x-ofx');
  assert.equal(vazio.statusCode, 400);
  const enorme = await chamar(`/api/importacao/ofx/previa?conta_id=${conta.id}`, Buffer.alloc(3 * 1024 * 1024, 65), 'application/x-ofx');
  assert.equal(enorme.statusCode, 413);

  const previa = await chamar(`/api/importacao/ofx/previa?conta_id=${conta.id}`, ARQUIVO, 'application/x-ofx');
  assert.equal(previa.statusCode, 200);
  assert.equal(previa.json().resumo.novas, 3);

  const lote = previa.json().itens.map(({ fitid, data, valor_centavos, descricao }) => ({ fitid, data, valor_centavos, descricao }));
  const confirmada = await chamar('/api/importacao/ofx/confirmar', JSON.stringify({ conta_id: conta.id, itens: lote }));
  assert.equal(confirmada.statusCode, 200);
  assert.equal(confirmada.json().importadas, 3);

  const zero = await chamar('/api/importacao/ofx/confirmar', JSON.stringify({ conta_id: conta.id, itens: [{ fitid: 'Z', data: '2026-06-01', valor_centavos: 0 }] }));
  assert.equal(zero.statusCode, 400);
  const nenhum = await chamar('/api/importacao/ofx/confirmar', JSON.stringify({ conta_id: conta.id, itens: [] }));
  assert.equal(nenhum.statusCode, 400);
});
