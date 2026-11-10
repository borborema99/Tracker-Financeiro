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
  'divida_id', 'divida_parcela', 'criada_em', 'atualizada_em',
];
const SQL_COLUNAS = COLUNAS.join(', ');
const SQL_COLUNAS_M = COLUNAS.map((c) => `m.${c}`).join(', ');

const marcas = (n) => Array.from({ length: n }, () => '?').join(', ');

function emLotes(lista, tamanho = 500) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

async function divisoesDe(esc, ids) {
  const mapa = new Map();
  for (const lote of emLotes(ids)) {
    const linhas = await esc.todos(
      `SELECT movimentacao_id, categoria_id, valor_centavos FROM movimentacao_divisoes
        WHERE usuario_id = :u AND movimentacao_id IN (${marcas(lote.length)}) ORDER BY id`,
      lote,
    );
    for (const l of linhas) {
      if (!mapa.has(l.movimentacao_id)) mapa.set(l.movimentacao_id, []);
      mapa.get(l.movimentacao_id).push({ categoria_id: l.categoria_id, valor_centavos: l.valor_centavos });
    }
  }
  return mapa;
}

async function tarifasDe(esc, idsTransferencias) {
  const mapa = new Map();
  for (const lote of emLotes(idsTransferencias)) {
    const linhas = await esc.todos(
      `SELECT transferencia_id, valor_centavos FROM movimentacoes
        WHERE usuario_id = :u AND excluida_em IS NULL AND transferencia_id IN (${marcas(lote.length)})`,
      lote,
    );
    for (const l of linhas) mapa.set(l.transferencia_id, l.valor_centavos);
  }
  return mapa;
}

/** RF-05: quanto já foi reembolsado de cada despesa (reembolsos pendentes também contam). */
async function reembolsadoDe(esc, idsDespesas) {
  const mapa = new Map();
  for (const lote of emLotes(idsDespesas)) {
    const linhas = await esc.todos(
      `SELECT reembolso_de_id, SUM(valor_centavos) AS total FROM movimentacoes
        WHERE usuario_id = :u AND excluida_em IS NULL AND reembolso_de_id IN (${marcas(lote.length)})
        GROUP BY reembolso_de_id`,
      lote,
    );
    for (const l of linhas) mapa.set(l.reembolso_de_id, l.total);
  }
  return mapa;
}

