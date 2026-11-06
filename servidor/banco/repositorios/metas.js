import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { acumuladoDaMeta, progressoDaMeta } from '../../dominio/meta.js';
import { auditar } from '../auditoria.js';

const COLUNAS = 'id, nome, valor_alvo_centavos, prazo, observacao, criada_em, atualizada_em';

function aportesDe(db, metaId) {
  return db
    .prepare(
      `SELECT id, tipo, valor_centavos, data, observacao FROM metas_aportes
        WHERE meta_id = ? AND excluido_em IS NULL ORDER BY data DESC, id DESC`,
    )
    .all(metaId);
}

function paraApi(meta, hoje, aportes) {
  return { ...meta, ...progressoDaMeta(meta, aportes, hoje) };
}

function obterLinha(db, id) {
  return db.prepare(`SELECT ${COLUNAS} FROM metas WHERE id = ? AND excluida_em IS NULL`).get(id) ?? null;
}

/** Lista de metas com o progresso calculado: em andamento primeiro (prazo mais próximo), depois concluídas. */
export function listarMetas(db, hoje) {
  const metas = db
    .prepare(`SELECT ${COLUNAS} FROM metas WHERE excluida_em IS NULL`)
    .all()
    .map((m) => paraApi(m, hoje, aportesDe(db, m.id)));
  const ordem = { atrasada: 0, em_andamento: 1, concluida: 2 };
  return metas.sort(
    (a, b) =>
      ordem[a.situacao] - ordem[b.situacao] ||
      (a.prazo ?? '9999-99-99').localeCompare(b.prazo ?? '9999-99-99') ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Uma meta com o progresso e a lista de aportes e resgates. */
export function obterMeta(db, id, hoje) {
  const m = obterLinha(db, id);
  if (!m) return null;
  const aportes = aportesDe(db, id);
  return { ...paraApi(m, hoje, aportes), aportes };
}

/** Resumo para o início: só existe se houver meta ainda em andamento ou atrasada (RF-10). */
export function resumoDeMetas(db, hoje) {
  const abertas = listarMetas(db, hoje).filter((m) => m.situacao !== 'concluida');
  if (abertas.length === 0) return null;
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((m) => m.situacao === 'atrasada').length,
    acumulado_centavos: abertas.reduce((s, m) => s + Math.max(0, m.acumulado_centavos), 0),
    alvo_centavos: abertas.reduce((s, m) => s + m.valor_alvo_centavos, 0),
  };
}

const normalizar = (d) => ({ nome: d.nome, valor_alvo_centavos: d.valor_alvo_centavos, prazo: d.prazo ?? null, observacao: d.observacao });

export function criarMeta(db, dados, { hoje, agora = new Date() }) {
  const iso = agora.toISOString();
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO metas (nome, valor_alvo_centavos, prazo, observacao, criada_em, atualizada_em)
         VALUES (@nome, @valor_alvo_centavos, @prazo, @observacao, @iso, @iso)`,
      )
      .run({ ...normalizar(dados), iso });
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'meta', id, acao: 'criar', depois: obterLinha(db, id) });
    return obterMeta(db, id, hoje);
  })();
}

export function atualizarMeta(db, id, dados, { hoje, agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Meta');
  return db.transaction(() => {
    db.prepare(
      `UPDATE metas SET nome = @nome, valor_alvo_centavos = @valor_alvo_centavos, prazo = @prazo,
         observacao = @observacao, atualizada_em = @iso WHERE id = @id`,
    ).run({ ...normalizar(dados), id, iso: agora.toISOString() });
    auditar(db, { entidade: 'meta', id, acao: 'editar', antes, depois: obterLinha(db, id) });
    return obterMeta(db, id, hoje);
  })();
}

export function excluirMeta(db, id, { agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Meta');
  const iso = agora.toISOString();
  db.transaction(() => {
    db.prepare('UPDATE metas SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, id);
    auditar(db, { entidade: 'meta', id, acao: 'excluir', antes });
  })();
}

/** Aporte ou resgate. Resgate maior que o acumulado é recusado: a meta nunca fica negativa (RF-13). */
export function registrarAporte(db, metaId, dados, { hoje, agora = new Date() }) {
  if (!obterLinha(db, metaId)) throw naoEncontrado('Meta');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  return db.transaction(() => {
    if (dados.tipo === 'resgate') {
      const acumulado = acumuladoDaMeta(aportesDe(db, metaId));
      if (dados.valor_centavos > acumulado) throw conflito('O resgate é maior que o valor acumulado na meta.');
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO metas_aportes (meta_id, tipo, valor_centavos, data, observacao, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(metaId, dados.tipo, dados.valor_centavos, dados.data, dados.observacao, agora.toISOString());
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'meta_aporte', id, acao: 'criar', depois: { meta_id: metaId, ...dados } });
    return obterMeta(db, metaId, hoje);
  })();
}

/** Remove um aporte ou resgate; se isso deixasse o acumulado negativo, é recusado. */
export function excluirAporte(db, metaId, aporteId, { hoje, agora = new Date() }) {
  if (!obterLinha(db, metaId)) throw naoEncontrado('Meta');
  const aportes = aportesDe(db, metaId);
  const alvo = aportes.find((a) => a.id === aporteId);
  if (!alvo) throw naoEncontrado('Aporte');
  if (acumuladoDaMeta(aportes.filter((a) => a.id !== aporteId)) < 0) {
    throw conflito('Remover este aporte deixaria o valor acumulado da meta negativo. Remova o resgate antes.');
  }
  return db.transaction(() => {
    db.prepare('UPDATE metas_aportes SET excluido_em = ? WHERE id = ?').run(agora.toISOString(), aporteId);
    auditar(db, { entidade: 'meta_aporte', id: aporteId, acao: 'excluir', antes: { meta_id: metaId, ...alvo } });
    return obterMeta(db, metaId, hoje);
  })();
}
