import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarApp } from '../servidor/app.js';
import { criarManipulador } from '../servidor/netlify.js';
import { chaveDoIp } from '../servidor/seguranca/tentativas.js';
import { SENHA, USUARIO, appDeTeste, banco } from './ajuda.js';

const contexto = (ip = '203.0.113.7') => ({ ip });

/** App falso: grava o que o manipulador entregou ao `inject` e devolve a resposta combinada. */
function appFalso(resposta) {
  const chamadas = [];
  return {
    chamadas,
    inject: async (opcoes) => {
      chamadas.push(opcoes);
      return { statusCode: 200, headers: {}, rawPayload: Buffer.from('ok'), ...resposta };
    },
  };
}

test('função: converte Request em inject, descarta x-forwarded-for e usa o IP do contexto do Netlify', async () => {
  const app = appFalso();
  const manipular = criarManipulador(async () => app);
  const req = new Request('https://meu-site.netlify.app/api/movimentacoes?pagina=2', {
    method: 'POST',
    headers: { 'x-forwarded-for': '1.2.3.4', 'content-type': 'application/json', cookie: '__Host-sessao=abc' },
    body: JSON.stringify({ a: 1 }),
  });
  const res = await manipular(req, contexto('203.0.113.7'));

  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
  const [chamada] = app.chamadas;
  assert.equal(chamada.method, 'POST');
  assert.equal(chamada.url, '/api/movimentacoes?pagina=2');
  assert.equal(chamada.remoteAddress, '203.0.113.7', 'o IP vem do contexto, não do cabeçalho');
  assert.equal(chamada.headers['x-forwarded-for'], undefined, 'cabeçalho forjável é descartado');
  assert.equal(chamada.headers['x-forwarded-proto'], 'https');
  assert.equal(chamada.headers.host, 'meu-site.netlify.app');
  assert.equal(chamada.headers.cookie, '__Host-sessao=abc');
  assert.equal(JSON.parse(chamada.payload.toString()).a, 1);
});

test('função: GET não leva corpo, e x-forwarded-proto forjado pelo cliente é sobrescrito pelo protocolo da URL', async () => {
  const app = appFalso();
  const manipular = criarManipulador(async () => app);
  await manipular(new Request('http://localhost:8888/api/saude', { headers: { 'x-forwarded-proto': 'https' } }), contexto());
  const [chamada] = app.chamadas;
  assert.equal(chamada.payload, undefined);
  assert.equal(chamada.headers['x-forwarded-proto'], 'http');
});

test('função: vários Set-Cookie saem como cabeçalhos separados e 204 não leva corpo', async () => {
  const app = appFalso({
    statusCode: 204,
    headers: { 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'], 'content-type': 'text/plain', connection: 'keep-alive' },
  });
  const res = await criarManipulador(async () => app)(new Request('https://x.netlify.app/api/logout', { method: 'POST' }), contexto());
  assert.equal(res.status, 204);
  assert.deepEqual(res.headers.getSetCookie(), ['a=1; Path=/', 'b=2; Path=/']);
  assert.equal(res.headers.get('connection'), null);
  assert.equal(res.body, null);
});

test('função: se a API não inicia (variável faltando, banco fora), responde 503 genérico, sem detalhe interno', async (t) => {
  t.mock.method(console, 'error', () => {});
  const manipular = criarManipulador(async () => {
    throw new Error('connect ECONNREFUSED postgres://usuario:segredo@host/db');
  });
  const res = await manipular(new Request('https://x.netlify.app/api/saude'), contexto());
  assert.equal(res.status, 503);
  const corpo = await res.text();
  assert.deepEqual(JSON.parse(corpo), { erro: 'Serviço indisponível.' });
  assert.doesNotMatch(corpo, /segredo|postgres/);
});

test('função: a mesma promessa do app é usada em toda invocação (instância criada uma vez)', async () => {
  let criacoes = 0;
  const app = appFalso();
  const promessa = (async () => {
    criacoes += 1;
    return app;
  })();
  const manipular = criarManipulador(() => promessa);
  for (let n = 0; n < 3; n++) await manipular(new Request('https://x.netlify.app/api/saude'), contexto());
  assert.equal(criacoes, 1);
  assert.equal(app.chamadas.length, 3);
});

test('função + app real: login pelo Netlify usa cookie __Host- Secure e conta o erro pelo IP do contexto (HMAC), não pelo x-forwarded-for', async (t) => {
  const { config, armazenamento } = await appDeTeste();
  const app = await criarApp({ config, banco, armazenamento, trustProxy: true, servirFront: false });
  t.after(() => app.close());
  const manipular = criarManipulador(async () => app);
  const login = (senha, ip, forjado) =>
    manipular(
      new Request('https://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://localhost:3000', ...(forjado ? { 'x-forwarded-for': forjado } : {}) },
        body: JSON.stringify({ usuario: USUARIO, senha }),
      }),
      contexto(ip),
    );

  const errado = await login('errada', '203.0.113.7', '9.9.9.9');
  assert.equal(errado.status, 401);
  const chaves = (await banco.consultar('SELECT chave FROM tentativas_login')).map((l) => l.chave);
  assert.ok(chaves.includes(chaveDoIp('203.0.113.7', config.chaveIp)), 'contou o IP do contexto');
  assert.ok(!chaves.includes(chaveDoIp('9.9.9.9', config.chaveIp)), 'ignorou o x-forwarded-for forjado');

  const certo = await login(SENHA, '203.0.113.8');
  assert.equal(certo.status, 200);
  const [cookie] = certo.headers.getSetCookie();
  assert.match(cookie, /^__Host-sessao=/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test('função + app real: cinco erros do mesmo IP do Netlify bloqueiam o IP (429), e o forjado não escapa do bloqueio', async (t) => {
  const { config, armazenamento } = await appDeTeste();
  const app = await criarApp({ config, banco, armazenamento, trustProxy: true, servirFront: false });
  t.after(() => app.close());
  const manipular = criarManipulador(async () => app);
  const tentar = (usuario, ip, forjado) =>
    manipular(
      new Request('https://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://localhost:3000', 'x-forwarded-for': forjado },
        body: JSON.stringify({ usuario, senha: 'x' }),
      }),
      contexto(ip),
    );
  for (const [n, nome] of ['c1', 'c2', 'c3', 'c4'].entries()) assert.equal((await tentar(nome, '198.51.100.9', `10.0.0.${n}`)).status, 401);
  const quinto = await tentar('c5', '198.51.100.9', '10.0.0.99');
  assert.equal(quinto.status, 429);
  assert.ok(Number(quinto.headers.get('retry-after')) > 0);
});

test('arquivos da função: a rota /api/* e a manutenção diária estão declaradas', async () => {
  const api = await import('../netlify/functions/api.mjs');
  const manutencao = await import('../netlify/functions/manutencao.mjs');
  assert.equal(api.config.path, '/api/*');
  assert.equal(typeof api.default, 'function');
  assert.equal(manutencao.config.schedule, '@daily');
  assert.equal(typeof manutencao.default, 'function');
});
