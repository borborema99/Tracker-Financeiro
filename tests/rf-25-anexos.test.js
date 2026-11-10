import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarArmazenamentoMemoria } from '../servidor/armazenamento/index.js';
import { TABELAS_DA_COPIA } from '../servidor/banco/repositorios/exportacao.js';
import { excluirMovimentacao } from '../servidor/banco/repositorios/movimentacoes.js';
import { anexarArquivo, listarAnexos, obterArquivo, removerAnexo } from '../servidor/banco/repositorios/anexos.js';
import { detectarTipo, nomeSeguro } from '../servidor/dominio/anexo.js';
import { CTX, HOST, ORIGEM, appDeTeste, bancoComPadroes, entrar, novaConta, novaMov } from './ajuda.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('conteudo-ficticio-1')]);
const PDF = Buffer.from('%PDF-1.4\nconteudo ficticio\n');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-ficticio')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);

test('RF-25: o tipo vem dos bytes do arquivo, não do nome nem do tipo declarado', () => {
  assert.equal(detectarTipo(PNG), 'image/png');
  assert.equal(detectarTipo(PDF), 'application/pdf');
  assert.equal(detectarTipo(JPG), 'image/jpeg');
  assert.equal(detectarTipo(WEBP), 'image/webp');
  assert.equal(detectarTipo(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(detectarTipo(Buffer.from('MZ\x90\x00')), null);
  assert.equal(detectarTipo(Buffer.alloc(0)), null);
  assert.equal(detectarTipo('texto'), null);
});

test('RF-25: o nome guardado não tem pasta nem caractere perigoso e leva a extensão do tipo real', () => {
  assert.equal(nomeSeguro('../../etc/passwd.png', 'application/pdf'), 'passwd.pdf');
  assert.equal(nomeSeguro('C:\\Users\\x\\recibo".exe', 'image/png'), 'recibo.png');
  assert.equal(nomeSeguro('nota\r\nSet-Cookie: x.pdf', 'application/pdf'), 'notaSet-Cookie x.pdf');
  assert.equal(nomeSeguro('', 'image/jpeg'), 'comprovante.jpg');
  assert.equal(nomeSeguro('a'.repeat(400) + '.png', 'image/png').length, 114);
});

async function cenario() {
  const db = await bancoComPadroes();
  const conta = await novaConta(db, 'Conta A', 100000);
  const mov = await novaMov(db, { conta_id: conta.id, descricao: 'Mercado' });
  return { db, mov, arm: criarArmazenamentoMemoria() };
}

test('RF-25: anexa em lançamento existente, lista sem o conteúdo e devolve o arquivo igual ao enviado', async () => {
  const { db, mov, arm } = await cenario();
  const anexo = await anexarArquivo(db, arm, mov.id, { nome: 'recibo.png', conteudo: PNG }, CTX);
  assert.equal(anexo.tipo_mime, 'image/png');
  assert.equal(anexo.tamanho_bytes, PNG.length);
  assert.equal(anexo.caminho_storage, undefined, 'o caminho interno do Storage não vaza');
  const itens = await listarAnexos(db, mov.id);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].conteudo, undefined);
  assert.ok((await obterArquivo(db, arm, anexo.id)).conteudo.equals(PNG));
  await assert.rejects(async () => await anexarArquivo(db, arm, 9999, { nome: 'a.png', conteudo: PNG }, CTX), (e) => e.statusCode === 404);
  assert.equal(arm.caminhos().length, 1, 'nada foi enviado para um lançamento que não existe');
});

test('RF-25: o arquivo vai para o Storage em <usuario>/<uuid>, nunca para o banco', async () => {
  const { db, mov, arm } = await cenario();
  const anexo = await anexarArquivo(db, arm, mov.id, { nome: 'recibo.png', conteudo: PNG }, CTX);
  const [caminho] = arm.caminhos();
  assert.match(caminho, new RegExp(`^${db.usuarioId}/[0-9a-f-]{36}$`));
  const linha = await db.um('SELECT * FROM anexos WHERE id = ?', [anexo.id]);
  assert.equal(linha.caminho_storage, caminho);
  assert.equal('conteudo' in linha, false);
});

