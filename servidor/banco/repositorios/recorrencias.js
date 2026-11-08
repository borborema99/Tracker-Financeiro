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

const paraApi = (l) => ({ ...l, ativa: l.ativa === 1, assinatura: l.assinatura === 1 });

export function obterRecorrencia(db, id) {
  const l = db.prepare(`SELECT ${COLUNAS} FROM recorrencias WHERE id = ? AND excluida_em IS NULL`).get(id);
  return l ? paraApi(l) : null;
}

/** Próxima ocorrência ainda não liquidada, para a lista. */
function proximaPendente(db, id) {
  return (
    db
      .prepare(
        `SELECT COALESCE(data_vencimento, data_competencia) AS data FROM movimentacoes
          WHERE recorrencia_id = ? AND excluida_em IS NULL AND status = 'pendente'
          ORDER BY data LIMIT 1`,
      )
      .get(id)?.data ?? null
  );
}

export function listarRecorrencias(db) {
  return db
    .prepare(`SELECT ${COLUNAS} FROM recorrencias WHERE excluida_em IS NULL ORDER BY ativa DESC, descricao COLLATE NOCASE`)
    .all()
    .map((l) => ({ ...paraApi(l), proximo_vencimento: proximaPendente(db, l.id) }));
}

function validar(db, d) {
  const campos = {};
  const conta = db.prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL').get(d.conta_id);
  if (!conta) campos.conta_id = 'Conta não encontrada.';
  else if (conta.arquivada === 1 && d.ativa) campos.conta_id = 'Esta conta está arquivada.';
  if (d.categoria_id) {
    const c = db.prepare('SELECT tipo FROM categorias WHERE id = ? AND excluida_em IS NULL').get(d.categoria_id);
    if (!c) campos.categoria_id = 'Categoria não encontrada.';
    else if (c.tipo !== d.tipo) campos.categoria_id = `Esta categoria não é de ${d.tipo}.`;
  }
  if (Object.keys(campos).length) throw invalido(campos);
}

/**
 * Remove (exclusão lógica) as ocorrências pendentes de hoje em diante. Não vira "pulada": elas voltam
 * a ser geradas se a recorrência continuar valendo. O que já venceu ou foi liquidado não é tocado.
 */
