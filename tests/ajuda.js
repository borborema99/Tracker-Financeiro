import { criarApp } from '../servidor/app.js';
import { abrirBanco } from '../servidor/banco/conexao.js';
import { migrar } from '../servidor/banco/migrar.js';
import { lerAmbiente } from '../servidor/config.js';
import { definirSenha } from '../servidor/seguranca/senha.js';

import { semearPadroes } from '../servidor/banco/padroes.js';
import { criarCartao, criarCompra } from '../servidor/banco/repositorios/cartoes.js';
import { criarConta, listarContas } from '../servidor/banco/repositorios/contas.js';
import { listarCategorias } from '../servidor/banco/repositorios/categorias.js';
import { criarMovimentacao } from '../servidor/banco/repositorios/movimentacoes.js';

export const SENHA = 'senha-de-teste-123';

/** Contexto fixo de escrita: "hoje" e o instante (UTC) usados nos testes de repositório. */
export const CTX = { hoje: '2026-06-15', agora: new Date('2026-06-15T15:00:00Z') };

export function bancoComPadroes() {
  const db = abrirBanco(':memory:');
  migrar(db);
  semearPadroes(db);
  return db;
}

export function novaConta(db, nome = 'Conta A', saldoInicial = 0, tipo = 'corrente') {
  return criarConta(db, { nome, tipo, saldo_inicial_centavos: saldoInicial, arquivada: false }, CTX);
}

export const saldoDe = (db, contaId) => listarContas(db).find((c) => c.id === contaId).saldo_centavos;

export const categoriaPorNome = (db, nome) => listarCategorias(db).find((c) => c.nome === nome);

/** Cria uma movimentação com padrões de teste (despesa liquidada de R$ 10,00). Devolve a movimentação. */
export function novaMov(db, extra) {
  return criarMovimentacao(
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
export function novaCompra(db, cartao, extra = {}) {
  return criarCompra(
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
  ).compra;
}

export const HOST = 'localhost:3000';
export const ORIGEM = `http://${HOST}`;

export async function appDeTeste({ senha = SENHA, origensPermitidas = [], pastaWeb = '/nao-existe' } = {}) {
  const db = abrirBanco(':memory:');
  migrar(db);
  semearPadroes(db);
  if (senha) await definirSenha(db, senha);
  const config = {
    ...lerAmbiente({}),
    segredo: 'segredo-de-teste',
    pastaWeb,
    origensPermitidas,
  };
  const app = await criarApp({ config, db });
  return {
    app,
    db,
    config,
    fechar: async () => {
      await app.close();
      db.close();
    },
  };
}

/** Faz login e devolve { cookie, csrf } para as próximas chamadas. */
export async function entrar(app, senha = SENHA) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { host: HOST, origin: ORIGEM },
    payload: { senha },
  });
  const cookie = res.cookies.find((c) => c.name === 'sessao');
  const sessao = await app.inject({
    method: 'GET',
    url: '/api/sessao',
    headers: { host: HOST, cookie: `sessao=${cookie.value}` },
  });
  return { res, cookie: `sessao=${cookie.value}`, csrf: sessao.json().csrf };
}
