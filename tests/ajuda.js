import { afterEach } from 'node:test';
import { criarApp } from '../servidor/app.js';
import { criarArmazenamentoMemoria } from '../servidor/armazenamento/index.js';
import { criarEscopo } from '../servidor/banco/pg/escopo.js';
import { migrar } from '../servidor/banco/pg/migrar.js';
import { abrirBancoLocal } from '../servidor/banco/pg/pglite.js';
import { listarCategorias } from '../servidor/banco/repositorios/categorias.js';
import { criarCartao, criarCompra } from '../servidor/banco/repositorios/cartoes.js';
import { criarConta, listarContas } from '../servidor/banco/repositorios/contas.js';
import { criarMovimentacao } from '../servidor/banco/repositorios/movimentacoes.js';
import { buscarPorNome, criarUsuario } from '../servidor/banco/repositorios/usuarios.js';
import { lerAmbiente } from '../servidor/config.js';
import { hashSenha } from '../servidor/seguranca/senha.js';

export const SENHA = 'senha-de-teste-123';
export const PEPPER = 'pepper-de-teste';
export const USUARIO = 'tester';

/** Contexto fixo de escrita: "hoje" e o instante (UTC) usados nos testes de repositório. */
export const CTX = { hoje: '2026-06-15', agora: new Date('2026-06-15T15:00:00Z') };

// Um PGlite por arquivo de teste (subir leva ~2 s, então não dá para um por teste). Cada teste roda dentro de uma
// transação que o `afterEach` desfaz: o teste começa sempre com o banco vazio e nada vaza para o seguinte.
// Dentro dela, cada comando e cada `transacao` viram SAVEPOINT: uma falha de SQL desfaz só o comando, como no
// autocommit de produção, em vez de envenenar a transação do teste.
const bruto = await abrirBancoLocal();
await migrar(bruto);

let aberta = false;
let pontos = 0;
const iniciar = async () => {
  if (aberta) return;
  await bruto.consultar('BEGIN');
  aberta = true;
};

async function emPonto(prefixo, fn) {
  await iniciar();
  const ponto = `${prefixo}_${++pontos}`;
  await bruto.consultar(`SAVEPOINT ${ponto}`);
  try {
    const resultado = await fn();
    await bruto.consultar(`RELEASE SAVEPOINT ${ponto}`);
    return resultado;
  } catch (erro) {
    await bruto.consultar(`ROLLBACK TO SAVEPOINT ${ponto}`);
    throw erro;
  }
}

/** Banco compartilhado do arquivo, com a mesma interface dos adaptadores reais. */
export const banco = {
  consultar: (texto, params) => emPonto('c', () => bruto.consultar(texto, params)),
  async executar(script) {
    await iniciar();
    return bruto.executar(script);
  },
  transacao: (fn) =>
    emPonto('t', () =>
      fn({ consultar: (texto, params) => bruto.consultar(texto, params), executar: (script) => bruto.executar(script) }),
    ),
  fechar: async () => {},
};

afterEach(async () => {
  if (!aberta) return;
  await bruto.consultar('ROLLBACK');
  aberta = false;
});

const HASH = await hashSenha(SENHA, PEPPER);
let numero = 0;

/** Cria um usuário (com as categorias padrão) e devolve seu id. */
export const novoUsuarioDeTeste = (nome = `usuario-${++numero}`, { demo = false } = {}) =>
  criarUsuario(banco, { nome, senhaHash: HASH, demo }, CTX.agora);

/** Escopo de um usuário novo, já com as categorias padrão. É o "db" dos testes de repositório. */
export async function bancoComPadroes() {
  return criarEscopo(banco, await novoUsuarioDeTeste());
}

export function novaConta(db, nome = 'Conta A', saldoInicial = 0, tipo = 'corrente') {
  return criarConta(db, { nome, tipo, saldo_inicial_centavos: saldoInicial, arquivada: false }, CTX);
}

export const saldoDe = async (db, contaId) => (await listarContas(db)).find((c) => c.id === contaId).saldo_centavos;

export const categoriaPorNome = async (db, nome) => (await listarCategorias(db)).find((c) => c.nome === nome);

/** Cria uma movimentação com padrões de teste (despesa liquidada de R$ 10,00). Devolve a movimentação. */
export async function novaMov(db, extra) {
  return (
    await criarMovimentacao(
      db,
      {
        tipo: 'despesa',
        descricao: '',
        valor_centavos: 1000,
        data_competencia: '2026-06-10',
        status: 'liquidada',
        observacao: '',
        divisoes: [],
        tarifa_centavos: 0,
        ...extra,
      },
      CTX,
    )
  ).movimentacao;
}

/** Cartão de teste: fecha dia 10, vence dia 17, limite de R$ 5.000,00. Com CTX.hoje (15/06) a fatura aberta é a de julho. */
export function novoCartao(db, extra = {}) {
  return criarCartao(
    db,
    {
      nome: 'Cartão A',
      limite_centavos: 500000,
      dia_fechamento: 10,
      dia_vencimento: 17,
      conta_pagamento_id: null,
      arquivado: false,
      ...extra,
    },
    CTX,
  );
}

/** Compra à vista de R$ 100,00 em 05/06 (cai na fatura de junho). Devolve a compra. */
export async function novaCompra(db, cartao, extra = {}) {
  return (
    await criarCompra(
      db,
      {
        cartao_id: cartao.id,
        descricao: '',
        valor_total_centavos: 10000,
        categoria_id: null,
        data_compra: '2026-06-05',
        parcelas_total: 1,
        observacao: '',
        ...extra,
      },
      CTX,
    )
  ).compra;
}

export const HOST = 'localhost:3000';
export const ORIGEM = `http://${HOST}`;

/**
 * App completo sobre o banco do arquivo, com um usuário de teste ("tester", senha SENHA) e armazenamento em
 * memória. `db` é o escopo desse usuário (para conferir o banco por fora da API).
 */
export async function appDeTeste({ origensPermitidas = [], pastaWeb = '/nao-existe', cadastroAberto = false } = {}) {
  // Um teste pode montar dois apps no mesmo banco: o usuário "tester" é criado uma vez só.
  const usuarioId = (await buscarPorNome(banco, USUARIO))?.id ?? (await novoUsuarioDeTeste(USUARIO));
  const config = {
    ...lerAmbiente({}),
    segredo: 'segredo-de-teste',
    pepper: PEPPER,
    chaveIp: 'chave-ip-de-teste',
    cadastroAberto,
    pastaWeb,
    origensPermitidas,
  };
  const armazenamento = criarArmazenamentoMemoria();
  const app = await criarApp({ config, banco, armazenamento });
  return {
    app,
    banco,
    armazenamento,
    db: criarEscopo(banco, usuarioId),
    usuarioId,
    config,
    fechar: () => app.close(),
  };
}

/** Faz login e devolve { cookie, csrf } para as próximas chamadas. */
export async function entrar(app, senha = SENHA, usuario = USUARIO) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { host: HOST, origin: ORIGEM },
    payload: { usuario, senha },
  });
  const cookie = res.cookies.find((c) => c.name === 'sessao');
  const sessao = await app.inject({
    method: 'GET',
    url: '/api/sessao',
    headers: { host: HOST, cookie: `sessao=${cookie.value}` },
  });
  return { res, cookie: `sessao=${cookie.value}`, csrf: sessao.json().csrf };
}
