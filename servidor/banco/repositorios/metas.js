import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { acumuladoDaMeta, progressoDaMeta } from '../../dominio/meta.js';
import { auditar } from '../auditoria.js';

const COLUNAS = 'id, nome, valor_alvo_centavos, prazo, observacao, criada_em, atualizada_em';

const aportesDe = (esc, metaId) =>
  esc.todos(
    `SELECT id, tipo, valor_centavos, data, observacao FROM metas_aportes
      WHERE usuario_id = :u AND meta_id = ? AND excluido_em IS NULL ORDER BY data DESC, id DESC`,
    [metaId],
  );

function paraApi(meta, hoje, aportes) {
  return { ...meta, ...progressoDaMeta(meta, aportes, hoje) };
}

async function obterLinha(esc, id) {
  return (await esc.um(`SELECT ${COLUNAS} FROM metas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL`, [id])) ?? null;
}

/** Lista de metas com o progresso calculado: em andamento primeiro (prazo mais próximo), depois concluídas. */
export async function listarMetas(esc, hoje) {
  const linhas = await esc.todos(`SELECT ${COLUNAS} FROM metas WHERE usuario_id = :u AND excluida_em IS NULL`);
  const metas = [];
  for (const m of linhas) metas.push(paraApi(m, hoje, await aportesDe(esc, m.id)));
  const ordem = { atrasada: 0, em_andamento: 1, concluida: 2 };
  return metas.sort(
    (a, b) =>
      ordem[a.situacao] - ordem[b.situacao] ||
      (a.prazo ?? '9999-99-99').localeCompare(b.prazo ?? '9999-99-99') ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Uma meta com o progresso e a lista de aportes e resgates. */
export async function obterMeta(esc, id, hoje) {
  const m = await obterLinha(esc, id);
  if (!m) return null;
  const aportes = await aportesDe(esc, id);
  return { ...paraApi(m, hoje, aportes), aportes };
}

/** Resumo para o início: só existe se houver meta ainda em andamento ou atrasada (RF-10). */
export async function resumoDeMetas(esc, hoje) {
  const abertas = (await listarMetas(esc, hoje)).filter((m) => m.situacao !== 'concluida');
  if (abertas.length === 0) return null;
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((m) => m.situacao === 'atrasada').length,
    acumulado_centavos: abertas.reduce((s, m) => s + Math.max(0, m.acumulado_centavos), 0),
    alvo_centavos: abertas.reduce((s, m) => s + m.valor_alvo_centavos, 0),
  };
}

const normalizar = (d) => [d.nome, d.valor_alvo_centavos, d.prazo ?? null, d.observacao];

export async function criarMeta(esc, dados, { hoje, agora = new Date() }) {
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    const [{ id }] = await tx.rodar(
      `INSERT INTO metas (usuario_id, nome, valor_alvo_centavos, prazo, observacao, criada_em, atualizada_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [...normalizar(dados), iso, iso],
    );
    await auditar(tx, { entidade: 'meta', id, acao: 'criar', depois: await obterLinha(tx, id) });
    return obterMeta(tx, id, hoje);
  });
}

export async function atualizarMeta(esc, id, dados, { hoje, agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Meta');
  return esc.transacao(async (tx) => {
    await tx.rodar(
      `UPDATE metas SET nome = ?, valor_alvo_centavos = ?, prazo = ?,
         observacao = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?`,
      [...normalizar(dados), agora.toISOString(), id],
    );
    await auditar(tx, { entidade: 'meta', id, acao: 'editar', antes, depois: await obterLinha(tx, id) });
    return obterMeta(tx, id, hoje);
  });
}

export async function excluirMeta(esc, id, { agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Meta');
  const iso = agora.toISOString();
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE metas SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, id]);
    await auditar(tx, { entidade: 'meta', id, acao: 'excluir', antes });
  });
}

/** Aporte ou resgate. Resgate maior que o acumulado é recusado: a meta nunca fica negativa (RF-13). */
export async function registrarAporte(esc, metaId, dados, { hoje, agora = new Date() }) {
  if (!(await obterLinha(esc, metaId))) throw naoEncontrado('Meta');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  return esc.transacao(async (tx) => {
    if (dados.tipo === 'resgate') {
      const acumulado = acumuladoDaMeta(await aportesDe(tx, metaId));
      if (dados.valor_centavos > acumulado) throw conflito('O resgate é maior que o valor acumulado na meta.');
    }
    const [{ id }] = await tx.rodar(
      `INSERT INTO metas_aportes (usuario_id, meta_id, tipo, valor_centavos, data, observacao, criado_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [metaId, dados.tipo, dados.valor_centavos, dados.data, dados.observacao, agora.toISOString()],
    );
    await auditar(tx, { entidade: 'meta_aporte', id, acao: 'criar', depois: { meta_id: metaId, ...dados } });
    return obterMeta(tx, metaId, hoje);
  });
}

/** Remove um aporte ou resgate; se isso deixasse o acumulado negativo, é recusado. */
export async function excluirAporte(esc, metaId, aporteId, { hoje, agora = new Date() }) {
  if (!(await obterLinha(esc, metaId))) throw naoEncontrado('Meta');
  const aportes = await aportesDe(esc, metaId);
  const alvo = aportes.find((a) => a.id === aporteId);
  if (!alvo) throw naoEncontrado('Aporte');
  if (acumuladoDaMeta(aportes.filter((a) => a.id !== aporteId)) < 0) {
    throw conflito('Remover este aporte deixaria o valor acumulado da meta negativo. Remova o resgate antes.');
  }
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE metas_aportes SET excluido_em = ? WHERE usuario_id = :u AND id = ?', [agora.toISOString(), aporteId]);
    await auditar(tx, { entidade: 'meta_aporte', id: aporteId, acao: 'excluir', antes: { meta_id: metaId, ...alvo } });
    return obterMeta(tx, metaId, hoje);
  });
}
