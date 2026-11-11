import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// O runtime das Netlify Functions não aceita require() de pacote só ESM (o Node local, sim). Um pacote CommonJS que
// faça isso derruba a função inteira com 502 ("This function has crashed"). Este teste carrega as funções num
// processo com `--no-experimental-require-module`, o mesmo comportamento do runtime, e faz requisições de verdade
// pelo handler: qualquer require() de ESM no caminho (no carregamento ou numa rota) falha aqui, antes do deploy.
// Variáveis e banco são falsos: as requisições escolhidas não precisam de banco (o driver só conecta sob demanda).

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

const ENV_FALSO = {
  DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_KEY: 'chave-falsa',
  SEGREDO_SESSAO: 'segredo-de-teste',
  SENHA_PEPPER: 'pepper-de-teste',
  HMAC_CHAVE_IP: 'chave-ip-de-teste',
  SITE_URL: 'https://meu-site.netlify.app',
};

const SCRIPT = `
const api = await import('./netlify/functions/api.mjs');
const manutencao = await import('./netlify/functions/manutencao.mjs');
const site = process.env.SITE_URL;
const saida = { api: typeof api.default, manutencao: typeof manutencao.default, respostas: {} };
const pedidos = {
  sessao: ['/api/sessao', {}],
  semSessao: ['/api/movimentacoes', {}],
  login: ['/api/login', { method: 'POST', headers: { origin: site, 'content-type': 'application/json' }, body: '{}' }],
  saude: ['/api/saude', {}],
};
for (const [nome, [caminho, init]] of Object.entries(pedidos)) {
  const resposta = await api.default(new Request(site + caminho, init), { ip: '203.0.113.7' });
  saida.respostas[nome] = { status: resposta.status, corpo: await resposta.text() };
}
console.log(JSON.stringify(saida));
process.exit(0);
`;

test('função do Netlify: carrega e responde com require() de ESM desligado, como no runtime', () => {
  const texto = execFileSync(
    process.execPath,
    ['--no-experimental-require-module', '--input-type=module', '-e', SCRIPT],
    { cwd: RAIZ, env: { ...process.env, ...ENV_FALSO }, encoding: 'utf8', timeout: 60_000 },
  );
  const { api, manutencao, respostas } = JSON.parse(texto.trim().split('\n').at(-1));

  assert.equal(api, 'function');
  assert.equal(manutencao, 'function');
  assert.equal(respostas.sessao.status, 200);
  assert.equal(JSON.parse(respostas.sessao.corpo).autenticado, false);
  assert.equal(respostas.semSessao.status, 401);
  assert.equal(respostas.login.status, 400, 'o login valida com Zod antes de tocar no banco');
  // Sem banco a saúde responde 503, mas responde: um 502 aqui seria a função caindo.
  assert.equal(respostas.saude.status, 503);
  for (const [nome, r] of Object.entries(respostas)) {
    assert.doesNotMatch(r.corpo, /require\(\) of ES Module|crashed/, nome);
  }
});

test('função do Netlify: só o servidor local carrega o @fastify/static (import dinâmico em app.js)', () => {
  const app = readFileSync(new URL('../servidor/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /^import .* from '@fastify\/static'/m, 'import estático derrubaria a função no Netlify');
  assert.match(app, /import\('@fastify\/static'\)/);
});
