import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { situacaoDoInvestimento, totaisDaCarteira, ultimaAvaliacao, valorAtual } from '../../dominio/investimento.js';
import { auditar } from '../auditoria.js';

const COLUNAS = 'id, nome, tipo, instituicao, observacao, criado_em, atualizado_em';

const dataBr = (iso) => iso.split('-').reverse().join('/');

function operacoesDe(db, investimentoId) {
  return db
    .prepare(
      `SELECT o.id, o.tipo, o.valor_centavos, o.data, o.conta_id, c.nome AS conta_nome, o.observacao
         FROM investimentos_operacoes o LEFT JOIN contas c ON c.id = o.conta_id
        WHERE o.investimento_id = ? AND o.excluida_em IS NULL ORDER BY o.data DESC, o.id DESC`,
    )
    .all(investimentoId);
}

function avaliacoesDe(db, investimentoId) {
  return db
    .prepare(
      `SELECT id, data, valor_centavos FROM investimentos_avaliacoes
        WHERE investimento_id = ? AND excluida_em IS NULL ORDER BY data DESC, id DESC`,
    )
    .all(investimentoId);
}

const obterLinha = (db, id) =>
  db.prepare(`SELECT ${COLUNAS} FROM investimentos WHERE id = ? AND excluido_em IS NULL`).get(id) ?? null;

const paraApi = (linha, operacoes, avaliacoes) => ({ ...linha, ...situacaoDoInvestimento(operacoes, avaliacoes) });

