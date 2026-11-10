import { FUSO_PADRAO } from '../../contratos/config.js';
import { gravarConfig, lerConfig } from '../banco/config-db.js';
import { listarCategorias } from '../banco/repositorios/categorias.js';
import {
  criarCartao,
  criarCompra,
  estornarCompra,
  faturasDoCartao,
  pagarFatura,
} from '../banco/repositorios/cartoes.js';
import { criarConta, listarContas } from '../banco/repositorios/contas.js';
import { criarMeta, registrarAporte } from '../banco/repositorios/metas.js';
import { criarDivida } from '../banco/repositorios/dividas.js';
import { criarInvestimento, registrarAvaliacao, registrarOperacao } from '../banco/repositorios/investimentos.js';
import { criarMovimentacao, liquidarMovimentacao } from '../banco/repositorios/movimentacoes.js';
import { definirLimite } from '../banco/repositorios/orcamentos.js';
import { criarRecorrencia } from '../banco/repositorios/recorrencias.js';
import { buscarPorNome, criarUsuario } from '../banco/repositorios/usuarios.js';
import { criarEscopo } from '../banco/pg/escopo.js';
import { hojeNoFuso } from '../dominio/datas.js';
import { hashSenha } from '../seguranca/senha.js';

export const NOME_DEMO = 'demo';
export const SENHA_DEMO = 'demonstracao';

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Dados totalmente fictícios, com datas relativas a hoje. [dias atrás, tipo, descrição, centavos, categoria, conta]
const LANCAMENTOS = [
  [1, 'despesa', 'Compras da semana', 18750, 'Mercado', 'Conta corrente'],
  [2, 'despesa', 'Almoço', 4290, 'Restaurantes', 'Carteira'],
  [3, 'despesa', 'Combustível', 25000, 'Combustível', 'Conta corrente'],
  [4, 'despesa', 'Farmácia', 6780, 'Farmácia', 'Conta corrente'],
  [5, 'despesa', 'Streaming', 3990, 'Assinaturas e streaming', 'Conta corrente'],
  [6, 'despesa', 'Padaria', 1850, 'Mercado', 'Carteira'],
  [7, 'despesa', 'Aplicativo de transporte', 2790, 'Aplicativos', 'Carteira'],
  [8, 'despesa', 'Conta de energia', 21490, 'Energia', 'Conta corrente'],
  [9, 'despesa', 'Conta de água', 7320, 'Água', 'Conta corrente'],
  [10, 'despesa', 'Internet', 9990, 'Internet', 'Conta corrente'],
  [11, 'despesa', 'Jantar fora', 12800, 'Restaurantes', 'Conta corrente'],
  [12, 'despesa', 'Curso online', 14900, 'Cursos', 'Conta corrente'],
  [13, 'despesa', 'Compras do mês', 41230, 'Mercado', 'Conta corrente'],
  [14, 'despesa', 'Lanche', 2350, 'Delivery', 'Carteira'],
  [15, 'despesa', 'Passeio no parque', 3500, 'Passeios', 'Carteira'],
  [16, 'despesa', 'Consulta', 25000, 'Consultas e exames', 'Conta corrente'],
  [17, 'despesa', 'Manutenção do carro', 38000, 'Manutenção do veículo', 'Conta corrente'],
  [18, 'despesa', 'Camiseta', 7990, 'Vestuário', 'Conta corrente'],
  [19, 'despesa', 'Condomínio', 52000, 'Condomínio', 'Conta corrente'],
  [20, 'despesa', 'Aluguel', 180000, 'Aluguel ou financiamento', 'Conta corrente'],
  [26, 'receita', 'Salário', 520000, 'Salário', 'Conta corrente'],
  [14, 'receita', 'Trabalho avulso', 80000, 'Freelance', 'Conta corrente'],
  [9, 'receita', 'Rendimento da poupança', 3120, 'Rendimentos', 'Poupança'],
];

const contextoDeHoje = () => ({ hoje: hojeNoFuso(FUSO_PADRAO, new Date()), agora: new Date() });
const categoriasPorNome = async (esc) => new Map((await listarCategorias(esc)).map((c) => [c.nome, c.id]));
const contaCorrente = async (esc) => (await listarContas(esc)).find((c) => c.nome === 'Conta corrente');

