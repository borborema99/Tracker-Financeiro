import { formatarDinheiro } from '../../../contratos/dinheiro.js';
import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { estaAtrasada } from '../../dominio/compromisso.js';
import { encontrarDuplicadas } from '../../dominio/duplicidade.js';
import { normalizar, restanteReembolsavel, validarRegras } from '../../dominio/movimentacao.js';
import { totaisDaListagem } from '../../dominio/resumo.js';
import { auditar } from '../auditoria.js';

const COLUNAS = [
  'id', 'tipo', 'descricao', 'valor_centavos', 'conta_id', 'conta_destino_id', 'categoria_id',
  'data_competencia', 'data_vencimento', 'data_liquidacao', 'status', 'observacao',
  'transferencia_id', 'reembolso_de_id', 'recorrencia_id', 'data_ocorrencia', 'baixa_de_id',
  'criada_em', 'atualizada_em',
];
const SQL_COLUNAS = COLUNAS.join(', ');
const SQL_COLUNAS_M = COLUNAS.map((c) => `m.${c}`).join(', ');

const marcas = (n) => Array.from({ length: n }, () => '?').join(', ');

function emLotes(lista, tamanho = 500) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

function divisoesDe(db, ids) {
  const mapa = new Map();
  for (const lote of emLotes(ids)) {
    const linhas = db
      .prepare(
        `SELECT movimentacao_id, categoria_id, valor_centavos FROM movimentacao_divisoes
          WHERE movimentacao_id IN (${marcas(lote.length)}) ORDER BY id`,
      )
      .all(...lote);
    for (const l of linhas) {
      if (!mapa.has(l.movimentacao_id)) mapa.set(l.movimentacao_id, []);
      mapa.get(l.movimentacao_id).push({ categoria_id: l.categoria_id, valor_centavos: l.valor_centavos });
    }
  }
  return mapa;
}

function tarifasDe(db, idsTransferencias) {
  const mapa = new Map();
  for (const lote of emLotes(idsTransferencias)) {
    const linhas = db
      .prepare(
        `SELECT transferencia_id, valor_centavos FROM movimentacoes
          WHERE excluida_em IS NULL AND transferencia_id IN (${marcas(lote.length)})`,
      )
      .all(...lote);
    for (const l of linhas) mapa.set(l.transferencia_id, l.valor_centavos);
  }
  return mapa;
}

/** RF-05: quanto já foi reembolsado de cada despesa (reembolsos pendentes também contam). */
function reembolsadoDe(db, idsDespesas) {
  const mapa = new Map();
  for (const lote of emLotes(idsDespesas)) {
    const linhas = db
      .prepare(
        `SELECT reembolso_de_id, SUM(valor_centavos) AS total FROM movimentacoes
          WHERE excluida_em IS NULL AND reembolso_de_id IN (${marcas(lote.length)}) GROUP BY reembolso_de_id`,
      )
      .all(...lote);
    for (const l of linhas) mapa.set(l.reembolso_de_id, l.total);
  }
  return mapa;
}

/** Linhas do banco -> objetos da API (com divisões, a tarifa das transferências e o reembolsado das despesas). */
function montar(db, linhas) {
  const divisoes = divisoesDe(db, linhas.map((l) => l.id));
  const tarifas = tarifasDe(db, linhas.filter((l) => l.tipo === 'transferencia').map((l) => l.id));
  const reembolsos = reembolsadoDe(db, linhas.filter((l) => l.tipo === 'despesa').map((l) => l.id));
  return linhas.map((l) => ({
    ...l,
    divisoes: divisoes.get(l.id) ?? [],
    ...(l.tipo === 'transferencia' ? { tarifa_centavos: tarifas.get(l.id) ?? 0 } : {}),
    ...(l.tipo === 'despesa'
      ? {
          reembolsado_centavos: reembolsos.get(l.id) ?? 0,
          reembolsavel_centavos: restanteReembolsavel(l.valor_centavos, reembolsos.get(l.id) ?? 0),
        }
      : {}),
  }));
}