/** Carteira: em aberto primeiro (maior valor), encerrados por último. */
export function listarInvestimentos(db) {
  return db
    .prepare(`SELECT ${COLUNAS} FROM investimentos WHERE excluido_em IS NULL`)
    .all()
    .map((l) => paraApi(l, operacoesDe(db, l.id), avaliacoesDe(db, l.id)))
    .sort(
      (a, b) =>
        Number(a.encerrado) - Number(b.encerrado) ||
        b.valor_atual_centavos - a.valor_atual_centavos ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

/** Um investimento com a situação calculada, as operações e as avaliações. */
export function obterInvestimento(db, id) {
  const linha = obterLinha(db, id);
  if (!linha) return null;
  const operacoes = operacoesDe(db, id);
  const avaliacoes = avaliacoesDe(db, id);
  return { ...paraApi(linha, operacoes, avaliacoes), operacoes, avaliacoes };
}

/** Totais da carteira para o início e o patrimônio: só existe com algum investimento com valor (RF-10). */
export function resumoDeInvestimentos(db) {
  const todos = listarInvestimentos(db);
  if (!todos.some((i) => i.valor_atual_centavos > 0)) return null;
  return totaisDaCarteira(todos);
}

/**
 * Operações com conta no formato que `saldo.js` entende: aporte debita a conta e resgate credita, sem virar
 * receita nem despesa. Investimento excluído não tem operação (a exclusão exige carteira sem operações).
 */
export function operacoesComoMovimentos(db) {
  return db
    .prepare(
      `SELECT o.tipo, o.conta_id, o.valor_centavos FROM investimentos_operacoes o
         JOIN investimentos i ON i.id = o.investimento_id
        WHERE o.excluida_em IS NULL AND i.excluido_em IS NULL AND o.conta_id IS NOT NULL`,
    )
    .all()
    .map((o) => ({
      tipo: o.tipo === 'aporte' ? 'aporte_investimento' : 'resgate_investimento',
      conta_id: o.conta_id,
      conta_destino_id: null,
      valor_centavos: o.valor_centavos,
      status: 'liquidada',
    }));
}

const normalizar = (d) => ({ nome: d.nome, tipo: d.tipo, instituicao: d.instituicao, observacao: d.observacao });

export function criarInvestimento(db, dados, { agora = new Date() }) {
  const iso = agora.toISOString();
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO investimentos (nome, tipo, instituicao, observacao, criado_em, atualizado_em)
         VALUES (@nome, @tipo, @instituicao, @observacao, @iso, @iso)`,
      )
      .run({ ...normalizar(dados), iso });
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'investimento', id, acao: 'criar', depois: obterLinha(db, id) });
    return obterInvestimento(db, id);
  })();
}

export function atualizarInvestimento(db, id, dados, { agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Investimento');
  return db.transaction(() => {
    db.prepare(
      `UPDATE investimentos SET nome = @nome, tipo = @tipo, instituicao = @instituicao, observacao = @observacao,
         atualizado_em = @iso WHERE id = @id`,
    ).run({ ...normalizar(dados), id, iso: agora.toISOString() });
    auditar(db, { entidade: 'investimento', id, acao: 'editar', antes, depois: obterLinha(db, id) });
    return obterInvestimento(db, id);
  })();
}

/** Só exclui investimento sem operações (RF-08): com operações, o caminho é o resgate total, que o encerra. */
export function excluirInvestimento(db, id, { agora = new Date() }) {
  const antes = obterLinha(db, id);
  if (!antes) throw naoEncontrado('Investimento');
  if (operacoesDe(db, id).length > 0) {
    throw conflito('Este investimento tem aportes ou resgates. Registre o resgate total para encerrá-lo.');
  }
  const iso = agora.toISOString();
  db.transaction(() => {
    db.prepare('UPDATE investimentos SET excluido_em = ?, atualizado_em = ? WHERE id = ?').run(iso, iso, id);
    db.prepare('UPDATE investimentos_avaliacoes SET excluida_em = ? WHERE investimento_id = ? AND excluida_em IS NULL').run(iso, id);
    auditar(db, { entidade: 'investimento', id, acao: 'excluir', antes });
  })();
}

function validarConta(db, contaId) {
  if (contaId == null) return;
  const conta = db.prepare('SELECT arquivada FROM contas WHERE id = ? AND excluida_em IS NULL').get(contaId);
  if (!conta) throw invalido({ conta_id: 'Conta não encontrada.' });
  if (conta.arquivada === 1) throw invalido({ conta_id: 'Esta conta está arquivada.' });
}

/**
 * Aporte ou resgate (RF-19). A data não pode ser futura nem anterior à última avaliação (que já inclui as operações
 * até a data dela). Resgate maior que o valor atual é recusado: o investimento nunca fica negativo.
 */
export function registrarOperacao(db, investimentoId, dados, { hoje, agora = new Date() }) {
  if (!obterLinha(db, investimentoId)) throw naoEncontrado('Investimento');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  validarConta(db, dados.conta_id);
  return db.transaction(() => {
    const operacoes = operacoesDe(db, investimentoId);
    const avaliacoes = avaliacoesDe(db, investimentoId);
    const ultima = ultimaAvaliacao(avaliacoes);
    if (ultima && dados.data <= ultima.data) {
      throw conflito(
        `A última avaliação é de ${dataBr(ultima.data)} e já inclui as operações até essa data. ` +
          'Registre a operação com data posterior ou exclua a avaliação antes.',
      );
    }
    const nova = { tipo: dados.tipo, valor_centavos: dados.valor_centavos, data: dados.data };
    if (valorAtual([...operacoes, nova], avaliacoes).valor_centavos < 0) {
      throw conflito('O resgate é maior que o valor atual do investimento.');
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO investimentos_operacoes (investimento_id, tipo, valor_centavos, data, conta_id, observacao, criada_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(investimentoId, dados.tipo, dados.valor_centavos, dados.data, dados.conta_id ?? null, dados.observacao, agora.toISOString());
    const id = Number(lastInsertRowid);
    auditar(db, {
      entidade: 'investimento_operacao',
      id,
      acao: 'criar',
      depois: { investimento_id: investimentoId, ...dados, conta_id: dados.conta_id ?? null },
    });
    return obterInvestimento(db, investimentoId);
  })();
}

/** Remove uma operação; se o valor atual ficasse negativo, é recusado. */
export function excluirOperacao(db, investimentoId, operacaoId, { agora = new Date() }) {
  if (!obterLinha(db, investimentoId)) throw naoEncontrado('Investimento');
  const operacoes = operacoesDe(db, investimentoId);
  const alvo = operacoes.find((o) => o.id === operacaoId);
  if (!alvo) throw naoEncontrado('Operação');
  const avaliacoes = avaliacoesDe(db, investimentoId);
  if (valorAtual(operacoes.filter((o) => o.id !== operacaoId), avaliacoes).valor_centavos < 0) {
    throw conflito('Remover esta operação deixaria o valor do investimento negativo. Remova o resgate antes.');
  }
  return db.transaction(() => {
    db.prepare('UPDATE investimentos_operacoes SET excluida_em = ? WHERE id = ?').run(agora.toISOString(), operacaoId);
    auditar(db, { entidade: 'investimento_operacao', id: operacaoId, acao: 'excluir', antes: { investimento_id: investimentoId, ...alvo } });
    return obterInvestimento(db, investimentoId);
  })();
}

/** Informa o valor do investimento numa data (RF-20). Uma avaliação por data; não pode ser futura. */
export function registrarAvaliacao(db, investimentoId, dados, { hoje, agora = new Date() }) {
  if (!obterLinha(db, investimentoId)) throw naoEncontrado('Investimento');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  return db.transaction(() => {
    if (avaliacoesDe(db, investimentoId).some((a) => a.data === dados.data)) {
      throw conflito('Já existe uma avaliação nessa data. Exclua a anterior para registrar outra.');
    }
    const { lastInsertRowid } = db
      .prepare('INSERT INTO investimentos_avaliacoes (investimento_id, data, valor_centavos, criada_em) VALUES (?, ?, ?, ?)')
      .run(investimentoId, dados.data, dados.valor_centavos, agora.toISOString());
    const id = Number(lastInsertRowid);
    auditar(db, { entidade: 'investimento_avaliacao', id, acao: 'criar', depois: { investimento_id: investimentoId, ...dados } });
    return obterInvestimento(db, investimentoId);
  })();
}

/** Remove uma avaliação; se o valor atual ficasse negativo, é recusado. */
export function excluirAvaliacao(db, investimentoId, avaliacaoId, { agora = new Date() }) {
  if (!obterLinha(db, investimentoId)) throw naoEncontrado('Investimento');
  const avaliacoes = avaliacoesDe(db, investimentoId);
  const alvo = avaliacoes.find((a) => a.id === avaliacaoId);
  if (!alvo) throw naoEncontrado('Avaliação');
  if (valorAtual(operacoesDe(db, investimentoId), avaliacoes.filter((a) => a.id !== avaliacaoId)).valor_centavos < 0) {
    throw conflito('Remover esta avaliação deixaria o valor do investimento negativo.');
  }
  return db.transaction(() => {
    db.prepare('UPDATE investimentos_avaliacoes SET excluida_em = ? WHERE id = ?').run(agora.toISOString(), avaliacaoId);
    auditar(db, { entidade: 'investimento_avaliacao', id: avaliacaoId, acao: 'excluir', antes: { investimento_id: investimentoId, ...alvo } });
    return obterInvestimento(db, investimentoId);
  })();
}