/** Onda 2: um cartão com compras à vista e parceladas, um estorno e a fatura mais antiga já paga. */
async function semearCartoes(esc) {
  if ((await lerConfig(esc, 'demo_dados_v2')) === '1') return;
  const contexto = contextoDeHoje();
  const { hoje } = contexto;
  const categorias = await categoriasPorNome(esc);
  const conta = await contaCorrente(esc);

  await esc.transacao(async (tx) => {
    const cartao = await criarCartao(
      tx,
      {
        nome: 'Cartão de demonstração',
        limite_centavos: 600000,
        dia_fechamento: 10,
        dia_vencimento: 17,
        conta_pagamento_id: conta?.id ?? null,
        arquivado: false,
      },
      contexto,
    );
    const comprar = async (dias, descricao, valor, categoria, parcelas = 1) =>
      (
        await criarCompra(
          tx,
          {
            cartao_id: cartao.id, descricao, valor_total_centavos: valor, categoria_id: categorias.get(categoria),
            data_compra: somarDias(hoje, -dias), parcelas_total: parcelas, observacao: '',
          },
          contexto,
        )
      ).compra;

    await comprar(75, 'Curso de idiomas', 120000, 'Cursos', 6);
    await comprar(45, 'Tênis', 45000, 'Vestuário', 3);
    await comprar(8, 'Mercado do mês', 62000, 'Mercado');
    await comprar(5, 'Streaming anual', 29900, 'Assinaturas e streaming');
    const jantar = await comprar(4, 'Jantar', 18000, 'Restaurantes');
    await estornarCompra(tx, jantar.id, { valor_centavos: 4000, descricao: 'Item devolvido' }, contexto);

    const maisAntiga = (await faturasDoCartao(tx, cartao.id, hoje)).at(-1);
    if (conta && maisAntiga && maisAntiga.data_vencimento < hoje && maisAntiga.saldo_centavos > 0) {
      await pagarFatura(
        tx,
        maisAntiga.id,
        { valor_centavos: maisAntiga.saldo_centavos, conta_id: conta.id, data_pagamento: maisAntiga.data_vencimento },
        contexto,
      );
    }
    await gravarConfig(tx, 'demo_dados_v2', '1');
  });
}

/** Onda 3: recorrências (aluguel e salário, começando daqui a alguns dias) e uma conta já atrasada. */
async function semearCompromissos(esc) {
  if ((await lerConfig(esc, 'demo_dados_v3')) === '1') return;
  const contexto = contextoDeHoje();
  const { hoje } = contexto;
  const categorias = await categoriasPorNome(esc);
  const conta = await contaCorrente(esc);
  if (!conta) return;

  await esc.transacao(async (tx) => {
    const recorrencia = (tipo, descricao, valor, categoria, inicioEmDias) =>
      criarRecorrencia(
        tx,
        {
          tipo, descricao, valor_centavos: valor, conta_id: conta.id, categoria_id: categorias.get(categoria) ?? null,
          frequencia: 'mensal', data_inicio: somarDias(hoje, inicioEmDias), data_fim: null, ativa: true, observacao: '',
        },
        contexto,
      );
    await recorrencia('despesa', 'Aluguel', 180000, 'Aluguel ou financiamento', 9);
    await recorrencia('despesa', 'Internet', 9990, 'Internet', 3);
    await recorrencia('receita', 'Salário', 520000, 'Salário', 18);

    // Uma conta que já passou do vencimento, para a demonstração mostrar o atraso calculado (RF-07).
    const venceu = somarDias(hoje, -4);
    await criarMovimentacao(
      tx,
      {
        tipo: 'despesa', descricao: 'Mensalidade da academia', valor_centavos: 12900, conta_id: conta.id,
        categoria_id: categorias.get('Saúde') ?? null, divisoes: [], observacao: '', tarifa_centavos: 0,
        status: 'pendente', data_competencia: venceu, data_vencimento: venceu, data_liquidacao: null,
      },
      contexto,
    );
    await gravarConfig(tx, 'demo_dados_v3', '1');
  });
}

