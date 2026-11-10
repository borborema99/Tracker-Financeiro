import { naoEncontrado, invalido } from '../../erros.js';
import { ocorrenciasDaRecorrencia } from '../../dominio/recorrencia.js';
import { somarDias } from '../../dominio/datas.js';
import { auditar } from '../auditoria.js';
import { inserirMovimentacaoAuditada, obterMovimentacao } from './movimentacoes.js';

/** Até onde as ocorrências são geradas à frente: cobre a maior projeção do fluxo (90 dias). */
export const HORIZONTE_DE_GERACAO_DIAS = 90;

const COLUNAS =
  'id, tipo, descricao, valor_centavos, conta_id, categoria_id, frequencia, data_inicio, data_fim, ativa, ' +
  'assinatura, observacao, criada_em, atualizada_em';

export async function obterRecorrencia(esc, id) {
  const l = await esc.um(`SELECT ${COLUNAS} FROM recorrencias WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL`, [id]);
  return l ?? null;
}

/** Próxima ocorrência ainda não liquidada, para a lista. */
async function proximaPendente(esc, id) {
  const l = await esc.um(
    `SELECT COALESCE(data_vencimento, data_competencia) AS data FROM movimentacoes
      WHERE usuario_id = :u AND recorrencia_id = ? AND excluida_em IS NULL AND status = 'pendente'
      ORDER BY data LIMIT 1`,
    [id],
  );
  return l?.data ?? null;
}

export async function listarRecorrencias(esc) {
  const linhas = await esc.todos(
    `SELECT ${COLUNAS} FROM recorrencias WHERE usuario_id = :u AND excluida_em IS NULL ORDER BY ativa DESC, lower(descricao)`,
  );
  const saida = [];
  for (const l of linhas) saida.push({ ...l, proximo_vencimento: await proximaPendente(esc, l.id) });
  return saida;
}

async function validar(esc, d) {
  const campos = {};
  const conta = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [d.conta_id]);
  if (!conta) campos.conta_id = 'Conta não encontrada.';
  else if (conta.arquivada && d.ativa) campos.conta_id = 'Esta conta está arquivada.';
  if (d.categoria_id) {
    const c = await esc.um('SELECT tipo FROM categorias WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [d.categoria_id]);
    if (!c) campos.categoria_id = 'Categoria não encontrada.';
    else if (c.tipo !== d.tipo) campos.categoria_id = `Esta categoria não é de ${d.tipo}.`;
  }
  if (Object.keys(campos).length) throw invalido(campos);
}

/**
 * Remove (exclusão lógica) as ocorrências pendentes de hoje em diante. Não vira "pulada": elas voltam
 * a ser geradas se a recorrência continuar valendo. O que já venceu ou foi liquidado não é tocado.
 */
async function removerFuturasPendentes(esc, id, hoje, iso) {
  const alvos = await esc.todos(
    `SELECT id FROM movimentacoes
      WHERE usuario_id = :u AND recorrencia_id = ? AND excluida_em IS NULL AND status = 'pendente' AND data_ocorrencia >= ?`,
    [id, hoje],
  );
  for (const { id: alvo } of alvos) {
    const antes = await obterMovimentacao(esc, alvo);
    await esc.rodar('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, alvo]);
    await auditar(esc, { entidade: 'movimentacao', id: alvo, acao: 'excluir', antes });
  }
}

const datasExistentes = async (esc, id) =>
  new Set(
    (
      await esc.todos('SELECT data_ocorrencia FROM movimentacoes WHERE usuario_id = :u AND recorrencia_id = ? AND excluida_em IS NULL', [id])
    ).map((l) => l.data_ocorrencia),
  );

/** Marca como puladas as datas anteriores a hoje que não têm lançamento, para que não voltem a ser geradas. */
async function pularOcorrenciasPassadas(esc, r, id, hoje) {
  const existentes = await datasExistentes(esc, id);
  for (const data of ocorrenciasDaRecorrencia(r, somarDias(hoje, -1))) {
    if (!existentes.has(data)) {
      await esc.rodar(
        'INSERT INTO recorrencias_puladas (usuario_id, recorrencia_id, data_ocorrencia) VALUES (:u, ?, ?) ON CONFLICT DO NOTHING',
        [id, data],
      );
    }
  }
}

/** Cria as ocorrências que faltam de uma recorrência até `ate`. Idempotente: nada é criado duas vezes. */
async function gerarDe(esc, r, ate, iso) {
  const conta = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [r.conta_id]);
  if (!conta || conta.arquivada) return 0;
  const datas = ocorrenciasDaRecorrencia(r, ate);
  if (datas.length === 0) return 0;
  const existentes = await datasExistentes(esc, r.id);
  const puladas = new Set(
    (await esc.todos('SELECT data_ocorrencia FROM recorrencias_puladas WHERE usuario_id = :u AND recorrencia_id = ?', [r.id])).map(
      (l) => l.data_ocorrencia,
    ),
  );
  let criadas = 0;
  for (const data of datas) {
    if (existentes.has(data) || puladas.has(data)) continue;
    await inserirMovimentacaoAuditada(
      esc,
      {
        tipo: r.tipo,
        descricao: r.descricao,
        valor_centavos: r.valor_centavos,
        conta_id: r.conta_id,
        categoria_id: r.categoria_id,
        data_competencia: data,
        data_vencimento: data,
        status: 'pendente',
        observacao: r.observacao,
        recorrencia_id: r.id,
        data_ocorrencia: data,
      },
      iso,
    );
    criadas++;
  }
  return criadas;
}