export function obterMovimentacao(db, id) {
  const linha = db.prepare(`SELECT ${SQL_COLUNAS} FROM movimentacoes WHERE id = ? AND excluida_em IS NULL`).get(id);
  return linha ? montar(db, [linha])[0] : null;
}

function validarReferencias(db, d, contasPermitidas = []) {
  const campos = {};
  const verConta = (id, campo) => {
    const c = db.prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL').get(id);
    if (!c) campos[campo] = 'Conta não encontrada.';
    else if (c.arquivada === 1 && !contasPermitidas.includes(id)) campos[campo] = 'Esta conta está arquivada.';
  };
  verConta(d.conta_id, 'conta_id');
  if (d.conta_destino_id) verConta(d.conta_destino_id, 'conta_destino_id');

  const verCategoria = (id, campo) => {
    const c = db.prepare('SELECT tipo FROM categorias WHERE id = ? AND excluida_em IS NULL').get(id);
    if (!c) campos[campo] = 'Categoria não encontrada.';
    else if (c.tipo !== d.tipo) campos[campo] = `Esta categoria não é de ${d.tipo}.`;
  };
  if (d.categoria_id) verCategoria(d.categoria_id, 'categoria_id');
  for (const p of d.divisoes) verCategoria(p.categoria_id, 'divisoes');

  if (Object.keys(campos).length) throw invalido(campos);
}

/** RF-05: o reembolso é uma receita ligada a uma despesa e nunca passa do que resta dela. */
function validarReembolso(db, d, idAtual = null) {
  if (!d.reembolso_de_id) return;
  const original = db
    .prepare(
      `SELECT id, tipo, valor_centavos, transferencia_id FROM movimentacoes
        WHERE id = ? AND excluida_em IS NULL`,
    )
    .get(d.reembolso_de_id);
  if (!original || original.tipo !== 'despesa' || original.transferencia_id != null) {
    throw invalido({ reembolso_de_id: 'Escolha uma despesa para reembolsar.' });
  }
  const ja = db
    .prepare(
      `SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM movimentacoes
        WHERE excluida_em IS NULL AND reembolso_de_id = ? AND id <> ?`,
    )
    .get(original.id, idAtual ?? -1).soma;
  const restante = restanteReembolsavel(original.valor_centavos, ja);
  if (d.valor_centavos > restante) {
    throw invalido({
      valor_centavos: `O reembolso passa do que resta da despesa original (${formatarDinheiro(restante)}).`,
    });
  }
}

const reembolsosAtivos = (db, id) =>
  db
    .prepare(
      `SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM movimentacoes
        WHERE excluida_em IS NULL AND reembolso_de_id = ?`,
    )
    .get(id).soma;