/** Fase 2 (planejamento): limites de orçamento a partir do mês atual e duas metas com aportes. */
async function semearPlanejamento(esc) {
  if ((await lerConfig(esc, 'demo_dados_v4')) === '1') return;
  const contexto = contextoDeHoje();
  const { hoje } = contexto;
  const categorias = await categoriasPorNome(esc);

  await esc.transacao(async (tx) => {
    for (const [categoria, limite] of [['Alimentação', 100000], ['Transporte', 60000], ['Lazer', 30000], ['Saúde', 25000]]) {
      if (categorias.has(categoria)) {
        await definirLimite(tx, categorias.get(categoria), { mes_inicio: hoje.slice(0, 7), limite_centavos: limite }, contexto);
      }
    }
    const reserva = await criarMeta(
      tx,
      { nome: 'Reserva de emergência', valor_alvo_centavos: 1000000, prazo: somarDias(hoje, 365), observacao: '' },
      contexto,
    );
    await registrarAporte(tx, reserva.id, { tipo: 'aporte', valor_centavos: 250000, data: somarDias(hoje, -20), observacao: '' }, contexto);
    const viagem = await criarMeta(tx, { nome: 'Viagem de fim de ano', valor_alvo_centavos: 400000, prazo: somarDias(hoje, 180), observacao: '' }, contexto);
    await registrarAporte(tx, viagem.id, { tipo: 'aporte', valor_centavos: 100000, data: somarDias(hoje, -5), observacao: '' }, contexto);
    await gravarConfig(tx, 'demo_dados_v4', '1');
  });
}

/** Fase 2, Onda 2: uma dívida em 12 parcelas (uma já paga e uma atrasada) e três assinaturas. */
async function semearDividasEAssinaturas(esc) {
  if ((await lerConfig(esc, 'demo_dados_v5')) === '1') return;
  const contexto = contextoDeHoje();
  const { hoje } = contexto;
  const categorias = await categoriasPorNome(esc);
  const conta = await contaCorrente(esc);
  if (!conta) return;

  await esc.transacao(async (tx) => {
    const divida = await criarDivida(
      tx,
      {
        nome: 'Empréstimo pessoal', credor: 'Banco de demonstração', valor_total_centavos: 360000, parcelas_total: 12,
        primeiro_vencimento: somarDias(hoje, -45), conta_id: conta.id, categoria_id: categorias.get('Outras despesas') ?? null,
        observacao: '',
      },
      contexto,
    );
    const primeira = divida.parcelas[0];
    await liquidarMovimentacao(tx, primeira.lancamento_id, primeira.data_vencimento, contexto);

    for (const [descricao, valor, frequencia, inicioEmDias] of [
      ['Streaming de vídeo', 3990, 'mensal', 6],
      ['Armazenamento em nuvem', 1290, 'mensal', 12],
      ['Seguro do celular', 24000, 'anual', 40],
    ]) {
      await criarRecorrencia(
        tx,
        {
          tipo: 'despesa', descricao, valor_centavos: valor, conta_id: conta.id,
          categoria_id: categorias.get('Assinaturas e streaming') ?? null, frequencia,
          data_inicio: somarDias(hoje, inicioEmDias), data_fim: null, ativa: true, assinatura: true, observacao: '',
        },
        contexto,
      );
    }
    await gravarConfig(tx, 'demo_dados_v5', '1');
  });
}

/** Fase 3, Onda 1: um investimento com aporte saindo da poupança e valor informado, e outro sem valor informado. */
async function semearInvestimentos(esc) {
  if ((await lerConfig(esc, 'demo_dados_v6')) === '1') return;
  const contexto = contextoDeHoje();
  const { hoje } = contexto;
  const poupanca = (await listarContas(esc)).find((c) => c.nome === 'Poupança');
  if (!poupanca) return;

  await esc.transacao(async (tx) => {
    const tesouro = await criarInvestimento(
      tx,
      { nome: 'Tesouro Selic', tipo: 'tesouro', instituicao: 'Corretora de demonstração', observacao: '' },
      contexto,
    );
    await registrarOperacao(
      tx,
      tesouro.id,
      { tipo: 'aporte', valor_centavos: 200000, data: somarDias(hoje, -60), conta_id: poupanca.id, observacao: '' },
      contexto,
    );
    await registrarAvaliacao(tx, tesouro.id, { data: hoje, valor_centavos: 204300 }, contexto);

    const fundo = await criarInvestimento(tx, { nome: 'Fundo de ações', tipo: 'fundo', instituicao: '', observacao: '' }, contexto);
    await registrarOperacao(
      tx,
      fundo.id,
      { tipo: 'aporte', valor_centavos: 50000, data: somarDias(hoje, -20), conta_id: null, observacao: '' },
      contexto,
    );
    await gravarConfig(tx, 'demo_dados_v6', '1');
  });
}

