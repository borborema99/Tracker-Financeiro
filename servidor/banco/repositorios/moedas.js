import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { saldoNaMoeda, situacaoDaContaMoeda, taxaImplicita, totaisDeMoedas } from '../../dominio/moeda.js';
import { auditar } from '../auditoria.js';

const COLUNAS = 'id, nome, moeda, saldo_inicial_centavos, observacao, criado_em, atualizado_em';

async function operacoesDe(esc, contaMoedaId) {
  const linhas = await esc.todos(
    `SELECT o.id, o.tipo, o.valor_centavos, o.valor_brl_centavos, o.data, o.conta_id, c.nome AS conta_nome, o.observacao
       FROM moeda_operacoes o LEFT JOIN contas c ON c.usuario_id = o.usuario_id AND c.id = o.conta_id
      WHERE o.usuario_id = :u AND o.conta_moeda_id = ? AND o.excluida_em IS NULL ORDER BY o.data DESC, o.id DESC`,
    [contaMoedaId],
  );
  return linhas.map((o) => ({
    ...o,
    taxa_micros: o.valor_brl_centavos == null ? null : taxaImplicita(o.valor_centavos, o.valor_brl_centavos),
  }));
}

export const listarCotacoes = (esc) =>
  esc.todos(
    'SELECT id, moeda, data, taxa_micros FROM moeda_cotacoes WHERE usuario_id = :u AND excluida_em IS NULL ORDER BY data DESC, id DESC',
  );

const obterLinha = async (esc, id) =>
  (await esc.um(`SELECT ${COLUNAS} FROM contas_moeda WHERE usuario_id = :u AND id = ? AND excluido_em IS NULL`, [id])) ?? null;

const paraApi = (linha, operacoes, cotacoes, hoje) => ({ ...linha, ...situacaoDaContaMoeda(linha, operacoes, cotacoes, hoje) });

