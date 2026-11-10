import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUCKET_DE_COMPROVANTES, criarArmazenamentoMemoria, criarArmazenamentoPasta, criarArmazenamentoSupabase } from '../servidor/armazenamento/index.js';

const CHAVE = 'chave-de-servico-ficticia';
const URL_BASE = 'https://projeto.supabase.co/';

/** `fetch` falso: guarda os pedidos e responde com o que o teste combinar. */
function buscarFalso(responder) {
  const pedidos = [];
  const buscar = async (endereco, opcoes) => {
    pedidos.push({ endereco, ...opcoes });
    return responder({ endereco, ...opcoes });
  };
  return { buscar, pedidos };
}

test('supabase: guardar envia POST ao bucket privado com a chave só nos cabeçalhos e sem sobrescrever', async () => {
  const { buscar, pedidos } = buscarFalso(() => new Response('{}', { status: 200 }));
  const arm = criarArmazenamentoSupabase({ url: URL_BASE, chave: CHAVE, buscar });
  await arm.guardar('12/abc-123', Buffer.from('conteudo'), 'image/png');

  const [p] = pedidos;
  assert.equal(p.method, 'POST');
  assert.equal(p.endereco, `https://projeto.supabase.co/storage/v1/object/${BUCKET_DE_COMPROVANTES}/12/abc-123`);
  assert.equal(p.headers.Authorization, `Bearer ${CHAVE}`);
  assert.equal(p.headers['Content-Type'], 'image/png');
  assert.equal(p.headers['x-upsert'], 'false');
  assert.doesNotMatch(p.endereco, new RegExp(CHAVE), 'a chave nunca vai na URL');
  assert.equal(BUCKET_DE_COMPROVANTES, 'comprovantes');
});

test('supabase: guardar falha com mensagem sem chave nem endereço quando o Storage recusa ou fica fora do ar', async () => {
  const recusa = criarArmazenamentoSupabase({ url: URL_BASE, chave: CHAVE, buscar: buscarFalso(() => new Response('{}', { status: 409 })).buscar });
  await assert.rejects(async () => await recusa.guardar('1/a', Buffer.from('x'), 'image/png'), /HTTP 409/);

  const forado = criarArmazenamentoSupabase({
    url: URL_BASE,
    chave: CHAVE,
    buscar: async () => {
      throw Object.assign(new Error(`falhou ${URL_BASE} com ${CHAVE}`), { name: 'TypeError' });
    },
  });
  await assert.rejects(
    async () => await forado.guardar('1/a', Buffer.from('x'), 'image/png'),
    (erro) => /armazenamento de arquivos: TypeError/.test(erro.message) && !erro.message.includes(CHAVE) && !erro.message.includes('supabase.co'),
  );
});

test('supabase: ler usa o endpoint autenticado, devolve o Buffer e trata ausente (400/404) como null', async () => {
  const conteudo = Buffer.from([1, 2, 3, 4]);
  const { buscar, pedidos } = buscarFalso(({ endereco }) =>
    endereco.endsWith('/existe') ? new Response(conteudo, { status: 200 }) : new Response('{}', { status: endereco.endsWith('/400') ? 400 : 404 }),
  );
  const arm = criarArmazenamentoSupabase({ url: URL_BASE, chave: CHAVE, buscar });

  assert.ok((await arm.ler('1/existe')).equals(conteudo));
  assert.equal(pedidos[0].endereco, `https://projeto.supabase.co/storage/v1/object/authenticated/${BUCKET_DE_COMPROVANTES}/1/existe`);
  assert.equal(await arm.ler('1/400'), null);
  assert.equal(await arm.ler('1/sumiu'), null);

  const quebrado = criarArmazenamentoSupabase({ url: URL_BASE, chave: CHAVE, buscar: buscarFalso(() => new Response('', { status: 500 })).buscar });
  await assert.rejects(async () => await quebrado.ler('1/x'), /HTTP 500/);
});

test('supabase: apagar chama DELETE e tolera objeto inexistente', async () => {
  const { buscar, pedidos } = buscarFalso(({ endereco }) => new Response('{}', { status: endereco.endsWith('/sumiu') ? 404 : 200 }));
  const arm = criarArmazenamentoSupabase({ url: URL_BASE, chave: CHAVE, buscar });
  await arm.apagar('1/existe');
  await arm.apagar('1/sumiu');
  assert.equal(pedidos[0].method, 'DELETE');
  const quebrado = criarArmazenamentoSupabase({ url: URL_BASE, chave: CHAVE, buscar: buscarFalso(() => new Response('', { status: 500 })).buscar });
  await assert.rejects(async () => await quebrado.apagar('1/x'), /HTTP 500/);
});

test('supabase: caminho é codificado por segmento e exige URL e chave', async () => {
  const { buscar, pedidos } = buscarFalso(() => new Response('{}', { status: 200 }));
  const arm = criarArmazenamentoSupabase({ url: URL_BASE, chave: CHAVE, buscar });
  await arm.apagar('7/a b#c?d');
  assert.ok(pedidos[0].endereco.endsWith('/7/a%20b%23c%3Fd'));
  assert.throws(() => criarArmazenamentoSupabase({ url: '', chave: CHAVE }), /SUPABASE_URL e SUPABASE_SERVICE_KEY/);
  assert.throws(() => criarArmazenamentoSupabase({ url: URL_BASE, chave: '' }), /SUPABASE_URL e SUPABASE_SERVICE_KEY/);
});

test('memória: guardar não sobrescreve, ler devolve cópia, apagar do que não existe não é erro', async () => {
  const arm = criarArmazenamentoMemoria();
  await arm.guardar('1/a', Buffer.from('um'));
  await assert.rejects(async () => await arm.guardar('1/a', Buffer.from('dois')), /Já existe/);
  assert.equal((await arm.ler('1/a')).toString(), 'um');
  assert.equal(await arm.ler('1/b'), null);
  await arm.apagar('1/b');
  await arm.apagar('1/a');
  assert.deepEqual(arm.caminhos(), []);
});

test('pasta: guarda, lê e apaga em disco, não sobrescreve e recusa caminho fora da pasta', async (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'tracker-anexos-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 }));
  const arm = criarArmazenamentoPasta(pasta);

  await arm.guardar('5/abc', Buffer.from('conteudo'));
  assert.deepEqual(readdirSync(join(pasta, '5')), ['abc']);
  assert.equal((await arm.ler('5/abc')).toString(), 'conteudo');
  await assert.rejects(async () => await arm.guardar('5/abc', Buffer.from('outro')));
  assert.equal(await arm.ler('5/nao-tem'), null);
  await assert.rejects(async () => await arm.ler('../fora'), /Caminho inválido/);
  await assert.rejects(async () => await arm.guardar('../../fora', Buffer.from('x')), /Caminho inválido/);
  await arm.apagar('5/abc');
  await arm.apagar('5/abc'); // de novo: sem erro
  assert.equal(await arm.ler('5/abc'), null);
});