test('RF-25: recusa tipo não aceito, arquivo vazio, grande demais, repetido e além do limite por lançamento', async () => {
  const { db, mov, arm } = await cenario();
  const campo = (e) => e.statusCode === 400 && 'arquivo' in e.campos;
  await assert.rejects(async () => await anexarArquivo(db, arm, mov.id, { nome: 'x.png', conteudo: Buffer.from('<?php echo 1; ?>') }, CTX), campo);
  await assert.rejects(async () => await anexarArquivo(db, arm, mov.id, { nome: 'x.png', conteudo: Buffer.alloc(0) }, CTX), campo);
  await assert.rejects(async () => await anexarArquivo(db, arm, mov.id, { nome: 'x.pdf', conteudo: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]) }, CTX), campo);
  assert.equal(arm.caminhos().length, 0, 'arquivo recusado não chega ao Storage');

  await anexarArquivo(db, arm, mov.id, { nome: 'a.png', conteudo: PNG }, CTX);
  await assert.rejects(async () => await anexarArquivo(db, arm, mov.id, { nome: 'copia.png', conteudo: PNG }, CTX), (e) => e.statusCode === 409);
  for (let i = 1; i < 10; i += 1) {
    await anexarArquivo(db, arm, mov.id, { nome: `p${i}.pdf`, conteudo: Buffer.concat([PDF, Buffer.from(String(i))]) }, CTX);
  }
  await assert.rejects(async () => await anexarArquivo(db, arm, mov.id, { nome: 'um-a-mais.pdf', conteudo: Buffer.concat([PDF, Buffer.from('x')]) }, CTX), (e) => e.statusCode === 409);
  assert.equal(arm.caminhos().length, 10);
});

test('RF-25: se o Storage falha, nada fica registrado; se o banco falha depois do envio, o arquivo é apagado', async () => {
  const { db, mov } = await cenario();
  const quebrado = { ...criarArmazenamentoMemoria(), guardar: async () => { throw new Error('Storage fora do ar'); } };
  await assert.rejects(async () => await anexarArquivo(db, quebrado, mov.id, { nome: 'a.png', conteudo: PNG }, CTX), /Storage fora do ar/);
  assert.equal((await listarAnexos(db, mov.id)).length, 0);

  // O banco recusa o registro (o nome estoura o limite da coluna): o objeto já enviado precisa ser desfeito.
  const arm = criarArmazenamentoMemoria();
  await db.rodar('ALTER TABLE anexos ADD CONSTRAINT teste_recusa CHECK (nome <> \'recusado.png\')', []);
  await assert.rejects(async () => await anexarArquivo(db, arm, mov.id, { nome: 'recusado.png', conteudo: PNG }, CTX));
  assert.equal(arm.caminhos().length, 0, 'objeto órfão foi apagado');
});

test('RF-25: remover apaga o objeto do Storage e mantém o registro no audit_log; lançamento excluído esconde os anexos', async () => {
  const { db, mov, arm } = await cenario();
  const a = await anexarArquivo(db, arm, mov.id, { nome: 'a.png', conteudo: PNG }, CTX);
  const b = await anexarArquivo(db, arm, mov.id, { nome: 'b.pdf', conteudo: PDF }, CTX);
  await removerAnexo(db, arm, a.id, CTX);
  assert.equal(await obterArquivo(db, arm, a.id), null);
  assert.equal(arm.caminhos().length, 1, 'só o objeto de b continua no Storage');
  const removido = await db.um('SELECT caminho_storage, excluido_em FROM anexos WHERE id = ?', [a.id]);
  assert.equal(removido.caminho_storage, null);
  assert.ok(removido.excluido_em);
  assert.equal((await db.um("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'anexo' AND acao = 'excluir'", [])).n, 1);
  await assert.rejects(async () => await removerAnexo(db, arm, a.id, CTX), (e) => e.statusCode === 404);
  assert.equal((await listarAnexos(db, mov.id)).length, 1);

  await excluirMovimentacao(db, mov.id, CTX);
  assert.equal(await listarAnexos(db, mov.id), null);
  assert.equal(await obterArquivo(db, arm, b.id), null);
});

