import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { saldoNaMoeda, situacaoDaContaMoeda, taxaImplicita, totaisDeMoedas } from '../../dominio/moeda.js';
import { auditar } from '../auditoria.js';

const COLUNAS = 'id, nome, moeda, saldo_inicial_centavos, observacao, criado_em, atualizado_em';

function operacoesDe(db, contaMoedaId) {
  return db
    .prepare(
      `SELECT o.id, o.tipo, o.valor_centavos, o.valor_brl_centavos, o.data, o.conta_id, c.nome AS conta_nome, o.observacao
         FROM moeda_operacoes o LEFT JOIN contas c ON c.id = o.conta_id
        WHERE o.conta_moeda_id = ? AND o.excluida_em IS NULL ORDER BY o.data DESC, o.id DESC`,
    )
    .all(contaMoedaId)
    .map((o) => ({
      ...o,
      taxa_micros: o.valor_brl_centavos == null ? null : taxaImplicita(o.valor_centavos, o.valor_brl_centavos),
    }));
}

export function listarCotacoes(db) {
  return db
    .prepare('SELECT id, moeda, data, taxa_micros FROM moeda_cotacoes WHERE excluida_em IS NULL ORDER BY data DESC, id DESC')
    .all();
}

const obterLinha = (db, id) =>
  db.prepare(`SELECT ${COLUNAS} FROM contas_moeda WHERE id = ? AND excluido_em IS NULL`).get(id) ?? null;

const paraApi = (linha, operacoes, cotacoes, hoje) => ({ ...linha, ...situacaoDaContaMoeda(linha, operacoes, cotacoes, hoje) });

/** Abertas primeiro, encerradas por último; dentro de cada grupo, por moeda e maior saldo. */
export function listarContasMoeda(db, hoje) {
  const cotacoes = listarCotacoes(db);
  return db
    .prepare(`SELECT ${COLUNAS} FROM contas_moeda WHERE excluido_em IS NULL`)
    .all()
    .map((l) => paraApi(l, operacoesDe(db, l.id), cotacoes, hoje))
    .sort(
      (a, b) =>
        Number(a.encerrada) - Number(b.encerrada) ||
        a.moeda.localeCompare(b.moeda) ||
        b.saldo_centavos - a.saldo_centavos ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

export function obterContaMoeda(db, id, hoje) {
  const linha = obterLinha(db, id);
  if (!linha) return null;
  const operacoes = operacoesDe(db, id);
  return { ...paraApi(linha, operacoes, listarCotacoes(db), hoje), operacoes };
}

/** Totais para o início e o patrimônio: só existe com saldo em alguma conta em moeda (RF-10). */
export function resumoDeMoedas(db, hoje) {
  return totaisDeMoedas(listarContasMoeda(db, hoje));
}

/**
 * Compras e vendas no formato que `saldo.js` entende: compra debita a conta em reais e venda credita, sem virar
 * receita nem despesa. Conta em moeda excluída não tem operação (a exclusão exige conta sem operações).
 */
export function operacoesDeMoedaComoMovimentos(db) {
  return db
    .prepare(
      `SELECT o.tipo, o.conta_id, o.valor_brl_centavos FROM moeda_operacoes o
         JOIN contas_moeda m ON m.id = o.conta_moeda_id
        WHERE o.excluida_em IS NULL AND m.excluido_em IS NULL AND o.conta_id IS NOT NULL`,
    )
    .all()
    .map((o) => ({
      tipo: o.tipo === 'compra' ? 'compra_moeda' : 'venda_moeda',
      conta_id: o.conta_id,
      conta_destino_id: null,
      valor_centavos: o.valor_brl_centavos,
      status: 'liquidada',
    }));
}

export function criarContaMoeda(db, dados, { hoje, agora = new Date() }) {
  const iso = agora.toISOString();
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO contas_moeda (nome, moeda, saldo_inicial_centavos, observacao, criado_em, atualizado_em)
         VALUES (@nome, @moeda, @saldo_inicial_centavos, @observacao, @iso, @iso)`,
      )
      .run({
        nome: dados.nome,
        moeda: dados.moeda,
        saldo_inicial_centavos: dados.saldo_inicial_centavos,
        observacao: dados.observacao,
        iso,
      });
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'conta_moeda', id, acao: 'criar', depois: obterLinha(db, id) });
    return obterContaMoeda(db, id, hoje);
  })();
}

export function atualizarContaMoeda(db, id, dados, { hoje, agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Conta em moeda estrangeira');
  return db.transaction(() => {
    db.prepare('UPDATE contas_moeda SET nome = ?, observacao = ?, atualizado_em = ? WHERE id = ?').run(
      dados.nome,
      dados.observacao,
      agora.toISOString(),
      id,
    );
    auditar(db, { entidade: 'conta_moeda', id, acao: 'editar', antes, depois: obterLinha(db, id) });
    return obterContaMoeda(db, id, hoje);
  })();
}

/** Só exclui conta sem operações (RF-08): com operações, o caminho é sacar ou vender tudo, que a encerra. */
export function excluirContaMoeda(db, id, { agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Conta em moeda estrangeira');
  if (operacoesDe(db, id).length > 0) {
    throw conflito('Esta conta tem operações. Para encerrá-la, saque ou venda todo o saldo.');
  }
  const iso = agora.toISOString();
  db.transaction(() => {
    db.prepare('UPDATE contas_moeda SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(iso, iso, id);
    auditar(db, { entidade: 'conta_moeda', id, acao: 'excluir', antes });
  })();
}

function validarContaEmReais(db, contaId) {
  const conta = db.prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL').get(contaId);
  if (!conta) throw invalido({ conta_id: 'Conta não encontrada.' });
  if (conta.arquivada === 1) throw invalido({ conta_id: 'Esta conta está arquivada.' });
}

/**
 * Depósito, saque, compra ou venda (RF-28, RF-29). A data não pode ser futura. Saque e venda maiores que o saldo
 * são recusados: a conta nunca fica negativa. Compra e venda mexem na conta em reais, sem virar receita nem despesa.
 */
export function registrarOperacaoMoeda(db, contaMoedaId, dados, { hoje, agora = new Date() }) {
  const conta = obterLinha(db, contaMoedaId);
  if (!conta) throw naoEncontrado('Conta em moeda estrangeira');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  if (dados.conta_id != null) validarContaEmReais(db, dados.conta_id);
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
  return db.transaction(() => {
    if (saldoNaMoeda(conta.saldo_inicial_centavos, [...operacoesDe(db, contaMoedaId), nova]) < 0) {
      throw conflito(
        dados.tipo === 'venda' ? 'A venda é maior que o saldo da conta.' : 'O saque é maior que o saldo da conta.',
      );
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO moeda_operacoes
           (conta_moeda_id, tipo, valor_centavos, valor_brl_centavos, data, conta_id, observacao, criada_em)
         VALUES (@conta_moeda_id, @tipo, @valor_centavos, @valor_brl_centavos, @data, @conta_id, @observacao, @iso)`,
      )
      .run({ ...nova, iso: agora.toISOString() });
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'moeda_operacao', id, acao: 'criar', depois: nova });
    return obterContaMoeda(db, contaMoedaId, hoje);
  })();
}