function inserirLinha(db, d, iso, transferenciaId = null) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO movimentacoes (tipo, descricao, valor_centavos, conta_id, conta_destino_id, categoria_id,
         data_competencia, data_vencimento, data_liquidacao, status, observacao, transferencia_id,
         reembolso_de_id, recorrencia_id, data_ocorrencia, baixa_de_id, criada_em, atualizada_em)
       VALUES (@tipo, @descricao, @valor_centavos, @conta_id, @conta_destino_id, @categoria_id,
         @data_competencia, @data_vencimento, @data_liquidacao, @status, @observacao, @transferencia_id,
         @reembolso_de_id, @recorrencia_id, @data_ocorrencia, @baixa_de_id, @iso, @iso)`,
    )
    .run({
      tipo: d.tipo,
      descricao: d.descricao,
      valor_centavos: d.valor_centavos,
      conta_id: d.conta_id,
      conta_destino_id: d.conta_destino_id ?? null,
      categoria_id: d.categoria_id ?? null,
      data_competencia: d.data_competencia,
      data_vencimento: d.data_vencimento ?? null,
      data_liquidacao: d.data_liquidacao ?? null,
      status: d.status,
      observacao: d.observacao ?? '',
      transferencia_id: transferenciaId,
      reembolso_de_id: d.reembolso_de_id ?? null,
      recorrencia_id: d.recorrencia_id ?? null,
      data_ocorrencia: d.data_ocorrencia ?? null,
      baixa_de_id: d.baixa_de_id ?? null,
      iso,
    });
  return Number(lastInsertRowid);
}

/** Uso interno dos repositórios de compromissos: grava uma linha e a auditoria, dentro da transação do chamador. */
export function inserirMovimentacaoAuditada(db, dados, iso) {
  const id = inserirLinha(db, dados, iso);
  auditar(db, { entidade: 'movimentacao', id, acao: 'criar', depois: obterMovimentacao(db, id) });
  return id;
}

function gravarDivisoes(db, id, divisoes) {
  db.prepare('DELETE FROM movimentacao_divisoes WHERE movimentacao_id = ?').run(id);
  const inserir = db.prepare(
    'INSERT INTO movimentacao_divisoes (movimentacao_id, categoria_id, valor_centavos) VALUES (?, ?, ?)',
  );
  for (const p of divisoes) inserir.run(id, p.categoria_id, p.valor_centavos);
}

const descricaoDaTarifa = (pai) => `Tarifa: ${pai.descricao || 'transferência'}`.slice(0, 200);

function criarTarifa(db, pai, valor, iso) {
  const categoria = db.prepare("SELECT id FROM categorias WHERE papel = 'tarifa' AND excluida_em IS NULL").get();
  const id = inserirLinha(
    db,
    {
      tipo: 'despesa',
      descricao: descricaoDaTarifa(pai),
      valor_centavos: valor,
      conta_id: pai.conta_id,
      categoria_id: categoria?.id ?? null,
      data_competencia: pai.data_competencia,
      data_vencimento: pai.data_vencimento,
      data_liquidacao: pai.data_liquidacao,
      status: pai.status,
    },
    iso,
    pai.id,
  );
  auditar(db, { entidade: 'movimentacao', id, acao: 'criar', depois: obterMovimentacao(db, id) });
}

/** Mantém a tarifa (despesa vinculada) igual à transferência: cria, atualiza ou exclui junto. */
function sincronizarTarifa(db, pai, valor, iso) {
  const filha = db
    .prepare('SELECT id FROM movimentacoes WHERE transferencia_id = ? AND excluida_em IS NULL')
    .get(pai.id);
  if (!filha) {
    if (valor > 0) criarTarifa(db, pai, valor, iso);
    return;
  }
  const antes = obterMovimentacao(db, filha.id);
  if (valor === 0) {
    db.prepare('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, filha.id);
    auditar(db, { entidade: 'movimentacao', id: filha.id, acao: 'excluir', antes });
    return;
  }
  db.prepare(
    `UPDATE movimentacoes SET valor_centavos = ?, conta_id = ?, descricao = ?, data_competencia = ?,
       data_vencimento = ?, data_liquidacao = ?, status = ?, atualizada_em = ? WHERE id = ?`,
  ).run(valor, pai.conta_id, descricaoDaTarifa(pai), pai.data_competencia, pai.data_vencimento, pai.data_liquidacao, pai.status, iso, filha.id);
  const depois = obterMovimentacao(db, filha.id);
  if (JSON.stringify({ ...antes, atualizada_em: 0 }) !== JSON.stringify({ ...depois, atualizada_em: 0 })) {
    auditar(db, { entidade: 'movimentacao', id: filha.id, acao: 'editar', antes, depois });
  }
}

/** RF-09: avisa (sem bloquear) se já existe lançamento com mesmo valor, data, conta e descrição. */
function avisosDeDuplicidade(db, m) {
  const candidatos = db
    .prepare(
      `SELECT ${SQL_COLUNAS} FROM movimentacoes
        WHERE excluida_em IS NULL AND tipo = ? AND valor_centavos = ? AND data_competencia = ? AND conta_id = ?`,
    )
    .all(m.tipo, m.valor_centavos, m.data_competencia, m.conta_id);
  const iguais = encontrarDuplicadas(m, candidatos);
  if (iguais.length === 0) return [];
  return [
    {
      codigo: 'possivel_duplicidade',
      mensagem: 'Já existe lançamento com o mesmo valor, data, conta e descrição. Conferir se não é repetido.',
      ids: iguais.map((i) => i.id),
    },
  ];
}

function exigirValido(dados) {
  const campos = validarRegras(dados);
  if (Object.keys(campos).length) throw invalido(campos);
}

export function criarMovimentacao(db, dados, { hoje, agora = new Date() }) {
  exigirValido(dados);
  return db.transaction(() => {
    const d = normalizar(dados, hoje);
    validarReferencias(db, d);
    validarReembolso(db, d);
    const iso = agora.toISOString();
    const id = inserirLinha(db, d, iso);
    gravarDivisoes(db, id, d.divisoes);
    if (d.tipo === 'transferencia' && d.tarifa_centavos > 0) {
      criarTarifa(db, { ...d, id }, d.tarifa_centavos, iso);
    }
    const depois = obterMovimentacao(db, id);
    auditar(db, { entidade: 'movimentacao', id, acao: 'criar', depois });
    return { movimentacao: depois, avisos: avisosDeDuplicidade(db, depois) };
  })();
}

function exigirIndependente(m) {
  if (m.transferencia_id != null) {
    throw conflito('Esta é a tarifa de uma transferência. Altere ou exclua pela transferência.');
  }
}

export function atualizarMovimentacao(db, id, dados, { hoje, agora = new Date() }) {
  const antes = obterMovimentacao(db, id);
  if (!antes) throw naoEncontrado('Lançamento');
  exigirIndependente(antes);
  if ((antes.tipo === 'transferencia') !== (dados.tipo === 'transferencia')) {
    throw conflito('Não dá para transformar transferência em receita/despesa (nem o contrário). Exclua e lance de novo.');
  }
  exigirValido(dados);
  if (antes.tipo === 'despesa') {
    // RF-05/RF-08: a despesa com reembolso ligado não pode virar outra coisa nem ficar menor que ele.
    const reembolsado = reembolsosAtivos(db, id);
    if (reembolsado > 0 && (dados.tipo !== 'despesa' || dados.valor_centavos < reembolsado)) {
      throw conflito(
        `Esta despesa tem ${formatarDinheiro(reembolsado)} de reembolso ligado. Ajuste ou exclua o reembolso antes.`,
      );
    }
  }
  return db.transaction(() => {
    const d = normalizar(dados, hoje);
    validarReferencias(db, d, [antes.conta_id, antes.conta_destino_id].filter(Boolean));
    validarReembolso(db, d, id);
    const iso = agora.toISOString();
    db.prepare(
      `UPDATE movimentacoes SET tipo = @tipo, descricao = @descricao, valor_centavos = @valor_centavos,
         conta_id = @conta_id, conta_destino_id = @conta_destino_id, categoria_id = @categoria_id,
         data_competencia = @data_competencia, data_vencimento = @data_vencimento,
         data_liquidacao = @data_liquidacao, status = @status, observacao = @observacao,
         reembolso_de_id = @reembolso_de_id, atualizada_em = @iso WHERE id = @id`,
    ).run({
      id,
      iso,
      reembolso_de_id: d.reembolso_de_id,
      tipo: d.tipo,
      descricao: d.descricao,
      valor_centavos: d.valor_centavos,
      conta_id: d.conta_id,
      conta_destino_id: d.conta_destino_id,
      categoria_id: d.categoria_id,
      data_competencia: d.data_competencia,
      data_vencimento: d.data_vencimento,
      data_liquidacao: d.data_liquidacao,
      status: d.status,
      observacao: d.observacao,
    });
    gravarDivisoes(db, id, d.divisoes);
    if (d.tipo === 'transferencia') sincronizarTarifa(db, { ...d, id }, d.tarifa_centavos, iso);
    const depois = obterMovimentacao(db, id);
    auditar(db, { entidade: 'movimentacao', id, acao: 'editar', antes, depois });
    return { movimentacao: depois, avisos: avisosDeDuplicidade(db, depois) };
  })();
}

function idsFilhas(db, id) {
  return db
    .prepare('SELECT id FROM movimentacoes WHERE transferencia_id = ? AND excluida_em IS NULL')
    .all(id)
    .map((l) => l.id);
}

/** Exclusão lógica. A tarifa vinculada sai junto: nada fica órfão (RF-08). */
export function excluirMovimentacao(db, id, { agora = new Date() } = {}) {
  const atual = obterMovimentacao(db, id);
  if (!atual) throw naoEncontrado('Lançamento');
  exigirIndependente(atual);
  if (reembolsosAtivos(db, id) > 0) {
    throw conflito('Esta despesa tem reembolso ligado. Exclua o reembolso primeiro.');
  }
  const iso = agora.toISOString();
  db.transaction(() => {
    for (const alvo of [id, ...idsFilhas(db, id)]) {
      const antes = obterMovimentacao(db, alvo);
      db.prepare('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, alvo);
      // Ocorrência de recorrência apagada pelo dono não volta a ser gerada.
      if (antes.recorrencia_id) {
        db.prepare('INSERT OR IGNORE INTO recorrencias_puladas (recorrencia_id, data_ocorrencia) VALUES (?, ?)').run(
          antes.recorrencia_id,
          antes.data_ocorrencia,
        );
      }
      auditar(db, { entidade: 'movimentacao', id: alvo, acao: 'excluir', antes });
    }
  })();
}

/** Compromisso = receita/despesa pendente, sem tarifa, divisão nem reembolso ligado (esses não se partem). */
function exigirCompromissoPendente(db, id) {
  const atual = obterMovimentacao(db, id);
  if (!atual || atual.tipo === 'transferencia') throw naoEncontrado('Compromisso');
  exigirIndependente(atual);
  if (atual.status !== 'pendente') throw conflito('Este lançamento já foi liquidado.');
  return atual;
}

/**
 * Baixa parcial (pagamento ou recebimento de parte do valor). O lançamento original vira liquidado pelo valor
 * baixado e o restante nasce como novo pendente, ligado ao original por `baixa_de_id` e com o mesmo vencimento.
 * Baixa do valor inteiro é a liquidação comum.
 */
export function baixarParcial(db, id, { valor_centavos: valor, data_liquidacao: data }, { hoje, agora = new Date() }) {
  const atual = exigirCompromissoPendente(db, id);
  if (valor > atual.valor_centavos) {
    throw invalido({ valor_centavos: `O valor passa do que falta (${formatarDinheiro(atual.valor_centavos)}).` });
  }
  if (valor === atual.valor_centavos) return { liquidada: liquidarMovimentacao(db, id, data ?? null, { hoje, agora }), restante: null };
  if (atual.divisoes.length > 0) {
    throw conflito('Lançamento dividido entre categorias não aceita baixa parcial. Baixe o valor inteiro.');
  }
  if (atual.tipo === 'despesa' && atual.reembolsado_centavos > 0) {
    throw conflito('Esta despesa tem reembolso ligado e não aceita baixa parcial.');
  }
  const dia = data ?? hoje;
  if (dia > hoje) throw invalido({ data_liquidacao: 'A baixa não pode ter data futura.' });
  const iso = agora.toISOString();
  return db.transaction(() => {
    db.prepare(
      `UPDATE movimentacoes SET valor_centavos = ?, status = 'liquidada', data_liquidacao = ?, atualizada_em = ?
        WHERE id = ?`,
    ).run(valor, dia, iso, id);
    const restanteId = inserirLinha(
      db,
      { ...atual, valor_centavos: atual.valor_centavos - valor, baixa_de_id: id, recorrencia_id: null, data_ocorrencia: null },
      iso,
    );
    const liquidada = obterMovimentacao(db, id);
    const restante = obterMovimentacao(db, restanteId);
    auditar(db, { entidade: 'movimentacao', id, acao: 'editar', antes: atual, depois: liquidada });
    auditar(db, { entidade: 'movimentacao', id: restanteId, acao: 'criar', depois: restante });
    return { liquidada, restante };
  })();
}

/** Muda só o vencimento de um compromisso pendente (a competência e a ocorrência continuam como estavam). */
export function reagendar(db, id, { data_vencimento: vencimento }, { agora = new Date() }) {
  const antes = exigirCompromissoPendente(db, id);
  if (antes.data_vencimento === vencimento) return antes;
  const iso = agora.toISOString();
  return db.transaction(() => {
    db.prepare('UPDATE movimentacoes SET data_vencimento = ?, atualizada_em = ? WHERE id = ?').run(vencimento, iso, id);
    const depois = obterMovimentacao(db, id);
    auditar(db, { entidade: 'movimentacao', id, acao: 'editar', antes, depois });
    return depois;
  })();
}

function mudarStatus(db, id, status, data, { agora = new Date() }) {
  const atual = obterMovimentacao(db, id);
  if (!atual) throw naoEncontrado('Lançamento');
  exigirIndependente(atual);
  if (atual.status === status) {
    throw conflito(status === 'liquidada' ? 'Este lançamento já está liquidado.' : 'Este lançamento já está pendente.');
  }
  const iso = agora.toISOString();
  db.transaction(() => {
    for (const alvo of [id, ...idsFilhas(db, id)]) {
      const antes = obterMovimentacao(db, alvo);
      db.prepare('UPDATE movimentacoes SET status = ?, data_liquidacao = ?, atualizada_em = ? WHERE id = ?').run(
        status,
        data,
        iso,
        alvo,
      );
      auditar(db, { entidade: 'movimentacao', id: alvo, acao: 'editar', antes, depois: obterMovimentacao(db, alvo) });
    }
  })();
  return obterMovimentacao(db, id);
}

export const liquidarMovimentacao = (db, id, dataLiquidacao, ctx) =>
  mudarStatus(db, id, 'liquidada', dataLiquidacao ?? ctx.hoje, ctx);

export const reabrirMovimentacao = (db, id, ctx) => mudarStatus(db, id, 'pendente', null, ctx);

/** `hoje` (opcional) marca os itens pendentes com vencimento passado como `atrasada` (RF-07: calculado, não gravado). */
export function listarMovimentacoes(db, f, hoje = null) {
  const onde = ['m.excluida_em IS NULL'];
  const p = [];

  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
    onde.push("(m.descricao LIKE ? ESCAPE '\\' OR m.observacao LIKE ? ESCAPE '\\')");
    p.push(like, like);
  }
  if (f.tipo) { onde.push('m.tipo = ?'); p.push(f.tipo); }
  if (f.status) { onde.push('m.status = ?'); p.push(f.status); }
  if (f.conta_id) { onde.push('(m.conta_id = ? OR m.conta_destino_id = ?)'); p.push(f.conta_id, f.conta_id); }

  let idsCategoria = null;
  if (f.categoria_id) {
    idsCategoria = db
      .prepare('SELECT id FROM categorias WHERE (id = ? OR pai_id = ?) AND excluida_em IS NULL')
      .all(f.categoria_id, f.categoria_id)
      .map((r) => r.id);
    if (idsCategoria.length === 0) idsCategoria = [-1];
    const m = marcas(idsCategoria.length);
    onde.push(
      `(m.categoria_id IN (${m}) OR EXISTS (SELECT 1 FROM movimentacao_divisoes d
         WHERE d.movimentacao_id = m.id AND d.categoria_id IN (${m})))`,
    );
    p.push(...idsCategoria, ...idsCategoria);
  }

  const coluna = { competencia: 'm.data_competencia', vencimento: 'm.data_vencimento', liquidacao: 'm.data_liquidacao' }[f.campo_data];
  if (f.de) { onde.push(`${coluna} >= ?`); p.push(f.de); }
  if (f.ate) { onde.push(`${coluna} <= ?`); p.push(f.ate); }
  if (f.valor_min != null) { onde.push('m.valor_centavos >= ?'); p.push(f.valor_min); }
  if (f.valor_max != null) { onde.push('m.valor_centavos <= ?'); p.push(f.valor_max); }

  const ordem = {
    data: 'm.data_competencia',
    valor: 'm.valor_centavos',
    descricao: 'm.descricao COLLATE NOCASE',
    criada: 'm.criada_em',
  }[f.ordenar];
  const direcao = f.direcao === 'asc' ? 'ASC' : 'DESC';
  const where = onde.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS n FROM movimentacoes m WHERE ${where}`).get(...p).n;
  const linhas = db
    .prepare(
      `SELECT ${SQL_COLUNAS_M} FROM movimentacoes m WHERE ${where}
        ORDER BY ${ordem} ${direcao}, m.id ${direcao} LIMIT ? OFFSET ?`,
    )
    .all(...p, f.por_pagina, (f.pagina - 1) * f.por_pagina);

  // Totais do conjunto filtrado, pelas duas visões separadas (RF-02). Com filtro de categoria,
  // movimentações divididas contam só a parte da categoria filtrada.
  const todas = db
    .prepare(
      `SELECT m.id, m.tipo, m.valor_centavos, m.status, m.data_competencia, m.data_vencimento, m.data_liquidacao
         FROM movimentacoes m WHERE ${where}`,
    )
    .all(...p);
  if (idsCategoria) {
    const divisoes = divisoesDe(db, todas.map((t) => t.id));
    for (const t of todas) {
      const partes = divisoes.get(t.id);
      if (partes) {
        t.valor_efetivo = partes
          .filter((x) => idsCategoria.includes(x.categoria_id))
          .reduce((soma, x) => soma + x.valor_centavos, 0);
      }
    }
  }

  return {
    itens: montar(db, linhas).map((m) => (hoje ? { ...m, atrasada: estaAtrasada(m, hoje) } : m)),
    total,
    pagina: f.pagina,
    por_pagina: f.por_pagina,
    totais: totaisDaListagem(todas),
  };
}

