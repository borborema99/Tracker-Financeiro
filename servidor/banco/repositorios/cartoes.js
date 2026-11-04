import { formatarDinheiro } from '../../../contratos/dinheiro.js';
import {
  consolidarFaturas,
  datasDaFatura,
  gerarParcelas,
  limiteDoCartao,
  movimentosDeCartao,
  projetarFaturas,
  referenciaAtual,
  referenciaDaCompra,
  somarMeses,
  statusDaFatura,
} from '../../dominio/cartao.js';
import { encontrarComprasDuplicadas } from '../../dominio/duplicidade.js';
import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { auditar } from '../auditoria.js';

const marcas = (n) => Array.from({ length: n }, () => '?').join(', ');

// ---------------------------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------------------------

const COLUNAS_CARTAO =
  'id, nome, limite_centavos, dia_fechamento, dia_vencimento, conta_pagamento_id, arquivado, criado_em, atualizado_em';

const cartaoParaApi = (l) => ({ ...l, arquivado: l.arquivado === 1 });

function linhaCartao(db, id) {
  const l = db.prepare(`SELECT ${COLUNAS_CARTAO} FROM cartoes WHERE id = ? AND excluido_em IS NULL`).get(id);
  return l ? cartaoParaApi(l) : null;
}

/** Faturas do cartão com totais calculados. Só aparecem as que têm alguma linha (compra, estorno ou pagamento). */
function consolidadasDoCartao(db, cartaoId) {
  const faturas = db
    .prepare('SELECT id, cartao_id, referencia, data_fechamento, data_vencimento FROM faturas WHERE cartao_id = ?')
    .all(cartaoId);
  if (faturas.length === 0) return [];
  const idsFaturas = `SELECT id FROM faturas WHERE cartao_id = ?`;
  const parcelas = db
    .prepare(
      `SELECT p.fatura_id, p.valor_centavos FROM parcelas_cartao p
         JOIN compras_cartao c ON c.id = p.compra_id
        WHERE c.excluida_em IS NULL AND p.fatura_id IN (${idsFaturas})`,
    )
    .all(cartaoId);
  const estornos = db
    .prepare(
      `SELECT e.fatura_id, e.valor_centavos FROM estornos_cartao e
         JOIN compras_cartao c ON c.id = e.compra_id
        WHERE e.excluido_em IS NULL AND c.excluida_em IS NULL AND e.fatura_id IN (${idsFaturas})`,
    )
    .all(cartaoId);
  const pagamentos = db
    .prepare(
      `SELECT fatura_id, valor_centavos FROM pagamentos_fatura
        WHERE excluido_em IS NULL AND fatura_id IN (${idsFaturas})`,
    )
    .all(cartaoId);
  const comLinha = new Set([...parcelas, ...estornos, ...pagamentos].map((l) => l.fatura_id));
  return consolidarFaturas({
    faturas: faturas.filter((f) => comLinha.has(f.id)),
    parcelas,
    estornos,
    pagamentos,
  });
}

const comStatus = (faturas, hoje) => faturas.map((f) => ({ ...f, status: statusDaFatura(f, hoje) }));

/** Depois de qualquer mudança nas compras, nenhuma fatura pode ficar com mais pagamento do que o total. */
function exigirFaturasCoerentes(db, cartaoId) {
  const excedida = consolidadasDoCartao(db, cartaoId).find((f) => f.pago_centavos > f.total_centavos);
  if (excedida) {
    throw conflito(
      `A fatura de ${excedida.referencia} já recebeu pagamentos maiores que o novo total. Exclua o pagamento antes.`,
    );
  }
}