/** Remove uma operação; se o saldo ficasse negativo, é recusado. */
export function excluirOperacaoMoeda(db, contaMoedaId, operacaoId, { hoje, agora = new Date() }) {
  const conta = obterLinha(db, contaMoedaId);
  if (!conta) throw naoEncontrado('Conta em moeda estrangeira');
  const operacoes = operacoesDe(db, contaMoedaId);
  const alvo = operacoes.find((o) => o.id === operacaoId);
  if (!alvo) throw naoEncontrado('Operação');
  if (saldoNaMoeda(conta.saldo_inicial_centavos, operacoes.filter((o) => o.id !== operacaoId)) < 0) {
    throw conflito('Remover esta operação deixaria o saldo negativo. Remova antes as operações seguintes que dependem dela.');
  }
  return db.transaction(() => {
    db.prepare('UPDATE moeda_operacoes SET excluida_em = ? WHERE id = ?').run(agora.toISOString(), operacaoId);
    auditar(db, { entidade: 'moeda_operacao', id: operacaoId, acao: 'excluir', antes: { conta_moeda_id: contaMoedaId, ...alvo } });
    return obterContaMoeda(db, contaMoedaId, hoje);
  })();
}

/** Informa a cotação de uma moeda numa data (RF-30). Uma por moeda e data; não pode ser futura. */
export function registrarCotacao(db, dados, { hoje, agora = new Date() }) {
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  return db.transaction(() => {
    const repetida = db
      .prepare('SELECT 1 FROM moeda_cotacoes WHERE moeda = ? AND data = ? AND excluida_em IS NULL')
      .get(dados.moeda, dados.data);
    if (repetida) throw conflito('Já existe uma cotação dessa moeda nessa data. Exclua a anterior para registrar outra.');
    const { lastInsertRowid } = db
      .prepare('INSERT INTO moeda_cotacoes (moeda, data, taxa_micros, criada_em) VALUES (?, ?, ?, ?)')
      .run(dados.moeda, dados.data, dados.taxa_micros, agora.toISOString());
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'moeda_cotacao', id, acao: 'criar', depois: dados });
    return listarCotacoes(db);
  })();
}

export function excluirCotacao(db, id, { agora = new Date() }) {
  const antes = db
    .prepare('SELECT id, moeda, data, taxa_micros FROM moeda_cotacoes WHERE id = ? AND excluida_em IS NULL')
    .get(id);
  if (!antes) throw naoEncontrado('Cotação');
  return db.transaction(() => {
    db.prepare('UPDATE moeda_cotacoes SET excluida_em = ? WHERE id = ?').run(agora.toISOString(), id);
    auditar(db, { entidade: 'moeda_cotacao', id, acao: 'excluir', antes });
    return listarCotacoes(db);
  })();
}