/** Movimentações que entram em qualquer das duas visões do período (para o resumo). */
export function movimentacoesDoPeriodo(db, de, ate) {
  return db
    .prepare(
      `SELECT tipo, valor_centavos, status, data_competencia, data_vencimento, data_liquidacao
         FROM movimentacoes
        WHERE excluida_em IS NULL
          AND ((status = 'liquidada' AND data_liquidacao BETWEEN ? AND ?)
            OR (status = 'pendente' AND COALESCE(data_vencimento, data_competencia) BETWEEN ? AND ?))`,
    )
    .all(de, ate, de, ate);
}

/** Histórico de alterações de um lançamento, do mais antigo ao mais novo (valor antes e depois). */
export function historicoDaMovimentacao(db, id) {
  const linhas = db
    .prepare(
      `SELECT id, acao, antes, depois, criado_em FROM audit_log
        WHERE entidade = 'movimentacao' AND entidade_id = ? ORDER BY id`,
    )
    .all(String(id));
  if (linhas.length === 0) throw naoEncontrado('Lançamento');
  return linhas.map((l) => ({
    id: l.id,
    acao: l.acao,
    criado_em: l.criado_em,
    antes: l.antes ? JSON.parse(l.antes) : null,
    depois: l.depois ? JSON.parse(l.depois) : null,
  }));
}