async function semearBase(esc) {
  const contexto = contextoDeHoje();
  const { hoje } = contexto;
  const categorias = await categoriasPorNome(esc);

  await esc.transacao(async (tx) => {
    const novaConta = async (nome, tipo, saldo) =>
      (await criarConta(tx, { nome, tipo, saldo_inicial_centavos: saldo, arquivada: false })).id;
    const contas = {
      'Conta corrente': await novaConta('Conta corrente', 'corrente', 150000),
      Poupança: await novaConta('Poupança', 'poupanca', 500000),
      Carteira: await novaConta('Carteira', 'carteira', 20000),
    };

    const base = { divisoes: [], observacao: '', tarifa_centavos: 0, status: 'liquidada' };
    for (const [dias, tipo, descricao, valor, categoria, conta] of LANCAMENTOS) {
      const data = somarDias(hoje, -dias);
      await criarMovimentacao(
        tx,
        {
          ...base, tipo, descricao, valor_centavos: valor, conta_id: contas[conta],
          categoria_id: categorias.get(categoria), data_competencia: data, data_liquidacao: data,
        },
        contexto,
      );
    }

    const transferencia = somarDias(hoje, -10);
    await criarMovimentacao(
      tx,
      {
        ...base, tipo: 'transferencia', descricao: 'Reserva do mês', valor_centavos: 100000,
        conta_id: contas['Conta corrente'], conta_destino_id: contas.Poupança,
        data_competencia: transferencia, data_liquidacao: transferencia, tarifa_centavos: 990,
      },
      contexto,
    );

    for (const [dias, tipo, descricao, valor, categoria] of [
      [5, 'despesa', 'Seguro do carro', 32000, 'Manutenção do veículo'],
      [12, 'despesa', 'Plano de saúde', 48000, 'Plano de saúde'],
      [8, 'receita', 'Reembolso combinado', 15000, 'Reembolsos'],
    ]) {
      const vencimento = somarDias(hoje, dias);
      await criarMovimentacao(
        tx,
        {
          ...base, tipo, descricao, valor_centavos: valor, conta_id: contas['Conta corrente'],
          categoria_id: categorias.get(categoria), status: 'pendente', data_competencia: vencimento,
          data_vencimento: vencimento, data_liquidacao: null,
        },
        contexto,
      );
    }
    await gravarConfig(tx, 'demo_dados_v1', '1');
  });
}

/**
 * Prepara a conta de demonstração: o usuário `demo` (o único com a faixa "dados de demonstração") e dados
 * fictícios (contas, lançamentos, uma transferência com tarifa, compromissos pendentes, um cartão, recorrências,
 * orçamento, metas, dívida e assinaturas). Idempotente: cada bloco se marca no config do próprio usuário.
 * Devolve o id do usuário demo.
 */
export async function semearDemo(banco, { pepper }) {
  let demo = await buscarPorNome(banco, NOME_DEMO);
  if (!demo) {
    const id = await criarUsuario(banco, {
      nome: NOME_DEMO,
      senhaHash: await hashSenha(SENHA_DEMO, pepper),
      demo: true,
    });
    demo = { id };
  }
  const esc = criarEscopo(banco, demo.id);
  if ((await lerConfig(esc, 'demo_dados_v1')) !== '1') await semearBase(esc);
  await semearCartoes(esc);
  await semearCompromissos(esc);
  await semearPlanejamento(esc);
  await semearDividasEAssinaturas(esc);
  await semearInvestimentos(esc);
  return demo.id;
}