function cartaoCompleto(db, linha, hoje) {
  const faturas = comStatus(consolidadasDoCartao(db, linha.id), hoje);
  const atual = referenciaAtual(hoje, linha.dia_fechamento);
  const ciclo = { referencia: atual, ...datasDaFatura(atual, linha.dia_fechamento, linha.dia_vencimento) };
  const faturaAtual = faturas.find((f) => f.referencia === atual) ?? null;
  return {
    ...linha,
    limite: limiteDoCartao({ ...linha, faturas, hoje }),
    ciclo_atual: ciclo,
    fatura_atual: faturaAtual && {
      id: faturaAtual.id,
      referencia: faturaAtual.referencia,
      total_centavos: faturaAtual.total_centavos,
      saldo_centavos: faturaAtual.saldo_centavos,
      status: faturaAtual.status,
    },
  };
}

export function listarCartoes(db, hoje) {
  const linhas = db
    .prepare(
      `SELECT ${COLUNAS_CARTAO} FROM cartoes WHERE excluido_em IS NULL ORDER BY arquivado, nome COLLATE NOCASE`,
    )
    .all()
    .map(cartaoParaApi);
  return linhas.map((l) => cartaoCompleto(db, l, hoje));
}

export function obterCartao(db, id, hoje) {
  const linha = linhaCartao(db, id);
  return linha ? cartaoCompleto(db, linha, hoje) : null;
}

function validarCartao(db, dados, idAtual = null) {
  const campos = {};
  const repetido = db
    .prepare('SELECT 1 FROM cartoes WHERE excluido_em IS NULL AND nome = ? COLLATE NOCASE AND id <> ?')
    .get(dados.nome, idAtual ?? -1);
  if (repetido) campos.nome = 'Já existe um cartão com esse nome.';
  if (dados.conta_pagamento_id) {
    const conta = db
      .prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL')
      .get(dados.conta_pagamento_id);
    if (!conta) campos.conta_pagamento_id = 'Conta não encontrada.';
  }
  if (Object.keys(campos).length) throw invalido(campos);
}

export function criarCartao(db, dados, { hoje, agora = new Date() }) {
  validarCartao(db, dados);
  return db.transaction(() => {
    const iso = agora.toISOString();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO cartoes (nome, limite_centavos, dia_fechamento, dia_vencimento, conta_pagamento_id,
           arquivado, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.nome,
        dados.limite_centavos,
        dados.dia_fechamento,
        dados.dia_vencimento,
        dados.conta_pagamento_id ?? null,
        dados.arquivado ? 1 : 0,
        iso,
        iso,
      );
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'cartao', id, acao: 'criar', depois: linhaCartao(db, id) });
    return obterCartao(db, id, hoje);
  })();
}

export function atualizarCartao(db, id, dados, { hoje, agora = new Date() }) {
  const antes = linhaCartao(db, id);
  if (!antes) throw naoEncontrado('Cartão');
  validarCartao(db, dados, id);
  return db.transaction(() => {
    db.prepare(
      `UPDATE cartoes SET nome = ?, limite_centavos = ?, dia_fechamento = ?, dia_vencimento = ?,
         conta_pagamento_id = ?, arquivado = ?, atualizado_em = ? WHERE id = ?`,
    ).run(
      dados.nome,
      dados.limite_centavos,
      dados.dia_fechamento,
      dados.dia_vencimento,
      dados.conta_pagamento_id ?? null,
      dados.arquivado ? 1 : 0,
      agora.toISOString(),
      id,
    );
    auditar(db, { entidade: 'cartao', id, acao: 'editar', antes, depois: linhaCartao(db, id) });
    return obterCartao(db, id, hoje);
  })();
}

