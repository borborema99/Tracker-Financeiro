import { FUSO_PADRAO } from '../../contratos/config.js';
import { gravarConfig, lerConfig } from '../banco/config-db.js';
import { semearPadroes } from '../banco/padroes.js';
import { listarCategorias } from '../banco/repositorios/categorias.js';
import {
  criarCartao,
  criarCompra,
  estornarCompra,
  faturasDoCartao,
  pagarFatura,
} from '../banco/repositorios/cartoes.js';
import { criarConta, listarContas } from '../banco/repositorios/contas.js';
import { criarMovimentacao } from '../banco/repositorios/movimentacoes.js';
import { criarRecorrencia } from '../banco/repositorios/recorrencias.js';
import { hojeNoFuso } from '../dominio/datas.js';
import { definirSenha } from '../seguranca/senha.js';

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

/** Onda 2: um cartão com compras à vista e parceladas, um estorno e a fatura mais antiga já paga. */
function semearCartoes(db) {
  if (lerConfig(db, 'demo_dados_v2') === '1') return;
  const hoje = hojeNoFuso(FUSO_PADRAO, new Date());
  const contexto = { hoje, agora: new Date() };
  const categorias = new Map(listarCategorias(db).map((c) => [c.nome, c.id]));
  const conta = listarContas(db).find((c) => c.nome === 'Conta corrente');

  db.transaction(() => {
    const cartao = criarCartao(
      db,
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
    const comprar = (dias, descricao, valor, categoria, parcelas = 1) =>
      criarCompra(
        db,
        {
          cartao_id: cartao.id, descricao, valor_total_centavos: valor, categoria_id: categorias.get(categoria),
          data_compra: somarDias(hoje, -dias), parcelas_total: parcelas, observacao: '',
        },
        contexto,
      ).compra;

    comprar(75, 'Curso de idiomas', 120000, 'Cursos', 6);
    comprar(45, 'Tênis', 45000, 'Vestuário', 3);
    comprar(8, 'Mercado do mês', 62000, 'Mercado');
    comprar(5, 'Streaming anual', 29900, 'Assinaturas e streaming');
    const jantar = comprar(4, 'Jantar', 18000, 'Restaurantes');
    estornarCompra(db, jantar.id, { valor_centavos: 4000, descricao: 'Item devolvido' }, contexto);

    const maisAntiga = faturasDoCartao(db, cartao.id, hoje).at(-1);
    if (conta && maisAntiga && maisAntiga.data_vencimento < hoje && maisAntiga.saldo_centavos > 0) {
      pagarFatura(
        db,
        maisAntiga.id,
        { valor_centavos: maisAntiga.saldo_centavos, conta_id: conta.id, data_pagamento: maisAntiga.data_vencimento },
        contexto,
      );
    }
    gravarConfig(db, 'demo_dados_v2', '1');
  })();
}

/** Onda 3: recorrências (aluguel e salário, começando daqui a alguns dias) e uma conta já atrasada. */
function semearCompromissos(db) {
  if (lerConfig(db, 'demo_dados_v3') === '1') return;
  const hoje = hojeNoFuso(FUSO_PADRAO, new Date());
  const contexto = { hoje, agora: new Date() };
  const categorias = new Map(listarCategorias(db).map((c) => [c.nome, c.id]));
  const conta = listarContas(db).find((c) => c.nome === 'Conta corrente');
  if (!conta) return;

  db.transaction(() => {
    const recorrencia = (tipo, descricao, valor, categoria, inicioEmDias) =>
      criarRecorrencia(
        db,
        {
          tipo, descricao, valor_centavos: valor, conta_id: conta.id, categoria_id: categorias.get(categoria) ?? null,
          frequencia: 'mensal', data_inicio: somarDias(hoje, inicioEmDias), data_fim: null, ativa: true, observacao: '',
        },
        contexto,
      );
    recorrencia('despesa', 'Aluguel', 180000, 'Aluguel ou financiamento', 9);
    recorrencia('despesa', 'Internet', 9990, 'Internet', 3);
    recorrencia('receita', 'Salário', 520000, 'Salário', 18);

    // Uma conta que já passou do vencimento, para a demonstração mostrar o atraso calculado (RF-07).
    const venceu = somarDias(hoje, -4);
    criarMovimentacao(
      db,
      {
        tipo: 'despesa', descricao: 'Mensalidade da academia', valor_centavos: 12900, conta_id: conta.id,
        categoria_id: categorias.get('Saúde') ?? null, divisoes: [], observacao: '', tarifa_centavos: 0,
        status: 'pendente', data_competencia: venceu, data_vencimento: venceu, data_liquidacao: null,
      },
      contexto,
    );
    gravarConfig(db, 'demo_dados_v3', '1');
  })();
}

/**
 * Prepara o banco de demonstração: senha e dados fictícios (contas, lançamentos, uma transferência
 * com tarifa, compromissos pendentes, um cartão e recorrências). Cada onda acrescenta os dados dos módulos que cria.
 */
export async function semearDemo(db) {
  if (lerConfig(db, 'demo_semeado') !== '1') {
    await definirSenha(db, SENHA_DEMO);
    gravarConfig(db, 'demo_semeado', '1');
  }
  if (lerConfig(db, 'demo_dados_v1') === '1') {
    semearCartoes(db);
    semearCompromissos(db);
    return;
  }

  semearPadroes(db);
  const hoje = hojeNoFuso(FUSO_PADRAO, new Date());
  const contexto = { hoje, agora: new Date() };
  const categorias = new Map(listarCategorias(db).map((c) => [c.nome, c.id]));

  db.transaction(() => {
    const novaConta = (nome, tipo, saldo) =>
      criarConta(db, { nome, tipo, saldo_inicial_centavos: saldo, arquivada: false }).id;
    const contas = {
      'Conta corrente': novaConta('Conta corrente', 'corrente', 150000),
      Poupança: novaConta('Poupança', 'poupanca', 500000),
      Carteira: novaConta('Carteira', 'carteira', 20000),
    };

    const base = { divisoes: [], observacao: '', tarifa_centavos: 0, status: 'liquidada' };
    for (const [dias, tipo, descricao, valor, categoria, conta] of LANCAMENTOS) {
      const data = somarDias(hoje, -dias);
      criarMovimentacao(
        db,
        {
          ...base, tipo, descricao, valor_centavos: valor, conta_id: contas[conta],
          categoria_id: categorias.get(categoria), data_competencia: data, data_liquidacao: data,
        },
        contexto,
      );
    }

    const transferencia = somarDias(hoje, -10);
    criarMovimentacao(
      db,
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
      criarMovimentacao(
        db,
        {
          ...base, tipo, descricao, valor_centavos: valor, conta_id: contas['Conta corrente'],
          categoria_id: categorias.get(categoria), status: 'pendente', data_competencia: vencimento,
          data_vencimento: vencimento, data_liquidacao: null,
        },
        contexto,
      );
    }
    gravarConfig(db, 'demo_dados_v1', '1');
  })();
  semearCartoes(db);
  semearCompromissos(db);
}