/** Abertas primeiro, encerradas por último; dentro de cada grupo, por moeda e maior saldo. */
export async function listarContasMoeda(esc, hoje) {
  const cotacoes = await listarCotacoes(esc);
  const linhas = await esc.todos(`SELECT ${COLUNAS} FROM contas_moeda WHERE usuario_id = :u AND excluido_em IS NULL`);
  const contas = [];
  for (const l of linhas) contas.push(paraApi(l, await operacoesDe(esc, l.id), cotacoes, hoje));
  return contas.sort(
    (a, b) =>
      Number(a.encerrada) - Number(b.encerrada) ||
      a.moeda.localeCompare(b.moeda) ||
      b.saldo_centavos - a.saldo_centavos ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

export async function obterContaMoeda(esc, id, hoje) {
  const linha = await obterLinha(esc, id);
  if (!linha) return null;
  const operacoes = await operacoesDe(esc, id);
  return { ...paraApi(linha, operacoes, await listarCotacoes(esc), hoje), operacoes };
}

/** Totais para o início e o patrimônio: só existe com saldo em alguma conta em moeda (RF-10). */
export async function resumoDeMoedas(esc, hoje) {
  return totaisDeMoedas(await listarContasMoeda(esc, hoje));
}

/**
 * Compras e vendas no formato que `saldo.js` entende: compra debita a conta em reais e venda credita, sem virar
 * receita nem despesa. Conta em moeda excluída não tem operação (a exclusão exige conta sem operações).
 */
export async function operacoesDeMoedaComoMovimentos(esc) {
  const linhas = await esc.todos(
    `SELECT o.tipo, o.conta_id, o.valor_brl_centavos FROM moeda_operacoes o
       JOIN contas_moeda m ON m.usuario_id = o.usuario_id AND m.id = o.conta_moeda_id
      WHERE o.usuario_id = :u AND o.excluida_em IS NULL AND m.excluido_em IS NULL AND o.conta_id IS NOT NULL`,
  );
  return linhas.map((o) => ({
    tipo: o.tipo === 'compra' ? 'compra_moeda' : 'venda_moeda',
    conta_id: o.conta_id,
    conta_destino_id: null,
    valor_centavos: o.valor_brl_centavos,
    status: 'liquidada',
  }));
}

export async function criarContaMoeda(esc, dados, { hoje, agora = new Date() }) {
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    const [{ id }] = await tx.rodar(
      `INSERT INTO contas_moeda (usuario_id, nome, moeda, saldo_inicial_centavos, observacao, criado_em, atualizado_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [dados.nome, dados.moeda, dados.saldo_inicial_centavos, dados.observacao, iso, iso],
    );
    await auditar(tx, { entidade: 'conta_moeda', id, acao: 'criar', depois: await obterLinha(tx, id) });
    return obterContaMoeda(tx, id, hoje);
  });
}

export async function atualizarContaMoeda(esc, id, dados, { hoje, agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Conta em moeda estrangeira');
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE contas_moeda SET nome = ?, observacao = ?, atualizado_em = ? WHERE usuario_id = :u AND id = ?', [
      dados.nome,
      dados.observacao,
      agora.toISOString(),
      id,
    ]);
    await auditar(tx, { entidade: 'conta_moeda', id, acao: 'editar', antes, depois: await obterLinha(tx, id) });
    return obterContaMoeda(tx, id, hoje);
  });
}

/** Só exclui conta sem operações (RF-08): com operações, o caminho é sacar ou vender tudo, que a encerra. */
export async function excluirContaMoeda(esc, id, { agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Conta em moeda estrangeira');
  if ((await operacoesDe(esc, id)).length > 0) {
    throw conflito('Esta conta tem operações. Para encerrá-la, saque ou venda todo o saldo.');
  }
  const iso = agora.toISOString();
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE contas_moeda SET excluido_em = ?, atualizado_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, id]);
    await auditar(tx, { entidade: 'conta_moeda', id, acao: 'excluir', antes });
  });
}

async function validarContaEmReais(esc, contaId) {
  const conta = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [contaId]);
  if (!conta) throw invalido({ conta_id: 'Conta não encontrada.' });
  if (conta.arquivada) throw invalido({ conta_id: 'Esta conta está arquivada.' });
}

/**
 * Depósito, saque, compra ou venda (RF-28, RF-29). A data não pode ser futura. Saque e venda maiores que o saldo
 * são recusados: a conta nunca fica negativa. Compra e venda mexem na conta em reais, sem virar receita nem despesa.
 */
export async function registrarOperacaoMoeda(esc, contaMoedaId, dados, { hoje, agora = new Date() }) {
  const conta = await obterLinha(esc, contaMoedaId);
  if (!conta) throw naoEncontrado('Conta em moeda estrangeira');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  if (dados.conta_id != null) await validarContaEmReais(esc, dados.conta_id);
  const comConta = dados.tipo === 'compra' || dados.tipo === 'venda';
  const nova = {
    conta_moeda_id: contaMoedaId,
    tipo: dados.tipo,
    valor_centavos: dados.valor_centavos,
    valor_brl_centavos: comConta ? dados.valor_brl_centavos : null,
    data: dados.data,
    conta_id: comConta ? dados.conta_id : null,
    observacao: dados.observacao,
  };
  return esc.transacao(async (tx) => {
    if (saldoNaMoeda(conta.saldo_inicial_centavos, [...(await operacoesDe(tx, contaMoedaId)), nova]) < 0) {
      throw conflito(
        dados.tipo === 'venda' ? 'A venda é maior que o saldo da conta.' : 'O saque é maior que o saldo da conta.',
      );
    }
    const [{ id }] = await tx.rodar(
      `INSERT INTO moeda_operacoes
         (usuario_id, conta_moeda_id, tipo, valor_centavos, valor_brl_centavos, data, conta_id, observacao, criada_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [nova.conta_moeda_id, nova.tipo, nova.valor_centavos, nova.valor_brl_centavos, nova.data, nova.conta_id, nova.observacao, agora.toISOString()],
    );
    await auditar(tx, { entidade: 'moeda_operacao', id, acao: 'criar', depois: nova });
    return obterContaMoeda(tx, contaMoedaId, hoje);
  });
}

/** Remove uma operação; se o saldo ficasse negativo, é recusado. */
export async function excluirOperacaoMoeda(esc, contaMoedaId, operacaoId, { hoje, agora = new Date() }) {
  const conta = await obterLinha(esc, contaMoedaId);
  if (!conta) throw naoEncontrado('Conta em moeda estrangeira');
  const operacoes = await operacoesDe(esc, contaMoedaId);
  const alvo = operacoes.find((o) => o.id === operacaoId);
  if (!alvo) throw naoEncontrado('Operação');
  if (saldoNaMoeda(conta.saldo_inicial_centavos, operacoes.filter((o) => o.id !== operacaoId)) < 0) {
    throw conflito('Remover esta operação deixaria o saldo negativo. Remova antes as operações seguintes que dependem dela.');
  }
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE moeda_operacoes SET excluida_em = ? WHERE usuario_id = :u AND id = ?', [agora.toISOString(), operacaoId]);
    await auditar(tx, { entidade: 'moeda_operacao', id: operacaoId, acao: 'excluir', antes: { conta_moeda_id: contaMoedaId, ...alvo } });
    return obterContaMoeda(tx, contaMoedaId, hoje);
  });
}

/** Informa a cotação de uma moeda numa data (RF-30). Uma por moeda e data; não pode ser futura. */
export async function registrarCotacao(esc, dados, { hoje, agora = new Date() }) {
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  return esc.transacao(async (tx) => {
    const repetida = await tx.um(
      'SELECT 1 AS um FROM moeda_cotacoes WHERE usuario_id = :u AND moeda = ? AND data = ? AND excluida_em IS NULL',
      [dados.moeda, dados.data],
    );
    if (repetida) throw conflito('Já existe uma cotação dessa moeda nessa data. Exclua a anterior para registrar outra.');
    const [{ id }] = await tx.rodar(
      'INSERT INTO moeda_cotacoes (usuario_id, moeda, data, taxa_micros, criada_em) VALUES (:u, ?, ?, ?, ?) RETURNING id',
      [dados.moeda, dados.data, dados.taxa_micros, agora.toISOString()],
    );
    await auditar(tx, { entidade: 'moeda_cotacao', id, acao: 'criar', depois: dados });
    return listarCotacoes(tx);
  });
}

export async function excluirCotacao(esc, id, { agora = new Date() }) {
  const antes = await esc.um(
    'SELECT id, moeda, data, taxa_micros FROM moeda_cotacoes WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL',
    [id],
  );
  if (!antes) throw naoEncontrado('Cotação');
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE moeda_cotacoes SET excluida_em = ? WHERE usuario_id = :u AND id = ?', [agora.toISOString(), id]);
    await auditar(tx, { entidade: 'moeda_cotacao', id, acao: 'excluir', antes });
    return listarCotacoes(tx);
  });
}
