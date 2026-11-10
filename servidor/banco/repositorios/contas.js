import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { calcularSaldos } from '../../dominio/saldo.js';
import { auditar } from '../auditoria.js';
import { pagamentosComoMovimentos } from './cartoes.js';
import { operacoesComoMovimentos } from './investimentos.js';
import { operacoesDeMoedaComoMovimentos } from './moedas.js';

const COLUNAS = 'id, nome, tipo, saldo_inicial_centavos, arquivada, criada_em, atualizada_em';

async function nomeEmUso(esc, nome, ignorarId = null) {
  const linha = await esc.um(
    'SELECT 1 AS um FROM contas WHERE usuario_id = :u AND excluida_em IS NULL AND lower(nome) = lower(?) AND id <> ?',
    [nome, ignorarId ?? -1],
  );
  return !!linha;
}

/** Contas com saldo calculado das movimentações liquidadas (RF-01). */
export async function listarContas(esc, { incluirArquivadas = true } = {}) {
  const linhas = await esc.todos(
    `SELECT ${COLUNAS} FROM contas WHERE usuario_id = :u AND excluida_em IS NULL ORDER BY arquivada, lower(nome)`,
  );
  const movs = await esc.todos(
    `SELECT tipo, conta_id, conta_destino_id, valor_centavos, status
       FROM movimentacoes WHERE usuario_id = :u AND excluida_em IS NULL AND status = 'liquidada'`,
  );
  const saldos = calcularSaldos(linhas, [
    ...movs,
    ...(await pagamentosComoMovimentos(esc)),
    ...(await operacoesComoMovimentos(esc)),
    ...(await operacoesDeMoedaComoMovimentos(esc)),
  ]);
  return linhas
    .filter((l) => incluirArquivadas || !l.arquivada)
    .map((l) => ({ ...l, saldo_centavos: saldos[l.id] }));
}

export async function obterConta(esc, id) {
  return (await listarContas(esc)).find((c) => c.id === id) ?? null;
}

export async function criarConta(esc, dados, { agora = new Date() } = {}) {
  if (await nomeEmUso(esc, dados.nome)) throw invalido({ nome: 'Já existe uma conta com esse nome.' });
  return esc.transacao(async (tx) => {
    const iso = agora.toISOString();
    const [{ id }] = await tx.rodar(
      `INSERT INTO contas (usuario_id, nome, tipo, saldo_inicial_centavos, arquivada, criada_em, atualizada_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [dados.nome, dados.tipo, dados.saldo_inicial_centavos, !!dados.arquivada, iso, iso],
    );
    const depois = await obterConta(tx, id);
    await auditar(tx, { entidade: 'conta', id: depois.id, acao: 'criar', depois });
    return depois;
  });
}

export async function atualizarConta(esc, id, dados, { agora = new Date() } = {}) {
  const antes = await obterConta(esc, id);
  if (!antes) throw naoEncontrado('Conta');
  if (await nomeEmUso(esc, dados.nome, id)) throw invalido({ nome: 'Já existe uma conta com esse nome.' });
  return esc.transacao(async (tx) => {
    await tx.rodar(
      `UPDATE contas SET nome = ?, tipo = ?, saldo_inicial_centavos = ?, arquivada = ?, atualizada_em = ?
        WHERE usuario_id = :u AND id = ?`,
      [dados.nome, dados.tipo, dados.saldo_inicial_centavos, !!dados.arquivada, agora.toISOString(), id],
    );
    const depois = await obterConta(tx, id);
    await auditar(tx, { entidade: 'conta', id, acao: 'editar', antes, depois });
    return depois;
  });
}

/** Só exclui conta sem movimentações; senão o caminho é arquivar (RF-08: nada fica órfão). */
export async function excluirConta(esc, id, { agora = new Date() } = {}) {
  const antes = await obterConta(esc, id);
  if (!antes) throw naoEncontrado('Conta');
  const { n: usos } = await esc.um(
    `SELECT COUNT(*) AS n FROM movimentacoes
      WHERE usuario_id = :u AND excluida_em IS NULL AND (conta_id = ? OR conta_destino_id = ?)`,
    [id, id],
  );
  if (usos > 0) {
    throw conflito('Esta conta tem movimentações. Arquive a conta em vez de excluir.');
  }
  const usadaNoCartao = await esc.um(
    `SELECT 1 AS um FROM pagamentos_fatura WHERE usuario_id = :u AND conta_id = ? AND excluido_em IS NULL
     UNION ALL SELECT 1 FROM cartoes WHERE usuario_id = :u AND conta_pagamento_id = ? AND excluido_em IS NULL`,
    [id, id],
  );
  if (usadaNoCartao) {
    throw conflito('Esta conta tem pagamento de fatura ou é a conta de um cartão. Arquive a conta em vez de excluir.');
  }
  const usadaEmInvestimento = await esc.um(
    'SELECT 1 AS um FROM investimentos_operacoes WHERE usuario_id = :u AND conta_id = ? AND excluida_em IS NULL',
    [id],
  );
  if (usadaEmInvestimento) {
    throw conflito('Esta conta tem aportes ou resgates de investimento. Arquive a conta em vez de excluir.');
  }
  const usadaEmMoeda = await esc.um(
    'SELECT 1 AS um FROM moeda_operacoes WHERE usuario_id = :u AND conta_id = ? AND excluida_em IS NULL',
    [id],
  );
  if (usadaEmMoeda) {
    throw conflito('Esta conta tem compras ou vendas de moeda estrangeira. Arquive a conta em vez de excluir.');
  }
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE contas SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [
      agora.toISOString(),
      agora.toISOString(),
      id,
    ]);
    await auditar(tx, { entidade: 'conta', id, acao: 'excluir', antes });
  });
}
