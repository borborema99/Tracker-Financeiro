import { invalido, naoEncontrado } from '../../erros.js';
import { descricaoDaParcela, gerarParcelas, resumoDaDivida } from '../../dominio/divida.js';
import { situacaoDoCompromisso } from '../../dominio/compromisso.js';
import { auditar } from '../auditoria.js';
import { inserirMovimentacaoAuditada, obterMovimentacao } from './movimentacoes.js';

const COLUNAS =
  'id, nome, credor, parcelas_total, valor_total_centavos, primeiro_vencimento, conta_id, categoria_id, observacao, criada_em, atualizada_em';

const obterLinha = (db, id) => db.prepare(`SELECT ${COLUNAS} FROM dividas WHERE id = ? AND excluida_em IS NULL`).get(id) ?? null;

const lancamentosDaDivida = (db, id) =>
  db
    .prepare(
      `SELECT id, divida_parcela, status, valor_centavos, data_vencimento, data_competencia, data_liquidacao
         FROM movimentacoes WHERE divida_id = ? AND excluida_em IS NULL
        ORDER BY divida_parcela, data_competencia, id`,
    )
    .all(id);

const comResumo = (db, d, hoje) => ({ ...d, ...resumoDaDivida(lancamentosDaDivida(db, d.id), hoje) });

/** Em atraso primeiro, depois em dia (pela próxima parcela), depois quitadas. */
export function listarDividas(db, hoje) {
  const ordem = { atrasada: 0, em_dia: 1, quitada: 2, sem_parcelas: 3 };
  return db
    .prepare(`SELECT ${COLUNAS} FROM dividas WHERE excluida_em IS NULL`)
    .all()
    .map((d) => comResumo(db, d, hoje))
    .sort(
      (a, b) =>
        ordem[a.situacao] - ordem[b.situacao] ||
        (a.proxima?.data_vencimento ?? '9999-99-99').localeCompare(b.proxima?.data_vencimento ?? '9999-99-99') ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

/** Uma dívida com cada parcela (inclusive o restante de uma baixa parcial) e sua situação calculada. */
export function obterDivida(db, id, hoje) {
  const d = obterLinha(db, id);
  if (!d) return null;
  const parcelas = lancamentosDaDivida(db, id).map((l) => ({
    lancamento_id: l.id,
    numero: l.divida_parcela,
    valor_centavos: l.valor_centavos,
    status: l.status,
    data_vencimento: l.data_vencimento ?? l.data_competencia,
    data_liquidacao: l.data_liquidacao,
    situacao: situacaoDoCompromisso(l, hoje),
  }));
  return { ...comResumo(db, d, hoje), parcelas };
}

/** Resumo para o início: só existe se houver dívida com parcela em aberto (RF-10). */
export function resumoDeDividas(db, hoje) {
  const abertas = listarDividas(db, hoje).filter((d) => d.restante_centavos > 0);
  if (abertas.length === 0) return null;
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((d) => d.situacao === 'atrasada').length,
    restante_centavos: abertas.reduce((s, d) => s + d.restante_centavos, 0),
    atrasado_centavos: abertas.reduce((s, d) => s + d.atrasado_centavos, 0),
  };
}

function validar(db, d) {
  const campos = {};
  const conta = db.prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL').get(d.conta_id);
  if (!conta) campos.conta_id = 'Conta não encontrada.';
  else if (conta.arquivada === 1) campos.conta_id = 'Esta conta está arquivada.';
  if (d.categoria_id) {
    const c = db.prepare('SELECT tipo FROM categorias WHERE id = ? AND excluida_em IS NULL').get(d.categoria_id);
    if (!c) campos.categoria_id = 'Categoria não encontrada.';
    else if (c.tipo !== 'despesa') campos.categoria_id = 'Esta categoria não é de despesa.';
  }
  if (Object.keys(campos).length) throw invalido(campos);
}

/** Cria a dívida e as suas parcelas como despesas pendentes, tudo na mesma transação e com auditoria. */
export function criarDivida(db, dados, { hoje, agora = new Date() }) {
  validar(db, dados);
  const iso = agora.toISOString();
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO dividas (nome, credor, parcelas_total, valor_total_centavos, primeiro_vencimento, conta_id,
           categoria_id, observacao, criada_em, atualizada_em)
         VALUES (@nome, @credor, @parcelas_total, @valor_total_centavos, @primeiro_vencimento, @conta_id,
           @categoria_id, @observacao, @iso, @iso)`,
      )
      .run({ ...dados, categoria_id: dados.categoria_id ?? null, iso });
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'divida', id, acao: 'criar', depois: obterLinha(db, id) });
    for (const p of gerarParcelas(dados)) {
      inserirMovimentacaoAuditada(
        db,
        {
          tipo: 'despesa',
          descricao: descricaoDaParcela(dados.nome, p.numero, dados.parcelas_total),
          valor_centavos: p.valor_centavos,
          conta_id: dados.conta_id,
          categoria_id: dados.categoria_id ?? null,
          data_competencia: p.data_vencimento,
          data_vencimento: p.data_vencimento,
          status: 'pendente',
          observacao: dados.observacao,
          divida_id: id,
          divida_parcela: p.numero,
        },
        iso,
      );
    }
    return obterDivida(db, id, hoje);
  })();
}

/** Muda nome, credor e observação; o nome novo vai também para a descrição de cada parcela. */
export function atualizarDivida(db, id, dados, { hoje, agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Dívida');
  const iso = agora.toISOString();
  return db.transaction(() => {
    db.prepare('UPDATE dividas SET nome = @nome, credor = @credor, observacao = @observacao, atualizada_em = @iso WHERE id = @id').run({
      ...dados,
      id,
      iso,
    });
    auditar(db, { entidade: 'divida', id, acao: 'editar', antes, depois: obterLinha(db, id) });
    if (dados.nome !== antes.nome) {
      for (const { id: movId, divida_parcela: n } of lancamentosDaDivida(db, id)) {
        const anterior = obterMovimentacao(db, movId);
        db.prepare('UPDATE movimentacoes SET descricao = ?, atualizada_em = ? WHERE id = ?').run(
          descricaoDaParcela(dados.nome, n, antes.parcelas_total),
          iso,
          movId,
        );
        auditar(db, { entidade: 'movimentacao', id: movId, acao: 'editar', antes: anterior, depois: obterMovimentacao(db, movId) });
      }
    }
    return obterDivida(db, id, hoje);
  })();
}

/**
 * Exclui a dívida e as parcelas que ainda estão pendentes. O que já foi pago continua nos lançamentos
 * (é histórico de dinheiro que saiu da conta) e nada fica órfão: nenhuma parcela pendente sobra (RF-16).
 */
export function excluirDivida(db, id, { agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Dívida');
  const iso = agora.toISOString();
  db.transaction(() => {
    for (const l of lancamentosDaDivida(db, id).filter((x) => x.status === 'pendente')) {
      const anterior = obterMovimentacao(db, l.id);
      db.prepare('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, l.id);
      auditar(db, { entidade: 'movimentacao', id: l.id, acao: 'excluir', antes: anterior });
    }
    db.prepare('UPDATE dividas SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, id);
    auditar(db, { entidade: 'divida', id, acao: 'excluir', antes });
  })();
}