function removerFuturasPendentes(db, id, hoje, iso) {
  const alvos = db
    .prepare(
      `SELECT id FROM movimentacoes
        WHERE recorrencia_id = ? AND excluida_em IS NULL AND status = 'pendente' AND data_ocorrencia >= ?`,
    )
    .all(id, hoje);
  for (const { id: alvo } of alvos) {
    const antes = obterMovimentacao(db, alvo);
    db.prepare('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, alvo);
    auditar(db, { entidade: 'movimentacao', id: alvo, acao: 'excluir', antes });
  }
}

/** Marca como puladas as datas anteriores a hoje que não têm lançamento, para que não voltem a ser geradas. */
function pularOcorrenciasPassadas(db, r, id, hoje) {
  const existentes = new Set(
    db.prepare('SELECT data_ocorrencia FROM movimentacoes WHERE recorrencia_id = ? AND excluida_em IS NULL').all(id).map((l) => l.data_ocorrencia),
  );
  const pular = db.prepare('INSERT OR IGNORE INTO recorrencias_puladas (recorrencia_id, data_ocorrencia) VALUES (?, ?)');
  for (const data of ocorrenciasDaRecorrencia(r, somarDias(hoje, -1))) {
    if (!existentes.has(data)) pular.run(id, data);
  }
}

/** Cria as ocorrências que faltam de uma recorrência até `ate`. Idempotente: nada é criado duas vezes. */
function gerarDe(db, r, ate, iso) {
  const conta = db.prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL').get(r.conta_id);
  if (!conta || conta.arquivada === 1) return 0;
  const datas = ocorrenciasDaRecorrencia(r, ate);
  if (datas.length === 0) return 0;
  const existentes = new Set(
    db
      .prepare('SELECT data_ocorrencia FROM movimentacoes WHERE recorrencia_id = ? AND excluida_em IS NULL')
      .all(r.id)
      .map((l) => l.data_ocorrencia),
  );
  const puladas = new Set(
    db.prepare('SELECT data_ocorrencia FROM recorrencias_puladas WHERE recorrencia_id = ?').all(r.id).map((l) => l.data_ocorrencia),
  );
  let criadas = 0;
  for (const data of datas) {
    if (existentes.has(data) || puladas.has(data)) continue;
    inserirMovimentacaoAuditada(
      db,
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
export function gerarOcorrencias(db, { hoje, agora = new Date() }) {
  const ativas = db
    .prepare(`SELECT ${COLUNAS} FROM recorrencias WHERE excluida_em IS NULL AND ativa = 1`)
    .all()
    .map(paraApi);
  if (ativas.length === 0) return 0;
  const ate = somarDias(hoje, HORIZONTE_DE_GERACAO_DIAS);
  const iso = agora.toISOString();
  return db.transaction(() => ativas.reduce((total, r) => total + gerarDe(db, r, ate, iso), 0))();
}

export function criarRecorrencia(db, dados, { hoje, agora = new Date() }) {
  validar(db, dados);
  const iso = agora.toISOString();
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO recorrencias (tipo, descricao, valor_centavos, conta_id, categoria_id, frequencia,
           data_inicio, data_fim, ativa, assinatura, observacao, criada_em, atualizada_em)
         VALUES (@tipo, @descricao, @valor_centavos, @conta_id, @categoria_id, @frequencia,
           @data_inicio, @data_fim, @ativa, @assinatura, @observacao, @iso, @iso)`,
      )
      .run({
        ...dados,
        categoria_id: dados.categoria_id ?? null,
        data_fim: dados.data_fim ?? null,
        ativa: dados.ativa ? 1 : 0,
        assinatura: dados.assinatura ? 1 : 0,
        iso,
      });
    const id = Number(lastInsertRowid);
    const recorrencia = obterRecorrencia(db, id);
    auditar(db, { entidade: 'recorrencia', id, acao: 'criar', depois: recorrencia });
    if (recorrencia.ativa) gerarDe(db, recorrencia, somarDias(hoje, HORIZONTE_DE_GERACAO_DIAS), iso);
    return recorrencia;
  })();
}

/** Editar vale daqui para frente: as ocorrências pendentes futuras são refeitas; o passado fica como está. */
export function atualizarRecorrencia(db, id, dados, { hoje, agora = new Date() }) {
  const antes = obterRecorrencia(db, id);
  if (!antes) throw naoEncontrado('Recorrência');
  validar(db, dados);
  const iso = agora.toISOString();
  return db.transaction(() => {
    db.prepare(
      `UPDATE recorrencias SET tipo = @tipo, descricao = @descricao, valor_centavos = @valor_centavos,
         conta_id = @conta_id, categoria_id = @categoria_id, frequencia = @frequencia, data_inicio = @data_inicio,
         data_fim = @data_fim, ativa = @ativa, assinatura = @assinatura, observacao = @observacao,
         atualizada_em = @iso WHERE id = @id`,
    ).run({
      ...dados,
      id,
      categoria_id: dados.categoria_id ?? null,
      data_fim: dados.data_fim ?? null,
      ativa: dados.ativa ? 1 : 0,
      assinatura: dados.assinatura ? 1 : 0,
      iso,
    });
    // Reativar não recria as cobranças do período em que esteve pausada (RF-18): elas viram "puladas".
    if (!antes.ativa && dados.ativa) pularOcorrenciasPassadas(db, { ...antes, ...dados }, id, hoje);
    const depois = obterRecorrencia(db, id);
    auditar(db, { entidade: 'recorrencia', id, acao: 'editar', antes, depois });
    removerFuturasPendentes(db, id, hoje, iso);
    if (depois.ativa) gerarDe(db, depois, somarDias(hoje, HORIZONTE_DE_GERACAO_DIAS), iso);
    return depois;
  })();
}

export function excluirRecorrencia(db, id, { hoje, agora = new Date() }) {
  const antes = obterRecorrencia(db, id);
  if (!antes) throw naoEncontrado('Recorrência');
  const iso = agora.toISOString();
  db.transaction(() => {
    removerFuturasPendentes(db, id, hoje, iso);
    db.prepare('UPDATE recorrencias SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, id);
    auditar(db, { entidade: 'recorrencia', id, acao: 'excluir', antes });
  })();
}
