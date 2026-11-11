import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOME_DEMO, SENHA_DEMO, semearDemo } from '../servidor/demo/semear.js';
import { HOST, ORIGEM, PEPPER, appDeTeste, banco, entrar } from './ajuda.js';

// Revisão de segurança (ADR 013, Onda 5): nenhuma resposta da API entrega campo interno (id do dono, hash, caminho
// do arquivo no Storage, IP, token de sessão). Roda sobre a conta de demonstração, que tem dado em todos os módulos.

const PROIBIDOS = new Set([
  'usuario_id',
  'senha',
  'senha_hash',
  'hash',
  'hash_senha',
  'pepper',
  'segredo',
  'caminho_storage',
  'ip',
  'ip_hmac',
  'chave_ip',
  'token',
  'token_hash',
  'sessao_id',
]);

/** Caminhos (`a.b[0].c`) de toda chave proibida encontrada no JSON. */
function achados(valor, caminho = '$') {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => achados(v, `${caminho}[${i}]`));
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => [...(PROIBIDOS.has(k) ? [`${caminho}.${k}`] : []), ...achados(v, `${caminho}.${k}`)]);
  }
  return [];
}

test('vazamento: nenhuma rota de leitura sem parâmetro devolve campo interno', async (t) => {
  await semearDemo(banco, { pepper: PEPPER });
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie } = await entrar(app, SENHA_DEMO, NOME_DEMO);

  const leituras = app.rotas.filter((r) => r.metodo === 'GET' && !r.publica && !r.url.includes(':'));
  assert.ok(leituras.length >= 20, `rotas de leitura encontradas: ${leituras.length}`);

  let comJson = 0;
  for (const r of leituras) {
    const res = await app.inject({ method: 'GET', url: r.url, headers: { host: HOST, origin: ORIGEM, cookie } });
    assert.ok(res.statusCode < 500, `${r.url} respondeu ${res.statusCode}`);
    if (!/json/.test(String(res.headers['content-type']))) {
      assert.doesNotMatch(res.body, /usuario_id|caminho_storage|senha_hash/, `${r.url} (texto) traz campo interno`);
      continue;
    }
    comJson += 1;
    assert.deepEqual(achados(res.json()), [], `${r.url} traz campo interno`);
  }
  assert.ok(comJson >= 15, `respostas JSON conferidas: ${comJson}`);
});

test('vazamento: login, sessão e lista de sessões não entregam hash, token nem IP', async (t) => {
  await semearDemo(banco, { pepper: PEPPER });
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { res, cookie } = await entrar(app, SENHA_DEMO, NOME_DEMO);
  assert.deepEqual(achados(res.json()), []);
  const sessao = await app.inject({ method: 'GET', url: '/api/sessao', headers: { host: HOST, cookie } });
  assert.deepEqual(achados(sessao.json()), []);
  // O token da sessão vive só no cookie HttpOnly: nunca no corpo de uma resposta.
  const token = decodeURIComponent(cookie.split('=')[1]);
  assert.ok(!res.body.includes(token) && !sessao.body.includes(token));
});