test('RF-25: o JSON exportado leva o registro dos anexos, nunca o conteúdo', () => {
  assert.ok(TABELAS_DA_COPIA.includes('anexos'));
  assert.ok(!TABELAS_DA_COPIA.includes('anexos_arquivos'));
});

async function sessao(t) {
  const ctx = await appDeTeste();
  t.after(ctx.fechar);
  const { cookie, csrf } = await entrar(ctx.app);
  const chamar = (method, url, { payload, headers = {} } = {}) =>
    ctx.app.inject({ method, url, headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf, ...headers }, payload });
  return { ...ctx, chamar };
}

test('API anexos: exigem sessão e CSRF, aceitam o arquivo cru e servem com nosniff e o tipo real', async (t) => {
  const { app, db, chamar } = await sessao(t);
  for (const [metodo, url] of [['GET', '/api/movimentacoes/1/anexos'], ['POST', '/api/movimentacoes/1/anexos'], ['GET', '/api/anexos/1/arquivo'], ['DELETE', '/api/anexos/1']]) {
    const r = await app.inject({ method: metodo, url, headers: { host: HOST, origin: ORIGEM } });
    assert.equal(r.statusCode, 401, `${metodo} ${url}`);
  }

  const conta = await novaConta(db, 'Conta A', 1000);
  const mov = await novaMov(db, { conta_id: conta.id });
  const url = `/api/movimentacoes/${mov.id}/anexos`;

  const semNome = await chamar('POST', url, { payload: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(semNome.statusCode, 400);
  const falso = await chamar('POST', url, {
    payload: Buffer.from('<script>alert(1)</script>'),
    headers: { 'content-type': 'image/png', 'x-nome-arquivo': encodeURIComponent('foto.png') },
  });
  assert.equal(falso.statusCode, 400);

  const criado = await chamar('POST', url, {
    payload: PNG,
    headers: { 'content-type': 'application/octet-stream', 'x-nome-arquivo': encodeURIComponent('Recibo do mercado.jpg') },
  });
  assert.equal(criado.statusCode, 201);
  assert.equal(criado.json().nome, 'Recibo do mercado.png');
  assert.equal(criado.json().caminho_storage, undefined);

  const arquivo = await chamar('GET', `/api/anexos/${criado.json().id}/arquivo`);
  assert.equal(arquivo.statusCode, 200);
  assert.equal(arquivo.headers['content-type'], 'image/png');
  assert.equal(arquivo.headers['x-content-type-options'], 'nosniff');
  assert.match(arquivo.headers['content-disposition'], /^inline;/);
  assert.equal(arquivo.headers['cache-control'], 'private, no-store');
  assert.ok(arquivo.rawPayload.equals(PNG));

  const pdf = await chamar('POST', url, { payload: PDF, headers: { 'content-type': 'application/pdf', 'x-nome-arquivo': 'nota.pdf' } });
  const baixa = await chamar('GET', `/api/anexos/${pdf.json().id}/arquivo`);
  assert.match(baixa.headers['content-disposition'], /^attachment;/);

  const grande = await chamar('POST', url, {
    payload: Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]),
    headers: { 'content-type': 'application/pdf', 'x-nome-arquivo': 'enorme.pdf' },
  });
  assert.equal(grande.statusCode, 413);

  assert.equal((await chamar('DELETE', `/api/anexos/${criado.json().id}`)).statusCode, 204);
  assert.equal((await chamar('GET', `/api/anexos/${criado.json().id}/arquivo`)).statusCode, 404);
  assert.equal((await chamar('GET', '/api/movimentacoes/9999/anexos')).statusCode, 404);
});
