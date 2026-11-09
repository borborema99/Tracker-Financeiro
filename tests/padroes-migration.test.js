import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { TIPOS_CONTA } from '../contratos/contas.js';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { gravarConfig } from '../servidor/banco/config-db.js';
import { migrar } from '../servidor/banco/migrar.js';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, semearPadroes } from '../servidor/banco/padroes.js';
import { criarConta, listarContas } from '../servidor/banco/repositorios/contas.js';
import {
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  listarCategorias,
} from '../servidor/banco/repositorios/categorias.js';
import { CTX, categoriaPorNome, novaConta, novaMov } from './ajuda.js';

const PASTA_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'servidor', 'banco', 'migrations');
const MIGRATION_010 = '010_padroes_e_tipos_de_conta.sql';

// A semente da Onda 1, como estava antes da migration 010: é o que um banco já em uso tem.
const SEMENTE_ANTIGA = {
  despesa: {
    Moradia: ['Aluguel ou financiamento', 'Condomínio', 'Energia', 'Água', 'Internet', 'Manutenção'],
    Alimentação: ['Mercado', 'Restaurantes', 'Delivery'],
    Transporte: ['Combustível', 'Transporte público', 'Aplicativos', 'Manutenção do veículo'],
    Saúde: ['Plano de saúde', 'Farmácia', 'Consultas e exames'],
    Educação: ['Mensalidade', 'Cursos', 'Material'],
    Lazer: ['Assinaturas e streaming', 'Viagens', 'Passeios'],
    Vestuário: [],
    'Cuidados pessoais': [],
    'Impostos e taxas': [],
    'Tarifas bancárias': [],
    'Outras despesas': [],
  },
  receita: {
    Salário: [],
    'Renda extra': ['Freelance', 'Vendas'],
    Rendimentos: [],
    Reembolsos: [],
    Presentes: [],
    'Outras receitas': [],
  },
};

/** Banco no estado de antes da migration 010: migrations 001 a 009 e a semente antiga. */
function bancoAntesDa010() {
  const pasta = mkdtempSync(join(tmpdir(), 'mig009-'));
  for (const f of readdirSync(PASTA_MIGRATIONS).filter((n) => n < '010')) copyFileSync(join(PASTA_MIGRATIONS, f), join(pasta, f));
  const db = abrirBanco(':memory:');
  assert.ok(!migrar(db, pasta).includes(MIGRATION_010));
  rmSync(pasta, { recursive: true, force: true });
  for (const [tipo, grupo] of Object.entries(SEMENTE_ANTIGA)) {
    for (const [nome, filhas] of Object.entries(grupo)) {
      const pai = criarCategoria(db, { nome, tipo, arquivada: false }, { papel: nome === 'Tarifas bancárias' ? 'tarifa' : null });
      for (const filha of filhas) criarCategoria(db, { nome: filha, tipo, pai_id: pai.id, arquivada: false });
    }
  }
  gravarConfig(db, 'padroes_semeados', '1');
  return db;
}

/** Conjunto "tipo|pai|nome" das categorias que não foram excluídas. */
function conjuntoDeCategorias(db) {
  const todas = listarCategorias(db);
  const nomeDe = new Map(todas.map((c) => [c.id, c.nome]));
  return new Set(todas.map((c) => `${c.tipo}|${c.pai_id ? nomeDe.get(c.pai_id) : ''}|${c.nome}`));
}

function conjuntoDosPadroes() {
  const conjunto = new Set();
  for (const [tipo, grupo] of [['despesa', CATEGORIAS_DESPESA], ['receita', CATEGORIAS_RECEITA]]) {
    for (const [nome, filhas] of Object.entries(grupo)) {
      conjunto.add(`${tipo}||${nome}`);
      for (const filha of filhas) conjunto.add(`${tipo}|${nome}|${filha}`);
    }
  }
  return conjunto;
}

