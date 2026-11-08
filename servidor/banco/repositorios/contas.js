import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { calcularSaldos } from '../../dominio/saldo.js';
import { auditar } from '../auditoria.js';
import { pagamentosComoMovimentos } from './cartoes.js';
import { operacoesComoMovimentos } from './investimentos.js';

const COLUNAS = 'id, nome, tipo, saldo_inicial_centavos, arquivada, criada_em, atualizada_em';

const paraApi = (l) => ({ ...l, arquivada: l.arquivada === 1 });

function nomeEmUso(db, nome, ignorarId = null) {
  return !!db
    .prepare(
      'SELECT 1 FROM contas WHERE excluida_em IS NULL AND nome = ? COLLATE NOCASE AND id <> ?',
    )
    .get(nome, ignorarId ?? -1);
}

/** Contas com saldo calculado das movimentações liquidadas (RF-01). */
export function listarContas(db, { incluirArquivadas = true } = {}) {
  const linhas = db
    .prepare(`SELECT ${COLUNAS} FROM contas WHERE excluida_em IS NULL ORDER BY arquivada, nome COLLATE NOCASE`)
    .all();
  const movs = db
    .prepare(
      `SELECT tipo, conta_id, conta_destino_id, valor_centavos, status
         FROM movimentacoes WHERE excluida_em IS NULL AND status = 'liquidada'`,
    )
    .all();
  const saldos = calcularSaldos(linhas, [...movs, ...pagamentosComoMovimentos(db), ...operacoesComoMovimentos(db)]);
  return linhas
    .filter((l) => incluirArquivadas || l.arquivada === 0)
    .map((l) => ({ ...paraApi(l), saldo_centavos: saldos[l.id] }));
}

export function obterConta(db, id) {
  return listarContas(db).find((c) => c.id === id) ?? null;
}

export function criarConta(db, dados, { agora = new Date() } = {}) {
  if (nomeEmUso(db, dados.nome)) throw invalido({ nome: 'Já existe uma conta com esse nome.' });
  return db.transaction(() => {
    const iso = agora.toISOString();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO contas (nome, tipo, saldo_inicial_centavos, arquivada, criada_em, atualizada_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(dados.nome, dados.tipo, dados.saldo_inicial_centavos, dados.arquivada ? 1 : 0, iso, iso);
    const depois = obterConta(db, Number(lastInsertRowid));
    auditar(db, { entidade: 'conta', id: depois.id, acao: 'criar', depois });
    return depois;
  })();
}

export function atualizarConta(db, id, dados, { agora = new Date() } = {}) {
  const antes = obterConta(db, id);
  if (!antes) throw naoEncontrado('Conta');
  if (nomeEmUso(db, dados.nome, id)) throw invalido({ nome: 'Já existe uma conta com esse nome.' });
  return db.transaction(() => {
    db.prepare(
      `UPDATE contas SET nome = ?, tipo = ?, saldo_inicial_centavos = ?, arquivada = ?, atualizada_em = ?
        WHERE id = ?`,
    ).run(dados.nome, dados.tipo, dados.saldo_inicial_centavos, dados.arquivada ? 1 : 0, agora.toISOString(), id);
    const depois = obterConta(db, id);
    auditar(db, { entidade: 'conta', id, acao: 'editar', antes, depois });
    return depois;
  })();
}

/** Só exclui conta sem movimentações; senão o caminho é arquivar (RF-08: nada fica órfão). */
export function excluirConta(db, id, { agora = new Date() } = {}) {
  const antes = obterConta(db, id);
  if (!antes) throw naoEncontrado('Conta');
  const usos = db
    .prepare(
      `SELECT COUNT(*) AS n FROM movimentacoes
        WHERE excluida_em IS NULL AND (conta_id = ? OR conta_destino_id = ?)`,
    )
    .get(id, id).n;
  if (usos > 0) {
    throw conflito('Esta conta tem movimentações. Arquive a conta em vez de excluir.');
  }
  const usadaNoCartao = db
    .prepare(
      `SELECT 1 FROM pagamentos_fatura WHERE conta_id = ? AND excluido_em IS NULL
       UNION ALL SELECT 1 FROM cartoes WHERE conta_pagamento_id = ? AND excluido_em IS NULL`,
    )
    .get(id, id);
  if (usadaNoCartao) {
    throw conflito('Esta conta tem pagamento de fatura ou é a conta de um cartão. Arquive a conta em vez de excluir.');
  }
  const usadaEmInvestimento = db
    .prepare('SELECT 1 FROM investimentos_operacoes WHERE conta_id = ? AND excluida_em IS NULL')
    .get(id);
  if (usadaEmInvestimento) {
    throw conflito('Esta conta tem aportes ou resgates de investimento. Arquive a conta em vez de excluir.');
  }
  db.transaction(() => {
    db.prepare('UPDATE contas SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(
      agora.toISOString(),
      agora.toISOString(),
      id,
    );
    auditar(db, { entidade: 'conta', id, acao: 'excluir', antes });
  })();
}