/**
 * Gera as ocorrências de todas as recorrências ativas até hoje + 90 dias. Chamado ao abrir o app e ao listar;
 * não há processo em segundo plano. Rodar de novo no mesmo dia não cria nada.
 */
export async function gerarOcorrencias(esc, { hoje, agora = new Date() }) {
  const ativas = await esc.todos(`SELECT ${COLUNAS} FROM recorrencias WHERE usuario_id = :u AND excluida_em IS NULL AND ativa`);
  if (ativas.length === 0) return 0;
  const ate = somarDias(hoje, HORIZONTE_DE_GERACAO_DIAS);
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    let total = 0;
    for (const r of ativas) total += await gerarDe(tx, r, ate, iso);
    return total;
  });
}

const valoresDaRecorrencia = (d) => [
  d.tipo,
  d.descricao,
  d.valor_centavos,
  d.conta_id,
  d.categoria_id ?? null,
  d.frequencia,
  d.data_inicio,
  d.data_fim ?? null,
  !!d.ativa,
  !!d.assinatura,
  d.observacao,
];

export async function criarRecorrencia(esc, dados, { hoje, agora = new Date() }) {
  await validar(esc, dados);
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    const [{ id }] = await tx.rodar(
      `INSERT INTO recorrencias (usuario_id, tipo, descricao, valor_centavos, conta_id, categoria_id, frequencia,
         data_inicio, data_fim, ativa, assinatura, observacao, criada_em, atualizada_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [...valoresDaRecorrencia(dados), iso, iso],
    );
    const recorrencia = await obterRecorrencia(tx, id);
    await auditar(tx, { entidade: 'recorrencia', id, acao: 'criar', depois: recorrencia });
    if (recorrencia.ativa) await gerarDe(tx, recorrencia, somarDias(hoje, HORIZONTE_DE_GERACAO_DIAS), iso);
    return recorrencia;
  });
}

/** Editar vale daqui para frente: as ocorrências pendentes futuras são refeitas; o passado fica como está. */
export async function atualizarRecorrencia(esc, id, dados, { hoje, agora = new Date() }) {
  const antes = await obterRecorrencia(esc, id);
  if (!antes) throw naoEncontrado('Recorrência');
  await validar(esc, dados);
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    await tx.rodar(
      `UPDATE recorrencias SET tipo = ?, descricao = ?, valor_centavos = ?,
         conta_id = ?, categoria_id = ?, frequencia = ?, data_inicio = ?,
         data_fim = ?, ativa = ?, assinatura = ?, observacao = ?,
         atualizada_em = ? WHERE usuario_id = :u AND id = ?`,
      [...valoresDaRecorrencia(dados), iso, id],
    );
    // Reativar não recria as cobranças do período em que esteve pausada (RF-18): elas viram "puladas".
    if (!antes.ativa && dados.ativa) await pularOcorrenciasPassadas(tx, { ...antes, ...dados }, id, hoje);
    const depois = await obterRecorrencia(tx, id);
    await auditar(tx, { entidade: 'recorrencia', id, acao: 'editar', antes, depois });
    await removerFuturasPendentes(tx, id, hoje, iso);
    if (depois.ativa) await gerarDe(tx, depois, somarDias(hoje, HORIZONTE_DE_GERACAO_DIAS), iso);
    return depois;
  });
}

export async function excluirRecorrencia(esc, id, { hoje, agora = new Date() }) {
  const antes = await obterRecorrencia(esc, id);
  if (!antes) throw naoEncontrado('Recorrência');
  const iso = agora.toISOString();
  await esc.transacao(async (tx) => {
    await removerFuturasPendentes(tx, id, hoje, iso);
    await tx.rodar('UPDATE recorrencias SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, id]);
    await auditar(tx, { entidade: 'recorrencia', id, acao: 'excluir', antes });
  });
}