/** Só exclui cartão sem compras; senão o caminho é arquivar (RF-08: nada fica órfão). */
export function excluirCartao(db, id, { agora = new Date() } = {}) {
  const antes = linhaCartao(db, id);
  if (!antes) throw naoEncontrado('Cartão');
  const compras = db
    .prepare('SELECT COUNT(*) AS n FROM compras_cartao WHERE cartao_id = ? AND excluida_em IS NULL')
    .get(id).n;
  if (compras > 0) throw conflito('Este cartão tem compras. Arquive o cartão em vez de excluir.');
  db.transaction(() => {
    const iso = agora.toISOString();
    db.prepare('UPDATE cartoes SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(iso, iso, id);
    auditar(db, { entidade: 'cartao', id, acao: 'excluir', antes });
  })();
}

// ---------------------------------------------------------------------------------------------
// Compras, parcelas e estornos
// ---------------------------------------------------------------------------------------------

const COLUNAS_COMPRA =
  'id, cartao_id, descricao, valor_total_centavos, categoria_id, data_compra, parcelas_total, observacao, criada_em, atualizada_em';

function montarCompras(db, linhas) {
  if (linhas.length === 0) return [];
  const ids = linhas.map((l) => l.id);
  const porCompra = (consulta) => {
    const mapa = new Map();
    for (const l of db.prepare(consulta).all(...ids)) {
      if (!mapa.has(l.compra_id)) mapa.set(l.compra_id, []);
      mapa.get(l.compra_id).push(l);
    }
    return mapa;
  };
  const parcelas = porCompra(
    `SELECT p.compra_id, p.numero, p.valor_centavos, p.fatura_id, f.referencia, f.data_vencimento
       FROM parcelas_cartao p JOIN faturas f ON f.id = p.fatura_id
      WHERE p.compra_id IN (${marcas(ids.length)}) ORDER BY p.numero`,
  );
  const estornos = porCompra(
    `SELECT compra_id, id, valor_centavos, data_estorno, descricao, fatura_id FROM estornos_cartao
      WHERE excluido_em IS NULL AND compra_id IN (${marcas(ids.length)}) ORDER BY data_estorno, id`,
  );
  return linhas.map((l) => {
    const estornosDaCompra = (estornos.get(l.id) ?? []).map(({ compra_id: _, ...e }) => e);
    const estornado = estornosDaCompra.reduce((soma, e) => soma + e.valor_centavos, 0);
    return {
      ...l,
      parcelas: (parcelas.get(l.id) ?? []).map(({ compra_id: _, ...p }) => p),
      estornos: estornosDaCompra,
      estornado_centavos: estornado,
      valor_liquido_centavos: l.valor_total_centavos - estornado,
    };
  });
}

export function obterCompra(db, id) {
  const linha = db
    .prepare(`SELECT ${COLUNAS_COMPRA} FROM compras_cartao WHERE id = ? AND excluida_em IS NULL`)
    .get(id);
  return linha ? montarCompras(db, [linha])[0] : null;
}

export function listarComprasDoCartao(db, cartaoId, { pagina, por_pagina: porPagina }) {
  if (!linhaCartao(db, cartaoId)) throw naoEncontrado('Cartão');
  const total = db
    .prepare('SELECT COUNT(*) AS n FROM compras_cartao WHERE cartao_id = ? AND excluida_em IS NULL')
    .get(cartaoId).n;
  const linhas = db
    .prepare(
      `SELECT ${COLUNAS_COMPRA} FROM compras_cartao WHERE cartao_id = ? AND excluida_em IS NULL
        ORDER BY data_compra DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(cartaoId, porPagina, (pagina - 1) * porPagina);
  return { itens: montarCompras(db, linhas), total, pagina, por_pagina: porPagina };
}

function garantirFatura(db, cartao, referencia, iso) {
  const existente = db
    .prepare('SELECT id FROM faturas WHERE cartao_id = ? AND referencia = ?')
    .get(cartao.id, referencia);
  if (existente) return existente.id;
  const datas = datasDaFatura(referencia, cartao.dia_fechamento, cartao.dia_vencimento);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO faturas (cartao_id, referencia, data_fechamento, data_vencimento, criada_em)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(cartao.id, referencia, datas.data_fechamento, datas.data_vencimento, iso);
  const id = Number(lastInsertRowid);
  auditar(db, {
    entidade: 'fatura',
    id,
    acao: 'criar',
    depois: { id, cartao_id: cartao.id, referencia, ...datas },
  });
  return id;
}

const faturaTemPagamento = (db, cartaoId, referencia) =>
  !!db
    .prepare(
      `SELECT 1 FROM pagamentos_fatura p JOIN faturas f ON f.id = p.fatura_id
        WHERE f.cartao_id = ? AND f.referencia = ? AND p.excluido_em IS NULL`,
    )
    .get(cartaoId, referencia);

function gravarParcelas(db, compraId, cartao, dados, iso) {
  const inserir = db.prepare(
    'INSERT INTO parcelas_cartao (compra_id, numero, valor_centavos, fatura_id) VALUES (?, ?, ?, ?)',
  );
  for (const p of gerarParcelas(dados.valor_total_centavos, dados.parcelas_total, dados.data_compra, cartao.dia_fechamento)) {
    inserir.run(compraId, p.numero, p.valor_centavos, garantirFatura(db, cartao, p.referencia, iso));
  }
}

function validarCompra(db, dados, cartaoAtualId = null) {
  const campos = {};
  const cartao = linhaCartao(db, dados.cartao_id);
  if (!cartao) campos.cartao_id = 'Cartão não encontrado.';
  else if (cartao.arquivado && cartao.id !== cartaoAtualId) campos.cartao_id = 'Este cartão está arquivado.';
  if (dados.categoria_id) {
    const c = db.prepare('SELECT tipo FROM categorias WHERE id = ? AND excluida_em IS NULL').get(dados.categoria_id);
    if (!c) campos.categoria_id = 'Categoria não encontrada.';
    else if (c.tipo !== 'despesa') campos.categoria_id = 'Esta categoria não é de despesa.';
  }
  if (Object.keys(campos).length) throw invalido(campos);
  return cartao;
}

/** RF-09: avisa (sem bloquear) se já existe compra no mesmo cartão com mesmo valor, data e descrição. */
function avisosDeDuplicidade(db, compra) {
  const candidatos = db
    .prepare(
      `SELECT ${COLUNAS_COMPRA}, excluida_em FROM compras_cartao
        WHERE excluida_em IS NULL AND cartao_id = ? AND valor_total_centavos = ? AND data_compra = ?`,
    )
    .all(compra.cartao_id, compra.valor_total_centavos, compra.data_compra);
  const iguais = encontrarComprasDuplicadas(compra, candidatos);
  if (iguais.length === 0) return [];
  return [
    {
      codigo: 'possivel_duplicidade',
      mensagem: 'Já existe compra neste cartão com o mesmo valor, data e descrição. Conferir se não é repetida.',
      ids: iguais.map((i) => i.id),
    },
  ];
}

/** Compra que passa do limite avisa, mas não bloqueia (quem decide é o banco; aqui só se registra o que aconteceu). */
function avisosDeLimite(db, cartao, hoje) {
  if (!hoje) return [];
  const { disponivel_centavos: disponivel } = cartaoCompleto(db, cartao, hoje).limite;
  if (disponivel >= 0) return [];
  return [
    {
      codigo: 'acima_do_limite',
      mensagem: `Com esta compra o cartão fica ${formatarDinheiro(-disponivel)} acima do limite.`,
    },
  ];
}

export function criarCompra(db, dados, { hoje, agora = new Date() }) {
  return db.transaction(() => {
    const cartao = validarCompra(db, dados);
    const iso = agora.toISOString();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO compras_cartao (cartao_id, descricao, valor_total_centavos, categoria_id, data_compra,
           parcelas_total, observacao, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.cartao_id,
        dados.descricao,
        dados.valor_total_centavos,
        dados.categoria_id ?? null,
        dados.data_compra,
        dados.parcelas_total,
        dados.observacao ?? '',
        iso,
        iso,
      );
    const id = Number(lastInsertRowid);
    gravarParcelas(db, id, cartao, dados, iso);
    const depois = obterCompra(db, id);
    auditar(db, { entidade: 'compra_cartao', id, acao: 'criar', depois });
    return { compra: depois, avisos: [...avisosDeDuplicidade(db, depois), ...avisosDeLimite(db, cartao, hoje)] };
  })();
}

export function atualizarCompra(db, id, dados, { hoje, agora = new Date() }) {
  const antes = obterCompra(db, id);
  if (!antes) throw naoEncontrado('Compra');
  if (dados.cartao_id !== antes.cartao_id) {
    throw conflito('Não dá para trocar o cartão de uma compra. Exclua e lance de novo.');
  }
  const mudouEstrutura =
    dados.valor_total_centavos !== antes.valor_total_centavos ||
    dados.parcelas_total !== antes.parcelas_total ||
    dados.data_compra !== antes.data_compra;
  if (mudouEstrutura && antes.estornos.length > 0) {
    throw conflito('Esta compra tem estorno. Exclua o estorno antes de mudar valor, parcelas ou data.');
  }
  return db.transaction(() => {
    const cartao = validarCompra(db, dados, antes.cartao_id);
    const iso = agora.toISOString();
    db.prepare(
      `UPDATE compras_cartao SET descricao = ?, valor_total_centavos = ?, categoria_id = ?, data_compra = ?,
         parcelas_total = ?, observacao = ?, atualizada_em = ? WHERE id = ?`,
    ).run(
      dados.descricao,
      dados.valor_total_centavos,
      dados.categoria_id ?? null,
      dados.data_compra,
      dados.parcelas_total,
      dados.observacao ?? '',
      iso,
      id,
    );
    if (mudouEstrutura) {
      db.prepare('DELETE FROM parcelas_cartao WHERE compra_id = ?').run(id);
      gravarParcelas(db, id, cartao, dados, iso);
    }
    exigirFaturasCoerentes(db, cartao.id);
    const depois = obterCompra(db, id);
    auditar(db, { entidade: 'compra_cartao', id, acao: 'editar', antes, depois });
    return { compra: depois, avisos: [...avisosDeDuplicidade(db, depois), ...avisosDeLimite(db, cartao, hoje)] };
  })();
}

/** Exclusão lógica: parcelas e estornos saem junto, então nenhuma fatura fica com linha órfã (RF-08). */
export function excluirCompra(db, id, { agora = new Date() } = {}) {
  const antes = obterCompra(db, id);
  if (!antes) throw naoEncontrado('Compra');
  db.transaction(() => {
    const iso = agora.toISOString();
    for (const e of antes.estornos) {
      db.prepare('UPDATE estornos_cartao SET excluido_em = ? WHERE id = ?').run(iso, e.id);
      auditar(db, { entidade: 'estorno_cartao', id: e.id, acao: 'excluir', antes: e });
    }
    db.prepare('UPDATE compras_cartao SET excluida_em = ?, atualizada_em = ? WHERE id = ?').run(iso, iso, id);
    exigirFaturasCoerentes(db, antes.cartao_id);
    auditar(db, { entidade: 'compra_cartao', id, acao: 'excluir', antes });
  })();
}

/**
 * RF-05: o estorno ajusta a compra original (reduz o valor líquido) e cai como crédito na fatura aberta de
 * hoje (ou na primeira seguinte sem pagamento). Estornar tudo reverte a compra.
 */
export function estornarCompra(db, compraId, dados, { hoje, agora = new Date() }) {
  const antes = obterCompra(db, compraId);
  if (!antes) throw naoEncontrado('Compra');
  const data = dados.data_estorno ?? hoje;
  const campos = {};
  if (data > hoje) campos.data_estorno = 'O estorno não pode ter data futura.';
  else if (data < antes.data_compra) campos.data_estorno = 'O estorno não pode ser antes da compra.';
  if (dados.valor_centavos > antes.valor_liquido_centavos) {
    campos.valor_centavos = `O estorno passa do que resta da compra (${formatarDinheiro(antes.valor_liquido_centavos)}).`;
  }
  if (Object.keys(campos).length) throw invalido(campos);

  return db.transaction(() => {
    const cartao = linhaCartao(db, antes.cartao_id);
    const iso = agora.toISOString();
    let referencia = referenciaDaCompra(hoje, cartao.dia_fechamento);
    while (faturaTemPagamento(db, cartao.id, referencia)) referencia = somarMeses(referencia, 1);
    const faturaId = garantirFatura(db, cartao, referencia, iso);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO estornos_cartao (compra_id, valor_centavos, data_estorno, fatura_id, descricao, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(compraId, dados.valor_centavos, data, faturaId, dados.descricao ?? '', iso);
    const id = Number(lastInsertRowid);
    exigirFaturasCoerentes(db, cartao.id);
    const depois = obterCompra(db, compraId);
    auditar(db, {
      entidade: 'estorno_cartao',
      id,
      acao: 'criar',
      depois: depois.estornos.find((e) => e.id === id),
    });
    auditar(db, { entidade: 'compra_cartao', id: compraId, acao: 'editar', antes, depois });
    return depois;
  })();
}

export function excluirEstorno(db, id, { agora = new Date() } = {}) {
  const linha = db
    .prepare(
      `SELECT e.id, e.compra_id FROM estornos_cartao e JOIN compras_cartao c ON c.id = e.compra_id
        WHERE e.id = ? AND e.excluido_em IS NULL AND c.excluida_em IS NULL`,
    )
    .get(id);
  if (!linha) throw naoEncontrado('Estorno');
  const antes = obterCompra(db, linha.compra_id);
  db.transaction(() => {
    db.prepare('UPDATE estornos_cartao SET excluido_em = ? WHERE id = ?').run(agora.toISOString(), id);
    exigirFaturasCoerentes(db, antes.cartao_id);
    const depois = obterCompra(db, linha.compra_id);
    auditar(db, { entidade: 'estorno_cartao', id, acao: 'excluir', antes: antes.estornos.find((e) => e.id === id) });
    auditar(db, { entidade: 'compra_cartao', id: linha.compra_id, acao: 'editar', antes, depois });
  })();
  return obterCompra(db, linha.compra_id);
}

/**
 * Antecipação: traz parcelas de faturas futuras para a fatura aberta de hoje. O valor não muda; só o
 * vencimento chega antes. Faturas já pagas não aceitam parcelas novas.
 */
export function anteciparParcelas(db, compraId, { parcelas: numeros }, { hoje, agora = new Date() }) {
  const antes = obterCompra(db, compraId);
  if (!antes) throw naoEncontrado('Compra');
  const cartao = linhaCartao(db, antes.cartao_id);
  const destino = referenciaDaCompra(hoje, cartao.dia_fechamento);

  const escolhidas = [...new Set(numeros)].map((n) => antes.parcelas.find((p) => p.numero === n));
  if (escolhidas.some((p) => !p)) throw invalido({ parcelas: 'Parcela inexistente nesta compra.' });
  const jaChegou = escolhidas.find((p) => p.referencia <= destino);
  if (jaChegou) {
    throw invalido({ parcelas: `A parcela ${jaChegou.numero} já está na fatura atual ou numa anterior.` });
  }
  if (faturaTemPagamento(db, cartao.id, destino)) {
    throw conflito('A fatura atual já tem pagamento. Registre a antecipação depois que ela for paga por inteiro.');
  }

  return db.transaction(() => {
    const faturaId = garantirFatura(db, cartao, destino, agora.toISOString());
    const mover = db.prepare('UPDATE parcelas_cartao SET fatura_id = ? WHERE compra_id = ? AND numero = ?');
    for (const p of escolhidas) mover.run(faturaId, compraId, p.numero);
    exigirFaturasCoerentes(db, cartao.id);
    const depois = obterCompra(db, compraId);
    auditar(db, { entidade: 'compra_cartao', id: compraId, acao: 'editar', antes, depois });
    return depois;
  })();
}

// ---------------------------------------------------------------------------------------------
// Faturas e pagamentos
// ---------------------------------------------------------------------------------------------

export function faturasDoCartao(db, cartaoId, hoje) {
  if (!linhaCartao(db, cartaoId)) throw naoEncontrado('Cartão');
  return comStatus(consolidadasDoCartao(db, cartaoId), hoje).reverse();
}

export function projecaoDoCartao(db, cartaoId, hoje) {
  const cartao = linhaCartao(db, cartaoId);
  if (!cartao) throw naoEncontrado('Cartão');
  return projetarFaturas({
    faturas: consolidadasDoCartao(db, cartaoId),
    hoje,
    dia_fechamento: cartao.dia_fechamento,
  });
}

/** Fatura com as linhas que a compõem: parcelas, estornos (créditos) e pagamentos. */
export function obterFatura(db, id, hoje) {
  const base = db.prepare('SELECT cartao_id FROM faturas WHERE id = ?').get(id);
  const cartao = base && linhaCartao(db, base.cartao_id);
  const fatura = cartao && comStatus(consolidadasDoCartao(db, cartao.id), hoje).find((f) => f.id === id);
  if (!fatura) throw naoEncontrado('Fatura');
  const parcelas = db
    .prepare(
      `SELECT c.id AS compra_id, c.descricao, c.data_compra, c.parcelas_total, c.categoria_id,
              p.numero, p.valor_centavos
         FROM parcelas_cartao p JOIN compras_cartao c ON c.id = p.compra_id
        WHERE p.fatura_id = ? AND c.excluida_em IS NULL ORDER BY c.data_compra, p.id`,
    )
    .all(id);
  const estornos = db
    .prepare(
      `SELECT e.id, e.valor_centavos, e.data_estorno, e.descricao, c.id AS compra_id, c.descricao AS compra_descricao
         FROM estornos_cartao e JOIN compras_cartao c ON c.id = e.compra_id
        WHERE e.fatura_id = ? AND e.excluido_em IS NULL AND c.excluida_em IS NULL ORDER BY e.data_estorno, e.id`,
    )
    .all(id);
  const pagamentos = db
    .prepare(
      `SELECT id, conta_id, valor_centavos, data_pagamento FROM pagamentos_fatura
        WHERE fatura_id = ? AND excluido_em IS NULL ORDER BY data_pagamento, id`,
    )
    .all(id);
  return { ...fatura, cartao: { id: cartao.id, nome: cartao.nome, conta_pagamento_id: cartao.conta_pagamento_id }, parcelas, estornos, pagamentos };
}

/** Pagamento total ou parcial: debita a conta e abate a fatura. Não cria despesa (RF-04). */
export function pagarFatura(db, faturaId, dados, { hoje, agora = new Date() }) {
  const fatura = obterFatura(db, faturaId, hoje);
  const data = dados.data_pagamento ?? hoje;
  const campos = {};
  if (data > hoje) campos.data_pagamento = 'O pagamento não pode ter data futura.';
  const conta = db
    .prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL')
    .get(dados.conta_id);
  if (!conta) campos.conta_id = 'Conta não encontrada.';
  else if (conta.arquivada === 1) campos.conta_id = 'Esta conta está arquivada.';
  if (fatura.saldo_centavos === 0) {
    campos.valor_centavos = 'Esta fatura não tem nada a pagar.';
  } else if (dados.valor_centavos > fatura.saldo_centavos) {
    campos.valor_centavos = `O valor passa do que falta pagar (${formatarDinheiro(fatura.saldo_centavos)}).`;
  }
  if (Object.keys(campos).length) throw invalido(campos);

  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO pagamentos_fatura (fatura_id, conta_id, valor_centavos, data_pagamento, criado_em)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(faturaId, dados.conta_id, dados.valor_centavos, data, agora.toISOString());
    const id = Number(lastInsertRowid);
    auditar(db, {
      entidade: 'pagamento_fatura',
      id,
      acao: 'criar',
      depois: { id, fatura_id: faturaId, conta_id: dados.conta_id, valor_centavos: dados.valor_centavos, data_pagamento: data },
    });
    return obterFatura(db, faturaId, hoje);
  })();
}

export function excluirPagamento(db, id, { hoje, agora = new Date() }) {
  const antes = db
    .prepare(
      `SELECT id, fatura_id, conta_id, valor_centavos, data_pagamento FROM pagamentos_fatura
        WHERE id = ? AND excluido_em IS NULL`,
    )
    .get(id);
  if (!antes) throw naoEncontrado('Pagamento');
  db.transaction(() => {
    db.prepare('UPDATE pagamentos_fatura SET excluido_em = ? WHERE id = ?').run(agora.toISOString(), id);
    auditar(db, { entidade: 'pagamento_fatura', id, acao: 'excluir', antes });
  })();
  return obterFatura(db, antes.fatura_id, hoje);
}

// ---------------------------------------------------------------------------------------------
// Indicadores para o resumo e para o saldo das contas
// ---------------------------------------------------------------------------------------------

/** Despesas realizadas no cartão no período (compra na data da compra; estorno na data do estorno). */
export function movimentosDeCartaoDoPeriodo(db, de, ate) {
  const compras = db
    .prepare(
      `SELECT valor_total_centavos, data_compra FROM compras_cartao
        WHERE excluida_em IS NULL AND data_compra BETWEEN ? AND ?`,
    )
    .all(de, ate);
  const estornos = db
    .prepare(
      `SELECT e.valor_centavos, e.data_estorno FROM estornos_cartao e
         JOIN compras_cartao c ON c.id = e.compra_id
        WHERE e.excluido_em IS NULL AND c.excluida_em IS NULL AND e.data_estorno BETWEEN ? AND ?`,
    )
    .all(de, ate);
  return movimentosDeCartao(compras, estornos);
}

/**
 * Totais dos cartões, ou null se não houver nenhum (nada de zero falso, RF-10). Fatura a pagar conta de
 * todos, inclusive cartão arquivado; limite só dos cartões ativos.
 */
export function resumoDosCartoes(db, hoje) {
  const todos = listarCartoes(db, hoje);
  if (todos.length === 0) return null;
  const ativos = todos.filter((c) => !c.arquivado);
  const soma = (lista, campo) => lista.reduce((total, c) => total + c.limite[campo], 0);
  return {
    quantidade: ativos.length,
    limite_total_centavos: soma(ativos, 'limite_centavos'),
    faturas_nao_pagas_centavos: soma(todos, 'faturas_nao_pagas_centavos'),
    parcelas_futuras_centavos: soma(todos, 'parcelas_futuras_centavos'),
    limite_disponivel_centavos: soma(ativos, 'disponivel_centavos'),
  };
}

/** Faturas com algo a pagar (de todos os cartões, inclusive arquivados), para alertas e projeção do fluxo. */
export function faturasEmAberto(db, hoje) {
  const cartoes = db.prepare('SELECT id, nome FROM cartoes WHERE excluido_em IS NULL').all();
  return cartoes.flatMap((c) =>
    comStatus(consolidadasDoCartao(db, c.id), hoje)
      .filter((f) => f.saldo_centavos > 0)
      .map((f) => ({ ...f, cartao_nome: c.nome })),
  );
}

/** Pagamentos de fatura no formato que `saldo.js` entende: debitam a conta e nada mais. */
export function pagamentosComoMovimentos(db) {
  return db
    .prepare(
      `SELECT conta_id, valor_centavos FROM pagamentos_fatura WHERE excluido_em IS NULL`,
    )
    .all()
    .map((p) => ({
      tipo: 'pagamento_fatura',
      conta_id: p.conta_id,
      conta_destino_id: null,
      valor_centavos: p.valor_centavos,
      status: 'liquidada',
    }));
}