test('migration 010: em banco já populado só acrescenta, sem apagar nem renomear o que existe', () => {
  const db = bancoAntesDa010();
  const conta = novaConta(db, 'Corrente', 100000);
  const mercado = categoriaPorNome(db, 'Mercado');
  novaMov(db, { conta_id: conta.id, categoria_id: mercado.id, valor_centavos: 2500 });
  atualizarCategoria(db, categoriaPorNome(db, 'Energia').id, {
    nome: 'Luz',
    tipo: 'despesa',
    pai_id: categoriaPorNome(db, 'Moradia').id,
    arquivada: false,
  });
  excluirCategoria(db, categoriaPorNome(db, 'Delivery').id);
  const saude = categoriaPorNome(db, 'Saúde');
  atualizarCategoria(db, saude.id, { nome: 'Saúde', tipo: 'despesa', pai_id: null, arquivada: true });

  const categoriasAntes = db.prepare('SELECT * FROM categorias ORDER BY id').all();
  const contasAntes = db.prepare('SELECT * FROM contas ORDER BY id').all();
  const saldoAntes = listarContas(db).find((c) => c.id === conta.id).saldo_centavos;
  const auditoriasAntes = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'categoria' AND acao = 'criar'").get().n;

  assert.deepEqual(migrar(db), [MIGRATION_010]);

  // Nada do que existia mudou: nem id, nem nome, nem pai, nem arquivamento, nem exclusão.
  const agora = new Map(db.prepare('SELECT * FROM categorias').all().map((c) => [c.id, c]));
  for (const antiga of categoriasAntes) assert.deepEqual(agora.get(antiga.id), antiga);
  assert.deepEqual(db.prepare('SELECT * FROM contas ORDER BY id').all(), contasAntes);
  assert.equal(listarContas(db).find((c) => c.id === conta.id).saldo_centavos, saldoAntes);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimentacoes WHERE categoria_id = ?').get(mercado.id).n, 1);

  // O que a pessoa mudou não volta: "Energia" renomeada para "Luz" e "Delivery" excluída.
  assert.equal(categoriaPorNome(db, 'Energia'), undefined);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM categorias WHERE nome = 'Delivery'").get().n, 1);
  assert.equal(categoriaPorNome(db, 'Luz').pai_id, categoriaPorNome(db, 'Moradia').id);

  // O que faltava entrou, no pai certo e como categoria nova de verdade.
  assert.equal(categoriaPorNome(db, 'Gás').pai_id, categoriaPorNome(db, 'Moradia').id);
  assert.equal(categoriaPorNome(db, 'Veterinário').pai_id, categoriaPorNome(db, 'Animais de estimação').id);
  assert.equal(categoriaPorNome(db, 'Animais de estimação').pai_id, null);
  assert.equal(categoriaPorNome(db, 'Benefícios').tipo, 'receita');
  assert.equal(categoriaPorNome(db, 'Dentista').pai_id, saude.id, 'filha nova entra mesmo sob pai arquivado');

  // Cada categoria criada deixou histórico.
  const novas = db.prepare('SELECT id FROM categorias WHERE id > ?').all(Math.max(...categoriasAntes.map((c) => c.id)));
  assert.ok(novas.length > 20);
  const auditorias = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entidade = 'categoria' AND acao = 'criar'").get().n;
  assert.equal(auditorias - auditoriasAntes, novas.length);
  const linha = db.prepare("SELECT depois FROM audit_log WHERE entidade = 'categoria' AND entidade_id = ?").get(String(novas[0].id));
  assert.equal(JSON.parse(linha.depois).id, novas[0].id);

  // Rodar de novo não faz nada, e a conferência de chaves estrangeiras está limpa.
  assert.deepEqual(migrar(db), []);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n, categoriasAntes.length + novas.length);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  db.close();
});

test('migration 010: o banco já populado e o banco novo terminam com as mesmas categorias', () => {
  const antigo = bancoAntesDa010();
  migrar(antigo);
  const novo = abrirBanco(':memory:');
  migrar(novo);
  semearPadroes(novo);
  assert.deepEqual([...conjuntoDeCategorias(antigo)].sort(), [...conjuntoDeCategorias(novo)].sort());
  assert.deepEqual([...conjuntoDosPadroes()].sort(), [...conjuntoDeCategorias(novo)].sort());
  assert.equal(categoriaPorNome(antigo, 'Tarifas bancárias').papel, 'tarifa');
  antigo.close();
  novo.close();
});

test('migration 010: em banco novo não cria categoria (a semente cria a lista inteira, sem duplicar)', () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  assert.equal(listarCategorias(db).length, 0);
  assert.equal(semearPadroes(db), true);
  const total = listarCategorias(db).length;
  assert.equal(total, conjuntoDosPadroes().size);
  assert.equal(conjuntoDeCategorias(db).size, total, 'sem nome repetido sob o mesmo pai');
  db.close();
});

test('migration 010: os sete tipos de conta valem no banco e no contrato', () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  assert.deepEqual(TIPOS_CONTA, ['corrente', 'poupanca', 'carteira', 'investimento', 'digital', 'beneficio', 'outro']);
  for (const tipo of TIPOS_CONTA) {
    const c = criarConta(db, { nome: `Conta ${tipo}`, tipo, saldo_inicial_centavos: 0, arquivada: false }, CTX);
    assert.equal(c.tipo, tipo);
  }
  assert.throws(() => db.prepare("INSERT INTO contas (nome, tipo, criada_em, atualizada_em) VALUES ('x', 'cripto', 'a', 'b')").run(), /CHECK/);
  db.close();
});

test('migrar: migration com a marca liga as chaves de volta e recusa chave inválida', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'mig-fk-'));
  try {
    writeFileSync(join(pasta, '001_base.sql'), 'CREATE TABLE pai (id INTEGER PRIMARY KEY); CREATE TABLE filho (id INTEGER PRIMARY KEY, pai_id INTEGER REFERENCES pai (id));');
    writeFileSync(
      join(pasta, '002_ok.sql'),
      '-- migrar: sem-chaves-estrangeiras\nINSERT INTO pai (id) VALUES (1); INSERT INTO filho (pai_id) VALUES (1);',
    );
    const db = abrirBanco(':memory:');
    assert.deepEqual(migrar(db, pasta), ['001_base.sql', '002_ok.sql']);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);

    writeFileSync(join(pasta, '003_orfao.sql'), '-- migrar: sem-chaves-estrangeiras\nINSERT INTO filho (pai_id) VALUES (99);');
    assert.throws(() => migrar(db, pasta), /chaves estrangeiras inválidas/);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1, 'volta a ligar mesmo com erro');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM filho').get().n, 1, 'a migration inválida foi desfeita');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE versao = '003_orfao.sql'").get().n, 0);
    db.close();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
