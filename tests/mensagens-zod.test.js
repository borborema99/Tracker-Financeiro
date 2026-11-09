import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { z } from 'zod';
import { esquemaCategoria } from '../contratos/categorias.js';
import { esquemaConta } from '../contratos/contas.js';
import { esquemaConfig } from '../contratos/config.js';
import { esquemaFiltros } from '../contratos/movimentacoes.js';
import { mensagemPadrao } from '../contratos/mensagens.js';
import { HOST, ORIGEM, appDeTeste, entrar } from './ajuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const mensagens = (esquema, entrada) => {
  const r = esquema.safeParse(entrada);
  assert.equal(r.success, false);
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join('.') || '_', i.message]));
};
// Marcas de mensagem em inglês do Zod; nenhuma pode chegar à tela.
const INGLES = /\b(Invalid|Expected|Required|Too (small|big)|received|must be|String must|Number must)\b/i;

test('mensagens do Zod: tipo errado e campo ausente vêm em português', () => {
  const faltando = mensagens(esquemaConta, { saldo_inicial_centavos: 'abc' });
  assert.equal(faltando.nome, 'Campo obrigatório.');
  assert.equal(faltando.tipo, 'Escolha o tipo da conta.', 'mensagem própria do contrato continua valendo');
  assert.equal(faltando.saldo_inicial_centavos, 'Informe um valor.');

  const texto = mensagens(z.object({ nome: z.string() }), { nome: 7 });
  assert.equal(texto.nome, 'Valor inválido: informe um(a) texto.');
  assert.equal(mensagens(z.object({ n: z.number() }), {}).n, 'Campo obrigatório.');
});

test('mensagens do Zod: limites, formatos e opções sem texto próprio vêm em português', () => {
  assert.equal(mensagens(z.object({ s: z.string().min(3) }), { s: 'ab' }).s, 'Informe pelo menos 3 caracteres.');
  assert.equal(mensagens(z.object({ s: z.string().min(1) }), { s: '' }).s, 'Campo obrigatório.');
  assert.equal(mensagens(z.object({ s: z.string().max(1) }), { s: 'ab' }).s, 'Informe no máximo 1 caractere.');
  assert.equal(mensagens(z.object({ n: z.number().min(5) }), { n: 1 }).n, 'O valor mínimo é 5.');
  assert.equal(mensagens(z.object({ n: z.number().max(5) }), { n: 9 }).n, 'O valor máximo é 5.');
  assert.equal(mensagens(z.object({ n: z.number().gt(5) }), { n: 1 }).n, 'O valor deve ser maior que 5.');
  assert.equal(mensagens(z.object({ a: z.array(z.string()).min(2) }), { a: [] }).a, 'Informe pelo menos 2 itens.');
  assert.equal(mensagens(z.object({ e: z.string().email() }), { e: 'x' }).e, 'E-mail inválido.');
  assert.equal(mensagens(z.object({ e: z.string().regex(/^a$/) }), { e: 'x' }).e, 'Formato inválido.');
  assert.equal(mensagens(z.object({ e: z.enum(['a', 'b']) }), { e: 'c' }).e, 'Escolha uma opção válida.');
  assert.equal(mensagens(z.object({ n: z.number().multipleOf(5) }), { n: 3 }).n, 'O valor deve ser múltiplo de 5.');
  assert.equal(mensagens(z.strictObject({ a: z.string() }), { a: 'x', b: 1 })._, 'Campo não reconhecido.');
  assert.equal(mensagemPadrao({ code: 'qualquer_outro' }), 'Valor inválido.');
});

test('mensagens do Zod: nenhum contrato devolve texto em inglês para entrada inválida', () => {
  const casos = [
    [esquemaConta, {}],
    [esquemaConta, { nome: 'x'.repeat(61), tipo: 'cripto', saldo_inicial_centavos: 1.5 }],
    [esquemaCategoria, { nome: 5, tipo: 'x', pai_id: 'a' }],
    [esquemaConfig, { fuso: 3 }],
    [esquemaFiltros, { pagina: 'x', tipo: 'nada' }],
  ];
  for (const [esquema, entrada] of casos) {
    const resultado = mensagens(esquema, entrada);
    assert.ok(Object.keys(resultado).length > 0);
    for (const texto of Object.values(resultado)) assert.doesNotMatch(texto, INGLES, texto);
  }
});

test('mensagens do Zod: front e servidor usam a mesma fonte (todo contrato carrega as mensagens)', () => {
  const pasta = join(RAIZ, 'contratos');
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.js') && f !== 'mensagens.js')) {
    const fonte = readFileSync(join(pasta, arquivo), 'utf8');
    if (!/from 'zod'/.test(fonte)) continue;
    // comum.js importa mensagens.js; os contratos que não importam comum.js importam mensagens.js direto.
    assert.match(fonte, /from '\.\/comum\.js'|import '\.\/mensagens\.js'/, `${arquivo} precisa carregar as mensagens`);
  }
  assert.match(readFileSync(join(pasta, 'comum.js'), 'utf8'), /import '\.\/mensagens\.js'/);

  // O front não define esquemas próprios: só usa os contratos, então não há segunda lista de mensagens.
  const varrer = (pasta2) => {
    for (const e of readdirSync(pasta2, { withFileTypes: true })) {
      const caminho = join(pasta2, e.name);
      if (e.isDirectory()) varrer(caminho);
      else if (/\.jsx?$/.test(e.name)) assert.doesNotMatch(readFileSync(caminho, 'utf8'), /from 'zod'/, caminho);
    }
  };
  varrer(join(RAIZ, 'web', 'src'));
});

test('mensagens do Zod: a API devolve o mesmo texto em português que o contrato produz', async (t) => {
  const { app, fechar } = await appDeTeste();
  t.after(fechar);
  const { cookie, csrf } = await entrar(app);
  const res = await app.inject({
    method: 'POST',
    url: '/api/contas',
    headers: { host: HOST, origin: ORIGEM, cookie, 'x-csrf-token': csrf },
    payload: { nome: 5, tipo: 'cripto', saldo_inicial_centavos: 'x' },
  });
  assert.equal(res.statusCode, 400);
  const { erro, campos } = res.json();
  assert.equal(erro, 'Dados inválidos.');
  assert.deepEqual(campos, mensagens(esquemaConta, { nome: 5, tipo: 'cripto', saldo_inicial_centavos: 'x' }));
  assert.equal(campos.nome, 'Valor inválido: informe um(a) texto.');
  for (const texto of Object.values(campos)) assert.doesNotMatch(texto, INGLES, texto);
});