/** Linhas do banco -> objetos da API (com divisões, a tarifa das transferências e o reembolsado das despesas). */
async function montar(esc, linhas) {
  const divisoes = await divisoesDe(esc, linhas.map((l) => l.id));
  const tarifas = await tarifasDe(esc, linhas.filter((l) => l.tipo === 'transferencia').map((l) => l.id));
  const reembolsos = await reembolsadoDe(esc, linhas.filter((l) => l.tipo === 'despesa').map((l) => l.id));
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

export async function obterMovimentacao(esc, id) {
  const linha = await esc.um(
    `SELECT ${SQL_COLUNAS} FROM movimentacoes WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL`,
    [id],
  );
  return linha ? (await montar(esc, [linha]))[0] : null;
}

async function validarReferencias(esc, d, contasPermitidas = []) {
  const campos = {};
  const verConta = async (id, campo) => {
    const c = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [id]);
    if (!c) campos[campo] = 'Conta não encontrada.';
    else if (c.arquivada && !contasPermitidas.includes(id)) campos[campo] = 'Esta conta está arquivada.';
  };
  await verConta(d.conta_id, 'conta_id');
  if (d.conta_destino_id) await verConta(d.conta_destino_id, 'conta_destino_id');

  const verCategoria = async (id, campo) => {
    const c = await esc.um('SELECT tipo FROM categorias WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [id]);
    if (!c) campos[campo] = 'Categoria não encontrada.';
    else if (c.tipo !== d.tipo) campos[campo] = `Esta categoria não é de ${d.tipo}.`;
  };
  if (d.categoria_id) await verCategoria(d.categoria_id, 'categoria_id');
  for (const p of d.divisoes) await verCategoria(p.categoria_id, 'divisoes');

  if (Object.keys(campos).length) throw invalido(campos);
}

/** RF-05: o reembolso é uma receita ligada a uma despesa e nunca passa do que resta dela. */
async function validarReembolso(esc, d, idAtual = null) {
  if (!d.reembolso_de_id) return;
  const original = await esc.um(
    `SELECT id, tipo, valor_centavos, transferencia_id FROM movimentacoes
      WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL`,
    [d.reembolso_de_id],
  );
  if (!original || original.tipo !== 'despesa' || original.transferencia_id != null) {
    throw invalido({ reembolso_de_id: 'Escolha uma despesa para reembolsar.' });
  }
  const { soma: ja } = await esc.um(
    `SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM movimentacoes
      WHERE usuario_id = :u AND excluida_em IS NULL AND reembolso_de_id = ? AND id <> ?`,
    [original.id, idAtual ?? -1],
  );
  const restante = restanteReembolsavel(original.valor_centavos, ja);
  if (d.valor_centavos > restante) {
    throw invalido({
      valor_centavos: `O reembolso passa do que resta da despesa original (${formatarDinheiro(restante)}).`,
    });
  }
}

const reembolsosAtivos = async (esc, id) =>
  (
    await esc.um(
      `SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM movimentacoes
        WHERE usuario_id = :u AND excluida_em IS NULL AND reembolso_de_id = ?`,
      [id],
    )
  ).soma;

async function inserirLinha(esc, d, iso, transferenciaId = null) {
  const [{ id }] = await esc.rodar(
    `INSERT INTO movimentacoes (usuario_id, tipo, descricao, valor_centavos, conta_id, conta_destino_id, categoria_id,
       data_competencia, data_vencimento, data_liquidacao, status, observacao, transferencia_id,
       reembolso_de_id, recorrencia_id, data_ocorrencia, baixa_de_id, divida_id, divida_parcela,
       criada_em, atualizada_em)
     VALUES (:u, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      d.tipo,
      d.descricao,
      d.valor_centavos,
      d.conta_id,
      d.conta_destino_id ?? null,
      d.categoria_id ?? null,
      d.data_competencia,
      d.data_vencimento ?? null,
      d.data_liquidacao ?? null,
      d.status,
      d.observacao ?? '',
      transferenciaId,
      d.reembolso_de_id ?? null,
      d.recorrencia_id ?? null,
      d.data_ocorrencia ?? null,
      d.baixa_de_id ?? null,
      d.divida_id ?? null,
      d.divida_parcela ?? null,
      iso,
      iso,
    ],
  );
  return id;
}

/** Uso interno dos repositórios de compromissos: grava uma linha e a auditoria, dentro da transação do chamador. */
export async function inserirMovimentacaoAuditada(esc, dados, iso) {
  const id = await inserirLinha(esc, dados, iso);
  await auditar(esc, { entidade: 'movimentacao', id, acao: 'criar', depois: await obterMovimentacao(esc, id) });
  return id;
}

async function gravarDivisoes(esc, id, divisoes) {
  await esc.rodar('DELETE FROM movimentacao_divisoes WHERE usuario_id = :u AND movimentacao_id = ?', [id]);
  for (const p of divisoes) {
    await esc.rodar(
      'INSERT INTO movimentacao_divisoes (usuario_id, movimentacao_id, categoria_id, valor_centavos) VALUES (:u, ?, ?, ?)',
      [id, p.categoria_id, p.valor_centavos],
    );
  }
}

const descricaoDaTarifa = (pai) => `Tarifa: ${pai.descricao || 'transferência'}`.slice(0, 200);

async function criarTarifa(esc, pai, valor, iso) {
  const categoria = await esc.um("SELECT id FROM categorias WHERE usuario_id = :u AND papel = 'tarifa' AND excluida_em IS NULL");
  const id = await inserirLinha(
    esc,
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
  await auditar(esc, { entidade: 'movimentacao', id, acao: 'criar', depois: await obterMovimentacao(esc, id) });
}

/** Mantém a tarifa (despesa vinculada) igual à transferência: cria, atualiza ou exclui junto. */
async function sincronizarTarifa(esc, pai, valor, iso) {
  const filha = await esc.um('SELECT id FROM movimentacoes WHERE usuario_id = :u AND transferencia_id = ? AND excluida_em IS NULL', [pai.id]);
  if (!filha) {
    if (valor > 0) await criarTarifa(esc, pai, valor, iso);
    return;
  }
  const antes = await obterMovimentacao(esc, filha.id);
  if (valor === 0) {
    await esc.rodar('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, filha.id]);
    await auditar(esc, { entidade: 'movimentacao', id: filha.id, acao: 'excluir', antes });
    return;
  }
  await esc.rodar(
    `UPDATE movimentacoes SET valor_centavos = ?, conta_id = ?, descricao = ?, data_competencia = ?,
       data_vencimento = ?, data_liquidacao = ?, status = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?`,
    [valor, pai.conta_id, descricaoDaTarifa(pai), pai.data_competencia, pai.data_vencimento, pai.data_liquidacao, pai.status, iso, filha.id],
  );
  const depois = await obterMovimentacao(esc, filha.id);
  if (JSON.stringify({ ...antes, atualizada_em: 0 }) !== JSON.stringify({ ...depois, atualizada_em: 0 })) {
    await auditar(esc, { entidade: 'movimentacao', id: filha.id, acao: 'editar', antes, depois });
  }
}

/** RF-09: avisa (sem bloquear) se já existe lançamento com mesmo valor, data, conta e descrição. */
async function avisosDeDuplicidade(esc, m) {
  const candidatos = await esc.todos(
    `SELECT ${SQL_COLUNAS} FROM movimentacoes
      WHERE usuario_id = :u AND excluida_em IS NULL AND tipo = ? AND valor_centavos = ? AND data_competencia = ? AND conta_id = ?`,
    [m.tipo, m.valor_centavos, m.data_competencia, m.conta_id],
  );
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

export async function criarMovimentacao(esc, dados, { hoje, agora = new Date() }) {
  exigirValido(dados);
  return esc.transacao(async (tx) => {
    const d = normalizar(dados, hoje);
    await validarReferencias(tx, d);
    await validarReembolso(tx, d);
    const iso = agora.toISOString();
    const id = await inserirLinha(tx, d, iso);
    await gravarDivisoes(tx, id, d.divisoes);
    if (d.tipo === 'transferencia' && d.tarifa_centavos > 0) {
      await criarTarifa(tx, { ...d, id }, d.tarifa_centavos, iso);
    }
    const depois = await obterMovimentacao(tx, id);
    await auditar(tx, { entidade: 'movimentacao', id, acao: 'criar', depois });
    return { movimentacao: depois, avisos: await avisosDeDuplicidade(tx, depois) };
  });
}

function exigirIndependente(m) {
  if (m.transferencia_id != null) {
    throw conflito('Esta é a tarifa de uma transferência. Altere ou exclua pela transferência.');
  }
}

export async function atualizarMovimentacao(esc, id, dados, { hoje, agora = new Date() }) {
  const antes = await obterMovimentacao(esc, id);
  if (!antes) throw naoEncontrado('Lançamento');
  exigirIndependente(antes);
  if ((antes.tipo === 'transferencia') !== (dados.tipo === 'transferencia')) {
    throw conflito('Não dá para transformar transferência em receita/despesa (nem o contrário). Exclua e lance de novo.');
  }
  exigirValido(dados);
  if (antes.tipo === 'despesa') {
    // RF-05/RF-08: a despesa com reembolso ligado não pode virar outra coisa nem ficar menor que ele.
    const reembolsado = await reembolsosAtivos(esc, id);
    if (reembolsado > 0 && (dados.tipo !== 'despesa' || dados.valor_centavos < reembolsado)) {
      throw conflito(
        `Esta despesa tem ${formatarDinheiro(reembolsado)} de reembolso ligado. Ajuste ou exclua o reembolso antes.`,
      );
    }
  }
  return esc.transacao(async (tx) => {
    const d = normalizar(dados, hoje);
    await validarReferencias(tx, d, [antes.conta_id, antes.conta_destino_id].filter(Boolean));
    await validarReembolso(tx, d, id);
    const iso = agora.toISOString();
    await tx.rodar(
      `UPDATE movimentacoes SET tipo = ?, descricao = ?, valor_centavos = ?,
         conta_id = ?, conta_destino_id = ?, categoria_id = ?,
         data_competencia = ?, data_vencimento = ?,
         data_liquidacao = ?, status = ?, observacao = ?,
         reembolso_de_id = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?`,
      [
        d.tipo,
        d.descricao,
        d.valor_centavos,
        d.conta_id,
        d.conta_destino_id,
        d.categoria_id,
        d.data_competencia,
        d.data_vencimento,
        d.data_liquidacao,
        d.status,
        d.observacao,
        d.reembolso_de_id,
        iso,
        id,
      ],
    );
    await gravarDivisoes(tx, id, d.divisoes);
    if (d.tipo === 'transferencia') await sincronizarTarifa(tx, { ...d, id }, d.tarifa_centavos, iso);
    const depois = await obterMovimentacao(tx, id);
    await auditar(tx, { entidade: 'movimentacao', id, acao: 'editar', antes, depois });
    return { movimentacao: depois, avisos: await avisosDeDuplicidade(tx, depois) };
  });
}

async function idsFilhas(esc, id) {
  const linhas = await esc.todos('SELECT id FROM movimentacoes WHERE usuario_id = :u AND transferencia_id = ? AND excluida_em IS NULL', [id]);
  return linhas.map((l) => l.id);
}

/** Exclusão lógica. A tarifa vinculada sai junto: nada fica órfão (RF-08). */
export async function excluirMovimentacao(esc, id, { agora = new Date() } = {}) {
  const atual = await obterMovimentacao(esc, id);
  if (!atual) throw naoEncontrado('Lançamento');
  exigirIndependente(atual);
  if ((await reembolsosAtivos(esc, id)) > 0) {
    throw conflito('Esta despesa tem reembolso ligado. Exclua o reembolso primeiro.');
  }
  const iso = agora.toISOString();
  await esc.transacao(async (tx) => {
    for (const alvo of [id, ...(await idsFilhas(tx, id))]) {
      const antes = await obterMovimentacao(tx, alvo);
      await tx.rodar('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, alvo]);
      // Ocorrência de recorrência apagada pelo dono não volta a ser gerada.
      if (antes.recorrencia_id) {
        await tx.rodar(
          `INSERT INTO recorrencias_puladas (usuario_id, recorrencia_id, data_ocorrencia) VALUES (:u, ?, ?)
           ON CONFLICT DO NOTHING`,
          [antes.recorrencia_id, antes.data_ocorrencia],
        );
      }
      await auditar(tx, { entidade: 'movimentacao', id: alvo, acao: 'excluir', antes });
    }
  });
}

/** Compromisso = receita/despesa pendente, sem tarifa, divisão nem reembolso ligado (esses não se partem). */
async function exigirCompromissoPendente(esc, id) {
  const atual = await obterMovimentacao(esc, id);
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
export async function baixarParcial(esc, id, { valor_centavos: valor, data_liquidacao: data }, { hoje, agora = new Date() }) {
  const atual = await exigirCompromissoPendente(esc, id);
  if (valor > atual.valor_centavos) {
    throw invalido({ valor_centavos: `O valor passa do que falta (${formatarDinheiro(atual.valor_centavos)}).` });
  }
  if (valor === atual.valor_centavos) {
    return { liquidada: await liquidarMovimentacao(esc, id, data ?? null, { hoje, agora }), restante: null };
  }
  if (atual.divisoes.length > 0) {
    throw conflito('Lançamento dividido entre categorias não aceita baixa parcial. Baixe o valor inteiro.');
  }
  if (atual.tipo === 'despesa' && atual.reembolsado_centavos > 0) {
    throw conflito('Esta despesa tem reembolso ligado e não aceita baixa parcial.');
  }
  const dia = data ?? hoje;
  if (dia > hoje) throw invalido({ data_liquidacao: 'A baixa não pode ter data futura.' });
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    await tx.rodar(
      `UPDATE movimentacoes SET valor_centavos = ?, status = 'liquidada', data_liquidacao = ?, atualizada_em = ?
        WHERE usuario_id = :u AND id = ?`,
      [valor, dia, iso, id],
    );
    const restanteId = await inserirLinha(
      tx,
      { ...atual, valor_centavos: atual.valor_centavos - valor, baixa_de_id: id, recorrencia_id: null, data_ocorrencia: null },
      iso,
    );
    const liquidada = await obterMovimentacao(tx, id);
    const restante = await obterMovimentacao(tx, restanteId);
    await auditar(tx, { entidade: 'movimentacao', id, acao: 'editar', antes: atual, depois: liquidada });
    await auditar(tx, { entidade: 'movimentacao', id: restanteId, acao: 'criar', depois: restante });
    return { liquidada, restante };
  });
}

/** Muda só o vencimento de um compromisso pendente (a competência e a ocorrência continuam como estavam). */
export async function reagendar(esc, id, { data_vencimento: vencimento }, { agora = new Date() }) {
  const antes = await exigirCompromissoPendente(esc, id);
  if (antes.data_vencimento === vencimento) return antes;
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE movimentacoes SET data_vencimento = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [vencimento, iso, id]);
    const depois = await obterMovimentacao(tx, id);
    await auditar(tx, { entidade: 'movimentacao', id, acao: 'editar', antes, depois });
    return depois;
  });
}

async function mudarStatus(esc, id, status, data, { agora = new Date() }) {
  const atual = await obterMovimentacao(esc, id);
  if (!atual) throw naoEncontrado('Lançamento');
  exigirIndependente(atual);
  if (atual.status === status) {
    throw conflito(status === 'liquidada' ? 'Este lançamento já está liquidado.' : 'Este lançamento já está pendente.');
  }
  const iso = agora.toISOString();
  await esc.transacao(async (tx) => {
    for (const alvo of [id, ...(await idsFilhas(tx, id))]) {
      const antes = await obterMovimentacao(tx, alvo);
      await tx.rodar('UPDATE movimentacoes SET status = ?, data_liquidacao = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [
        status,
        data,
        iso,
        alvo,
      ]);
      await auditar(tx, { entidade: 'movimentacao', id: alvo, acao: 'editar', antes, depois: await obterMovimentacao(tx, alvo) });
    }
  });
  return obterMovimentacao(esc, id);
}

export const liquidarMovimentacao = (esc, id, dataLiquidacao, ctx) =>
  mudarStatus(esc, id, 'liquidada', dataLiquidacao ?? ctx.hoje, ctx);

export const reabrirMovimentacao = (esc, id, ctx) => mudarStatus(esc, id, 'pendente', null, ctx);

/** `hoje` (opcional) marca os itens pendentes com vencimento passado como `atrasada` (RF-07: calculado, não gravado). */
export async function listarMovimentacoes(esc, f, hoje = null) {
  const onde = ['m.usuario_id = :u', 'm.excluida_em IS NULL'];
  const p = [];

  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
    onde.push("(m.descricao ILIKE ? ESCAPE '\\' OR m.observacao ILIKE ? ESCAPE '\\')");
    p.push(like, like);
  }
  if (f.tipo) { onde.push('m.tipo = ?'); p.push(f.tipo); }
  if (f.status) { onde.push('m.status = ?'); p.push(f.status); }
  if (f.conta_id) { onde.push('(m.conta_id = ? OR m.conta_destino_id = ?)'); p.push(f.conta_id, f.conta_id); }

  let idsCategoria = null;
  if (f.categoria_id) {
    const filhas = await esc.todos(
      'SELECT id FROM categorias WHERE usuario_id = :u AND (id = ? OR pai_id = ?) AND excluida_em IS NULL',
      [f.categoria_id, f.categoria_id],
    );
    idsCategoria = filhas.map((r) => r.id);
    if (idsCategoria.length === 0) idsCategoria = [-1];
    const m = marcas(idsCategoria.length);
    onde.push(
      `(m.categoria_id IN (${m}) OR EXISTS (SELECT 1 FROM movimentacao_divisoes d
         WHERE d.usuario_id = :u AND d.movimentacao_id = m.id AND d.categoria_id IN (${m})))`,
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
    descricao: 'lower(m.descricao)',
    criada: 'm.criada_em',
  }[f.ordenar];
  const direcao = f.direcao === 'asc' ? 'ASC' : 'DESC';
  const where = onde.join(' AND ');

  const { n: total } = await esc.um(`SELECT COUNT(*) AS n FROM movimentacoes m WHERE ${where}`, p);
  const linhas = await esc.todos(
    `SELECT ${SQL_COLUNAS_M} FROM movimentacoes m WHERE ${where}
      ORDER BY ${ordem} ${direcao}, m.id ${direcao} LIMIT ? OFFSET ?`,
    [...p, f.por_pagina, (f.pagina - 1) * f.por_pagina],
  );

  // Totais do conjunto filtrado, pelas duas visões separadas (RF-02). Com filtro de categoria,
  // movimentações divididas contam só a parte da categoria filtrada.
  const todas = await esc.todos(
    `SELECT m.id, m.tipo, m.valor_centavos, m.status, m.data_competencia, m.data_vencimento, m.data_liquidacao
       FROM movimentacoes m WHERE ${where}`,
    p,
  );
  if (idsCategoria) {
    const divisoes = await divisoesDe(esc, todas.map((t) => t.id));
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
    itens: (await montar(esc, linhas)).map((m) => (hoje ? { ...m, atrasada: estaAtrasada(m, hoje) } : m)),
    total,
    pagina: f.pagina,
    por_pagina: f.por_pagina,
    totais: totaisDaListagem(todas),
  };
}

/** Movimentações que entram em qualquer das duas visões do período (para o resumo). */
export function movimentacoesDoPeriodo(esc, de, ate) {
  return esc.todos(
    `SELECT tipo, valor_centavos, status, data_competencia, data_vencimento, data_liquidacao
       FROM movimentacoes
      WHERE usuario_id = :u AND excluida_em IS NULL
        AND ((status = 'liquidada' AND data_liquidacao BETWEEN ? AND ?)
          OR (status = 'pendente' AND COALESCE(data_vencimento, data_competencia) BETWEEN ? AND ?))`,
    [de, ate, de, ate],
  );
}

/** Histórico de alterações de um lançamento, do mais antigo ao mais novo (valor antes e depois). */
export async function historicoDaMovimentacao(esc, id) {
  const linhas = await esc.todos(
    `SELECT id, acao, antes, depois, criado_em FROM audit_log
      WHERE usuario_id = :u AND entidade = 'movimentacao' AND entidade_id = ? ORDER BY id`,
    [String(id)],
  );
  if (linhas.length === 0) throw naoEncontrado('Lançamento');
  return linhas.map((l) => ({
    id: l.id,
    acao: l.acao,
    criado_em: l.criado_em,
    antes: l.antes ?? null,
    depois: l.depois ?? null,
  }));
}
