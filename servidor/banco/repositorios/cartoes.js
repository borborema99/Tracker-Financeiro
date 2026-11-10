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

async function linhaCartao(esc, id) {
  const l = await esc.um(`SELECT ${COLUNAS_CARTAO} FROM cartoes WHERE usuario_id = :u AND id = ? AND excluido_em IS NULL`, [id]);
  return l ?? null;
}

/** Faturas do cartão com totais calculados. Só aparecem as que têm alguma linha (compra, estorno ou pagamento). */
async function consolidadasDoCartao(esc, cartaoId) {
  const faturas = await esc.todos(
    'SELECT id, cartao_id, referencia, data_fechamento, data_vencimento FROM faturas WHERE usuario_id = :u AND cartao_id = ?',
    [cartaoId],
  );
  if (faturas.length === 0) return [];
  const idsFaturas = 'SELECT id FROM faturas WHERE usuario_id = :u AND cartao_id = ?';
  const parcelas = await esc.todos(
    `SELECT p.fatura_id, p.valor_centavos FROM parcelas_cartao p
       JOIN compras_cartao c ON c.usuario_id = p.usuario_id AND c.id = p.compra_id
      WHERE p.usuario_id = :u AND c.excluida_em IS NULL AND p.fatura_id IN (${idsFaturas})`,
    [cartaoId],
  );
  const estornos = await esc.todos(
    `SELECT e.fatura_id, e.valor_centavos FROM estornos_cartao e
       JOIN compras_cartao c ON c.usuario_id = e.usuario_id AND c.id = e.compra_id
      WHERE e.usuario_id = :u AND e.excluido_em IS NULL AND c.excluida_em IS NULL AND e.fatura_id IN (${idsFaturas})`,
    [cartaoId],
  );
  const pagamentos = await esc.todos(
    `SELECT fatura_id, valor_centavos FROM pagamentos_fatura
      WHERE usuario_id = :u AND excluido_em IS NULL AND fatura_id IN (${idsFaturas})`,
    [cartaoId],
  );
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
async function exigirFaturasCoerentes(esc, cartaoId) {
  const excedida = (await consolidadasDoCartao(esc, cartaoId)).find((f) => f.pago_centavos > f.total_centavos);
  if (excedida) {
    throw conflito(
      `A fatura de ${excedida.referencia} já recebeu pagamentos maiores que o novo total. Exclua o pagamento antes.`,
    );
  }
}

async function cartaoCompleto(esc, linha, hoje) {
  const faturas = comStatus(await consolidadasDoCartao(esc, linha.id), hoje);
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

export async function listarCartoes(esc, hoje) {
  const linhas = await esc.todos(
    `SELECT ${COLUNAS_CARTAO} FROM cartoes WHERE usuario_id = :u AND excluido_em IS NULL ORDER BY arquivado, lower(nome)`,
  );
  const completos = [];
  for (const l of linhas) completos.push(await cartaoCompleto(esc, l, hoje));
  return completos;
}

export async function obterCartao(esc, id, hoje) {
  const linha = await linhaCartao(esc, id);
  return linha ? cartaoCompleto(esc, linha, hoje) : null;
}

async function validarCartao(esc, dados, idAtual = null) {
  const campos = {};
  const repetido = await esc.um(
    'SELECT 1 AS um FROM cartoes WHERE usuario_id = :u AND excluido_em IS NULL AND lower(nome) = lower(?) AND id <> ?',
    [dados.nome, idAtual ?? -1],
  );
  if (repetido) campos.nome = 'Já existe um cartão com esse nome.';
  if (dados.conta_pagamento_id) {
    const conta = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [
      dados.conta_pagamento_id,
    ]);
    if (!conta) campos.conta_pagamento_id = 'Conta não encontrada.';
  }
  if (Object.keys(campos).length) throw invalido(campos);
}

export async function criarCartao(esc, dados, { hoje, agora = new Date() }) {
  await validarCartao(esc, dados);
  return esc.transacao(async (tx) => {
    const iso = agora.toISOString();
    const [{ id }] = await tx.rodar(
      `INSERT INTO cartoes (usuario_id, nome, limite_centavos, dia_fechamento, dia_vencimento, conta_pagamento_id,
         arquivado, criado_em, atualizado_em) VALUES (:u, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        dados.nome,
        dados.limite_centavos,
        dados.dia_fechamento,
        dados.dia_vencimento,
        dados.conta_pagamento_id ?? null,
        !!dados.arquivado,
        iso,
        iso,
      ],
    );
    await auditar(tx, { entidade: 'cartao', id, acao: 'criar', depois: await linhaCartao(tx, id) });
    return obterCartao(tx, id, hoje);
  });
}

export async function atualizarCartao(esc, id, dados, { hoje, agora = new Date() }) {
  const antes = await linhaCartao(esc, id);
  if (!antes) throw naoEncontrado('Cartão');
  await validarCartao(esc, dados, id);
  return esc.transacao(async (tx) => {
    await tx.rodar(
      `UPDATE cartoes SET nome = ?, limite_centavos = ?, dia_fechamento = ?, dia_vencimento = ?,
         conta_pagamento_id = ?, arquivado = ?, atualizado_em = ? WHERE usuario_id = :u AND id = ?`,
      [
        dados.nome,
        dados.limite_centavos,
        dados.dia_fechamento,
        dados.dia_vencimento,
        dados.conta_pagamento_id ?? null,
        !!dados.arquivado,
        agora.toISOString(),
        id,
      ],
    );
    await auditar(tx, { entidade: 'cartao', id, acao: 'editar', antes, depois: await linhaCartao(tx, id) });
    return obterCartao(tx, id, hoje);
  });
}

/** Só exclui cartão sem compras; senão o caminho é arquivar (RF-08: nada fica órfão). */
export async function excluirCartao(esc, id, { agora = new Date() } = {}) {
  const antes = await linhaCartao(esc, id);
  if (!antes) throw naoEncontrado('Cartão');
  const { n: compras } = await esc.um(
    'SELECT COUNT(*) AS n FROM compras_cartao WHERE usuario_id = :u AND cartao_id = ? AND excluida_em IS NULL',
    [id],
  );
  if (compras > 0) throw conflito('Este cartão tem compras. Arquive o cartão em vez de excluir.');
  await esc.transacao(async (tx) => {
    const iso = agora.toISOString();
    await tx.rodar('UPDATE cartoes SET excluido_em = ?, atualizado_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, id]);
    await auditar(tx, { entidade: 'cartao', id, acao: 'excluir', antes });
  });
}

// ---------------------------------------------------------------------------------------------
// Compras, parcelas e estornos
// ---------------------------------------------------------------------------------------------

const COLUNAS_COMPRA =
  'id, cartao_id, descricao, valor_total_centavos, categoria_id, data_compra, parcelas_total, observacao, criada_em, atualizada_em';

async function montarCompras(esc, linhas) {
  if (linhas.length === 0) return [];
  const ids = linhas.map((l) => l.id);
  const porCompra = async (consulta) => {
    const mapa = new Map();
    for (const l of await esc.todos(consulta, ids)) {
      if (!mapa.has(l.compra_id)) mapa.set(l.compra_id, []);
      mapa.get(l.compra_id).push(l);
    }
    return mapa;
  };
  const parcelas = await porCompra(
    `SELECT p.compra_id, p.numero, p.valor_centavos, p.fatura_id, f.referencia, f.data_vencimento
       FROM parcelas_cartao p JOIN faturas f ON f.usuario_id = p.usuario_id AND f.id = p.fatura_id
      WHERE p.usuario_id = :u AND p.compra_id IN (${marcas(ids.length)}) ORDER BY p.numero`,
  );
  const estornos = await porCompra(
    `SELECT compra_id, id, valor_centavos, data_estorno, descricao, fatura_id FROM estornos_cartao
      WHERE usuario_id = :u AND excluido_em IS NULL AND compra_id IN (${marcas(ids.length)}) ORDER BY data_estorno, id`,
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

export async function obterCompra(esc, id) {
  const linha = await esc.um(
    `SELECT ${COLUNAS_COMPRA} FROM compras_cartao WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL`,
    [id],
  );
  return linha ? (await montarCompras(esc, [linha]))[0] : null;
}

export async function listarComprasDoCartao(esc, cartaoId, { pagina, por_pagina: porPagina }) {
  if (!(await linhaCartao(esc, cartaoId))) throw naoEncontrado('Cartão');
  const { n: total } = await esc.um(
    'SELECT COUNT(*) AS n FROM compras_cartao WHERE usuario_id = :u AND cartao_id = ? AND excluida_em IS NULL',
    [cartaoId],
  );
  const linhas = await esc.todos(
    `SELECT ${COLUNAS_COMPRA} FROM compras_cartao WHERE usuario_id = :u AND cartao_id = ? AND excluida_em IS NULL
      ORDER BY data_compra DESC, id DESC LIMIT ? OFFSET ?`,
    [cartaoId, porPagina, (pagina - 1) * porPagina],
  );
  return { itens: await montarCompras(esc, linhas), total, pagina, por_pagina: porPagina };
}

async function garantirFatura(esc, cartao, referencia, iso) {
  const existente = await esc.um('SELECT id FROM faturas WHERE usuario_id = :u AND cartao_id = ? AND referencia = ?', [
    cartao.id,
    referencia,
  ]);
  if (existente) return existente.id;
  const datas = datasDaFatura(referencia, cartao.dia_fechamento, cartao.dia_vencimento);
  const [{ id }] = await esc.rodar(
    `INSERT INTO faturas (usuario_id, cartao_id, referencia, data_fechamento, data_vencimento, criada_em)
     VALUES (:u, ?, ?, ?, ?, ?) RETURNING id`,
    [cartao.id, referencia, datas.data_fechamento, datas.data_vencimento, iso],
  );
  await auditar(esc, {
    entidade: 'fatura',
    id,
    acao: 'criar',
    depois: { id, cartao_id: cartao.id, referencia, ...datas },
  });
  return id;
}

const faturaTemPagamento = async (esc, cartaoId, referencia) =>
  !!(await esc.um(
    `SELECT 1 AS um FROM pagamentos_fatura p JOIN faturas f ON f.usuario_id = p.usuario_id AND f.id = p.fatura_id
      WHERE p.usuario_id = :u AND f.cartao_id = ? AND f.referencia = ? AND p.excluido_em IS NULL`,
    [cartaoId, referencia],
  ));

async function gravarParcelas(esc, compraId, cartao, dados, iso) {
  for (const p of gerarParcelas(dados.valor_total_centavos, dados.parcelas_total, dados.data_compra, cartao.dia_fechamento)) {
    const faturaId = await garantirFatura(esc, cartao, p.referencia, iso);
    await esc.rodar(
      'INSERT INTO parcelas_cartao (usuario_id, compra_id, numero, valor_centavos, fatura_id) VALUES (:u, ?, ?, ?, ?)',
      [compraId, p.numero, p.valor_centavos, faturaId],
    );
  }
}

async function validarCompra(esc, dados, cartaoAtualId = null) {
  const campos = {};
  const cartao = await linhaCartao(esc, dados.cartao_id);
  if (!cartao) campos.cartao_id = 'Cartão não encontrado.';
  else if (cartao.arquivado && cartao.id !== cartaoAtualId) campos.cartao_id = 'Este cartão está arquivado.';
  if (dados.categoria_id) {
    const c = await esc.um('SELECT tipo FROM categorias WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [dados.categoria_id]);
    if (!c) campos.categoria_id = 'Categoria não encontrada.';
    else if (c.tipo !== 'despesa') campos.categoria_id = 'Esta categoria não é de despesa.';
  }
  if (Object.keys(campos).length) throw invalido(campos);
  return cartao;
}

/** RF-09: avisa (sem bloquear) se já existe compra no mesmo cartão com mesmo valor, data e descrição. */
async function avisosDeDuplicidade(esc, compra) {
  const candidatos = await esc.todos(
    `SELECT ${COLUNAS_COMPRA}, excluida_em FROM compras_cartao
      WHERE usuario_id = :u AND excluida_em IS NULL AND cartao_id = ? AND valor_total_centavos = ? AND data_compra = ?`,
    [compra.cartao_id, compra.valor_total_centavos, compra.data_compra],
  );
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
async function avisosDeLimite(esc, cartao, hoje) {
  if (!hoje) return [];
  const { disponivel_centavos: disponivel } = (await cartaoCompleto(esc, cartao, hoje)).limite;
  if (disponivel >= 0) return [];
  return [
    {
      codigo: 'acima_do_limite',
      mensagem: `Com esta compra o cartão fica ${formatarDinheiro(-disponivel)} acima do limite.`,
    },
  ];
}

export async function criarCompra(esc, dados, { hoje, agora = new Date() }) {
  return esc.transacao(async (tx) => {
    const cartao = await validarCompra(tx, dados);
    const iso = agora.toISOString();
    const [{ id }] = await tx.rodar(
      `INSERT INTO compras_cartao (usuario_id, cartao_id, descricao, valor_total_centavos, categoria_id, data_compra,
         parcelas_total, observacao, criada_em, atualizada_em) VALUES (:u, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        dados.cartao_id,
        dados.descricao,
        dados.valor_total_centavos,
        dados.categoria_id ?? null,
        dados.data_compra,
        dados.parcelas_total,
        dados.observacao ?? '',
        iso,
        iso,
      ],
    );
    await gravarParcelas(tx, id, cartao, dados, iso);
    const depois = await obterCompra(tx, id);
    await auditar(tx, { entidade: 'compra_cartao', id, acao: 'criar', depois });
    return { compra: depois, avisos: [...(await avisosDeDuplicidade(tx, depois)), ...(await avisosDeLimite(tx, cartao, hoje))] };
  });
}

export async function atualizarCompra(esc, id, dados, { hoje, agora = new Date() }) {
  const antes = await obterCompra(esc, id);
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
  return esc.transacao(async (tx) => {
    const cartao = await validarCompra(tx, dados, antes.cartao_id);
    const iso = agora.toISOString();
    await tx.rodar(
      `UPDATE compras_cartao SET descricao = ?, valor_total_centavos = ?, categoria_id = ?, data_compra = ?,
         parcelas_total = ?, observacao = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?`,
      [
        dados.descricao,
        dados.valor_total_centavos,
        dados.categoria_id ?? null,
        dados.data_compra,
        dados.parcelas_total,
        dados.observacao ?? '',
        iso,
        id,
      ],
    );
    if (mudouEstrutura) {
      await tx.rodar('DELETE FROM parcelas_cartao WHERE usuario_id = :u AND compra_id = ?', [id]);
      await gravarParcelas(tx, id, cartao, dados, iso);
    }
    await exigirFaturasCoerentes(tx, cartao.id);
    const depois = await obterCompra(tx, id);
    await auditar(tx, { entidade: 'compra_cartao', id, acao: 'editar', antes, depois });
    return { compra: depois, avisos: [...(await avisosDeDuplicidade(tx, depois)), ...(await avisosDeLimite(tx, cartao, hoje))] };
  });
}

/** Exclusão lógica: parcelas e estornos saem junto, então nenhuma fatura fica com linha órfã (RF-08). */
export async function excluirCompra(esc, id, { agora = new Date() } = {}) {
  const antes = await obterCompra(esc, id);
  if (!antes) throw naoEncontrado('Compra');
  await esc.transacao(async (tx) => {
    const iso = agora.toISOString();
    for (const e of antes.estornos) {
      await tx.rodar('UPDATE estornos_cartao SET excluido_em = ? WHERE usuario_id = :u AND id = ?', [iso, e.id]);
      await auditar(tx, { entidade: 'estorno_cartao', id: e.id, acao: 'excluir', antes: e });
    }
    await tx.rodar('UPDATE compras_cartao SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, id]);
    await exigirFaturasCoerentes(tx, antes.cartao_id);
    await auditar(tx, { entidade: 'compra_cartao', id, acao: 'excluir', antes });
  });
}

/**
 * RF-05: o estorno ajusta a compra original (reduz o valor líquido) e cai como crédito na fatura aberta de
 * hoje (ou na primeira seguinte sem pagamento). Estornar tudo reverte a compra.
 */
export async function estornarCompra(esc, compraId, dados, { hoje, agora = new Date() }) {
  const antes = await obterCompra(esc, compraId);
  if (!antes) throw naoEncontrado('Compra');
  const data = dados.data_estorno ?? hoje;
  const campos = {};
  if (data > hoje) campos.data_estorno = 'O estorno não pode ter data futura.';
  else if (data < antes.data_compra) campos.data_estorno = 'O estorno não pode ser antes da compra.';
  if (dados.valor_centavos > antes.valor_liquido_centavos) {
    campos.valor_centavos = `O estorno passa do que resta da compra (${formatarDinheiro(antes.valor_liquido_centavos)}).`;
  }
  if (Object.keys(campos).length) throw invalido(campos);

  return esc.transacao(async (tx) => {
    const cartao = await linhaCartao(tx, antes.cartao_id);
    const iso = agora.toISOString();
    let referencia = referenciaDaCompra(hoje, cartao.dia_fechamento);
    while (await faturaTemPagamento(tx, cartao.id, referencia)) referencia = somarMeses(referencia, 1);
    const faturaId = await garantirFatura(tx, cartao, referencia, iso);
    const [{ id }] = await tx.rodar(
      `INSERT INTO estornos_cartao (usuario_id, compra_id, valor_centavos, data_estorno, fatura_id, descricao, criado_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [compraId, dados.valor_centavos, data, faturaId, dados.descricao ?? '', iso],
    );
    await exigirFaturasCoerentes(tx, cartao.id);
    const depois = await obterCompra(tx, compraId);
    await auditar(tx, {
      entidade: 'estorno_cartao',
      id,
      acao: 'criar',
      depois: depois.estornos.find((e) => e.id === id),
    });
    await auditar(tx, { entidade: 'compra_cartao', id: compraId, acao: 'editar', antes, depois });
    return depois;
  });
}

export async function excluirEstorno(esc, id, { agora = new Date() } = {}) {
  const linha = await esc.um(
    `SELECT e.id, e.compra_id FROM estornos_cartao e JOIN compras_cartao c ON c.usuario_id = e.usuario_id AND c.id = e.compra_id
      WHERE e.usuario_id = :u AND e.id = ? AND e.excluido_em IS NULL AND c.excluida_em IS NULL`,
    [id],
  );
  if (!linha) throw naoEncontrado('Estorno');
  const antes = await obterCompra(esc, linha.compra_id);
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE estornos_cartao SET excluido_em = ? WHERE usuario_id = :u AND id = ?', [agora.toISOString(), id]);
    await exigirFaturasCoerentes(tx, antes.cartao_id);
    const depois = await obterCompra(tx, linha.compra_id);
    await auditar(tx, { entidade: 'estorno_cartao', id, acao: 'excluir', antes: antes.estornos.find((e) => e.id === id) });
    await auditar(tx, { entidade: 'compra_cartao', id: linha.compra_id, acao: 'editar', antes, depois });
  });
  return obterCompra(esc, linha.compra_id);
}

/**
 * Antecipação: traz parcelas de faturas futuras para a fatura aberta de hoje. O valor não muda; só o
 * vencimento chega antes. Faturas já pagas não aceitam parcelas novas.
 */
export async function anteciparParcelas(esc, compraId, { parcelas: numeros }, { hoje, agora = new Date() }) {
  const antes = await obterCompra(esc, compraId);
  if (!antes) throw naoEncontrado('Compra');
  const cartao = await linhaCartao(esc, antes.cartao_id);
  const destino = referenciaDaCompra(hoje, cartao.dia_fechamento);

  const escolhidas = [...new Set(numeros)].map((n) => antes.parcelas.find((p) => p.numero === n));
  if (escolhidas.some((p) => !p)) throw invalido({ parcelas: 'Parcela inexistente nesta compra.' });
  const jaChegou = escolhidas.find((p) => p.referencia <= destino);
  if (jaChegou) {
    throw invalido({ parcelas: `A parcela ${jaChegou.numero} já está na fatura atual ou numa anterior.` });
  }
  if (await faturaTemPagamento(esc, cartao.id, destino)) {
    throw conflito('A fatura atual já tem pagamento. Registre a antecipação depois que ela for paga por inteiro.');
  }

  return esc.transacao(async (tx) => {
    const faturaId = await garantirFatura(tx, cartao, destino, agora.toISOString());
    for (const p of escolhidas) {
      await tx.rodar('UPDATE parcelas_cartao SET fatura_id = ? WHERE usuario_id = :u AND compra_id = ? AND numero = ?', [
        faturaId,
        compraId,
        p.numero,
      ]);
    }
    await exigirFaturasCoerentes(tx, cartao.id);
    const depois = await obterCompra(tx, compraId);
    await auditar(tx, { entidade: 'compra_cartao', id: compraId, acao: 'editar', antes, depois });
    return depois;
  });
}

// ---------------------------------------------------------------------------------------------
// Faturas e pagamentos
// ---------------------------------------------------------------------------------------------

export async function faturasDoCartao(esc, cartaoId, hoje) {
  if (!(await linhaCartao(esc, cartaoId))) throw naoEncontrado('Cartão');
  return comStatus(await consolidadasDoCartao(esc, cartaoId), hoje).reverse();
}

export async function projecaoDoCartao(esc, cartaoId, hoje) {
  const cartao = await linhaCartao(esc, cartaoId);
  if (!cartao) throw naoEncontrado('Cartão');
  return projetarFaturas({
    faturas: await consolidadasDoCartao(esc, cartaoId),
    hoje,
    dia_fechamento: cartao.dia_fechamento,
  });
}

/** Fatura com as linhas que a compõem: parcelas, estornos (créditos) e pagamentos. */
export async function obterFatura(esc, id, hoje) {
  const base = await esc.um('SELECT cartao_id FROM faturas WHERE usuario_id = :u AND id = ?', [id]);
  const cartao = base && (await linhaCartao(esc, base.cartao_id));
  const fatura = cartao && comStatus(await consolidadasDoCartao(esc, cartao.id), hoje).find((f) => f.id === id);
  if (!fatura) throw naoEncontrado('Fatura');
  const parcelas = await esc.todos(
    `SELECT c.id AS compra_id, c.descricao, c.data_compra, c.parcelas_total, c.categoria_id,
            p.numero, p.valor_centavos
       FROM parcelas_cartao p JOIN compras_cartao c ON c.usuario_id = p.usuario_id AND c.id = p.compra_id
      WHERE p.usuario_id = :u AND p.fatura_id = ? AND c.excluida_em IS NULL ORDER BY c.data_compra, p.id`,
    [id],
  );
  const estornos = await esc.todos(
    `SELECT e.id, e.valor_centavos, e.data_estorno, e.descricao, c.id AS compra_id, c.descricao AS compra_descricao
       FROM estornos_cartao e JOIN compras_cartao c ON c.usuario_id = e.usuario_id AND c.id = e.compra_id
      WHERE e.usuario_id = :u AND e.fatura_id = ? AND e.excluido_em IS NULL AND c.excluida_em IS NULL
      ORDER BY e.data_estorno, e.id`,
    [id],
  );
  const pagamentos = await esc.todos(
    `SELECT id, conta_id, valor_centavos, data_pagamento FROM pagamentos_fatura
      WHERE usuario_id = :u AND fatura_id = ? AND excluido_em IS NULL ORDER BY data_pagamento, id`,
    [id],
  );
  return { ...fatura, cartao: { id: cartao.id, nome: cartao.nome, conta_pagamento_id: cartao.conta_pagamento_id }, parcelas, estornos, pagamentos };
}

/** Pagamento total ou parcial: debita a conta e abate a fatura. Não cria despesa (RF-04). */
export async function pagarFatura(esc, faturaId, dados, { hoje, agora = new Date() }) {
  const fatura = await obterFatura(esc, faturaId, hoje);
  const data = dados.data_pagamento ?? hoje;
  const campos = {};
  if (data > hoje) campos.data_pagamento = 'O pagamento não pode ter data futura.';
  const conta = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [dados.conta_id]);
  if (!conta) campos.conta_id = 'Conta não encontrada.';
  else if (conta.arquivada) campos.conta_id = 'Esta conta está arquivada.';
  if (fatura.saldo_centavos === 0) {
    campos.valor_centavos = 'Esta fatura não tem nada a pagar.';
  } else if (dados.valor_centavos > fatura.saldo_centavos) {
    campos.valor_centavos = `O valor passa do que falta pagar (${formatarDinheiro(fatura.saldo_centavos)}).`;
  }
  if (Object.keys(campos).length) throw invalido(campos);

  return esc.transacao(async (tx) => {
    const [{ id }] = await tx.rodar(
      `INSERT INTO pagamentos_fatura (usuario_id, fatura_id, conta_id, valor_centavos, data_pagamento, criado_em)
       VALUES (:u, ?, ?, ?, ?, ?) RETURNING id`,
      [faturaId, dados.conta_id, dados.valor_centavos, data, agora.toISOString()],
    );
    await auditar(tx, {
      entidade: 'pagamento_fatura',
      id,
      acao: 'criar',
      depois: { id, fatura_id: faturaId, conta_id: dados.conta_id, valor_centavos: dados.valor_centavos, data_pagamento: data },
    });
    return obterFatura(tx, faturaId, hoje);
  });
}

export async function excluirPagamento(esc, id, { hoje, agora = new Date() }) {
  const antes = await esc.um(
    `SELECT id, fatura_id, conta_id, valor_centavos, data_pagamento FROM pagamentos_fatura
      WHERE usuario_id = :u AND id = ? AND excluido_em IS NULL`,
    [id],
  );
  if (!antes) throw naoEncontrado('Pagamento');
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE pagamentos_fatura SET excluido_em = ? WHERE usuario_id = :u AND id = ?', [agora.toISOString(), id]);
    await auditar(tx, { entidade: 'pagamento_fatura', id, acao: 'excluir', antes });
  });
  return obterFatura(esc, antes.fatura_id, hoje);
}

// ---------------------------------------------------------------------------------------------
// Indicadores para o resumo e para o saldo das contas
// ---------------------------------------------------------------------------------------------

/** Despesas realizadas no cartão no período (compra na data da compra; estorno na data do estorno). */
export async function movimentosDeCartaoDoPeriodo(esc, de, ate) {
  const compras = await esc.todos(
    `SELECT valor_total_centavos, data_compra FROM compras_cartao
      WHERE usuario_id = :u AND excluida_em IS NULL AND data_compra BETWEEN ? AND ?`,
    [de, ate],
  );
  const estornos = await esc.todos(
    `SELECT e.valor_centavos, e.data_estorno FROM estornos_cartao e
       JOIN compras_cartao c ON c.usuario_id = e.usuario_id AND c.id = e.compra_id
      WHERE e.usuario_id = :u AND e.excluido_em IS NULL AND c.excluida_em IS NULL AND e.data_estorno BETWEEN ? AND ?`,
    [de, ate],
  );
  return movimentosDeCartao(compras, estornos);
}

/**
 * Totais dos cartões, ou null se não houver nenhum (nada de zero falso, RF-10). Fatura a pagar conta de
 * todos, inclusive cartão arquivado; limite só dos cartões ativos.
 */
export async function resumoDosCartoes(esc, hoje) {
  const todos = await listarCartoes(esc, hoje);
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
export async function faturasEmAberto(esc, hoje) {
  const cartoes = await esc.todos('SELECT id, nome FROM cartoes WHERE usuario_id = :u AND excluido_em IS NULL');
  const saida = [];
  for (const c of cartoes) {
    const faturas = comStatus(await consolidadasDoCartao(esc, c.id), hoje)
      .filter((f) => f.saldo_centavos > 0)
      .map((f) => ({ ...f, cartao_nome: c.nome }));
    saida.push(...faturas);
  }
  return saida;
}

/** Pagamentos de fatura no formato que `saldo.js` entende: debitam a conta e nada mais. */
export async function pagamentosComoMovimentos(esc) {
  const linhas = await esc.todos('SELECT conta_id, valor_centavos FROM pagamentos_fatura WHERE usuario_id = :u AND excluido_em IS NULL');
  return linhas.map((p) => ({
    tipo: 'pagamento_fatura',
    conta_id: p.conta_id,
    conta_destino_id: null,
    valor_centavos: p.valor_centavos,
    status: 'liquidada',
  }));
}
