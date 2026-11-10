import { conflito, invalido, naoEncontrado } from '../../erros.js';
import { situacaoDoInvestimento, totaisDaCarteira, ultimaAvaliacao, valorAtual } from '../../dominio/investimento.js';
import { auditar } from '../auditoria.js';

const COLUNAS = 'id, nome, tipo, instituicao, observacao, criado_em, atualizado_em';

const dataBr = (iso) => iso.split('-').reverse().join('/');

const operacoesDe = (esc, investimentoId) =>
  esc.todos(
    `SELECT o.id, o.tipo, o.valor_centavos, o.data, o.conta_id, c.nome AS conta_nome, o.observacao
       FROM investimentos_operacoes o LEFT JOIN contas c ON c.usuario_id = o.usuario_id AND c.id = o.conta_id
      WHERE o.usuario_id = :u AND o.investimento_id = ? AND o.excluida_em IS NULL ORDER BY o.data DESC, o.id DESC`,
    [investimentoId],
  );

const avaliacoesDe = (esc, investimentoId) =>
  esc.todos(
    `SELECT id, data, valor_centavos FROM investimentos_avaliacoes
      WHERE usuario_id = :u AND investimento_id = ? AND excluida_em IS NULL ORDER BY data DESC, id DESC`,
    [investimentoId],
  );

const obterLinha = async (esc, id) =>
  (await esc.um(`SELECT ${COLUNAS} FROM investimentos WHERE usuario_id = :u AND id = ? AND excluido_em IS NULL`, [id])) ?? null;

const paraApi = (linha, operacoes, avaliacoes) => ({ ...linha, ...situacaoDoInvestimento(operacoes, avaliacoes) });

/** Carteira: em aberto primeiro (maior valor), encerrados por último. */
export async function listarInvestimentos(esc) {
  const linhas = await esc.todos(`SELECT ${COLUNAS} FROM investimentos WHERE usuario_id = :u AND excluido_em IS NULL`);
  const todos = [];
  for (const l of linhas) todos.push(paraApi(l, await operacoesDe(esc, l.id), await avaliacoesDe(esc, l.id)));
  return todos.sort(
    (a, b) =>
      Number(a.encerrado) - Number(b.encerrado) ||
      b.valor_atual_centavos - a.valor_atual_centavos ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Um investimento com a situação calculada, as operações e as avaliações. */
export async function obterInvestimento(esc, id) {
  const linha = await obterLinha(esc, id);
  if (!linha) return null;
  const operacoes = await operacoesDe(esc, id);
  const avaliacoes = await avaliacoesDe(esc, id);
  return { ...paraApi(linha, operacoes, avaliacoes), operacoes, avaliacoes };
}

/** Totais da carteira para o início e o patrimônio: só existe com algum investimento com valor (RF-10). */
export async function resumoDeInvestimentos(esc) {
  const todos = await listarInvestimentos(esc);
  if (!todos.some((i) => i.valor_atual_centavos > 0)) return null;
  return totaisDaCarteira(todos);
}

/**
 * Operações com conta no formato que `saldo.js` entende: aporte debita a conta e resgate credita, sem virar
 * receita nem despesa. Investimento excluído não tem operação (a exclusão exige carteira sem operações).
 */
export async function operacoesComoMovimentos(esc) {
  const linhas = await esc.todos(
    `SELECT o.tipo, o.conta_id, o.valor_centavos FROM investimentos_operacoes o
       JOIN investimentos i ON i.usuario_id = o.usuario_id AND i.id = o.investimento_id
      WHERE o.usuario_id = :u AND o.excluida_em IS NULL AND i.excluido_em IS NULL AND o.conta_id IS NOT NULL`,
  );
  return linhas.map((o) => ({
    tipo: o.tipo === 'aporte' ? 'aporte_investimento' : 'resgate_investimento',
    conta_id: o.conta_id,
    conta_destino_id: null,
    valor_centavos: o.valor_centavos,
    status: 'liquidada',
  }));
}

const normalizar = (d) => [d.nome, d.tipo, d.instituicao, d.observacao];

export async function criarInvestimento(esc, dados, { agora = new Date() }) {
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    const [{ id }] = await tx.rodar(
      `INSERT INTO investimentos (usuario_id, nome, tipo, instituicao, observacao, criado_em, atualizado_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [...normalizar(dados), iso, iso],
    );
    await auditar(tx, { entidade: 'investimento', id, acao: 'criar', depois: await obterLinha(tx, id) });
    return obterInvestimento(tx, id);
  });
}

export async function atualizarInvestimento(esc, id, dados, { agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Investimento');
  return esc.transacao(async (tx) => {
    await tx.rodar(
      `UPDATE investimentos SET nome = ?, tipo = ?, instituicao = ?, observacao = ?,
         atualizado_em = ? WHERE usuario_id = :u AND id = ?`,
      [...normalizar(dados), agora.toISOString(), id],
    );
    await auditar(tx, { entidade: 'investimento', id, acao: 'editar', antes, depois: await obterLinha(tx, id) });
    return obterInvestimento(tx, id);
  });
}

/** Só exclui investimento sem operações (RF-08): com operações, o caminho é o resgate total, que o encerra. */
export async function excluirInvestimento(esc, id, { agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Investimento');
  if ((await operacoesDe(esc, id)).length > 0) {
    throw conflito('Este investimento tem aportes ou resgates. Registre o resgate total para encerrá-lo.');
  }
  const iso = agora.toISOString();
  await esc.transacao(async (tx) => {
    await tx.rodar('UPDATE investimentos SET excluido_em = ?, atualizado_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, id]);
    await tx.rodar(
      'UPDATE investimentos_avaliacoes SET excluida_em = ? WHERE usuario_id = :u AND investimento_id = ? AND excluida_em IS NULL',
      [iso, id],
    );
    await auditar(tx, { entidade: 'investimento', id, acao: 'excluir', antes });
  });
}

async function validarConta(esc, contaId) {
  if (contaId == null) return;
  const conta = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [contaId]);
  if (!conta) throw invalido({ conta_id: 'Conta não encontrada.' });
  if (conta.arquivada) throw invalido({ conta_id: 'Esta conta está arquivada.' });
}

/**
 * Aporte ou resgate (RF-19). A data não pode ser futura nem anterior à última avaliação (que já inclui as operações
 * até a data dela). Resgate maior que o valor atual é recusado: o investimento nunca fica negativo.
 */
export async function registrarOperacao(esc, investimentoId, dados, { hoje, agora = new Date() }) {
  if (!(await obterLinha(esc, investimentoId))) throw naoEncontrado('Investimento');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  await validarConta(esc, dados.conta_id);
  return esc.transacao(async (tx) => {
    const operacoes = await operacoesDe(tx, investimentoId);
    const avaliacoes = await avaliacoesDe(tx, investimentoId);
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
    const [{ id }] = await tx.rodar(
      `INSERT INTO investimentos_operacoes (usuario_id, investimento_id, tipo, valor_centavos, data, conta_id, observacao, criada_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [investimentoId, dados.tipo, dados.valor_centavos, dados.data, dados.conta_id ?? null, dados.observacao, agora.toISOString()],
    );
    await auditar(tx, {
      entidade: 'investimento_operacao',
      id,
      acao: 'criar',
      depois: { investimento_id: investimentoId, ...dados, conta_id: dados.conta_id ?? null },
    });
    return obterInvestimento(tx, investimentoId);
  });
}

/** Remove uma operação; se o valor atual ficasse negativo, é recusado. */
export async function excluirOperacao(esc, investimentoId, operacaoId, { agora = new Date() }) {
  if (!(await obterLinha(esc, investimentoId))) throw naoEncontrado('Investimento');
  const operacoes = await operacoesDe(esc, investimentoId);
  const alvo = operacoes.find((o) => o.id === operacaoId);
  if (!alvo) throw naoEncontrado('Operação');
  const avaliacoes = await avaliacoesDe(esc, investimentoId);
  if (valorAtual(operacoes.filter((o) => o.id !== operacaoId), avaliacoes).valor_centavos < 0) {
    throw conflito('Remover esta operação deixaria o valor do investimento negativo. Remova o resgate antes.');
  }
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE investimentos_operacoes SET excluida_em = ? WHERE usuario_id = :u AND id = ?', [agora.toISOString(), operacaoId]);
    await auditar(tx, { entidade: 'investimento_operacao', id: operacaoId, acao: 'excluir', antes: { investimento_id: investimentoId, ...alvo } });
    return obterInvestimento(tx, investimentoId);
  });
}

/** Informa o valor do investimento numa data (RF-20). Uma avaliação por data; não pode ser futura. */
export async function registrarAvaliacao(esc, investimentoId, dados, { hoje, agora = new Date() }) {
  if (!(await obterLinha(esc, investimentoId))) throw naoEncontrado('Investimento');
  if (dados.data > hoje) throw invalido({ data: 'A data não pode ser no futuro.' });
  return esc.transacao(async (tx) => {
    if ((await avaliacoesDe(tx, investimentoId)).some((a) => a.data === dados.data)) {
      throw conflito('Já existe uma avaliação nessa data. Exclua a anterior para registrar outra.');
    }
    const [{ id }] = await tx.rodar(
      `INSERT INTO investimentos_avaliacoes (usuario_id, investimento_id, data, valor_centavos, criada_em)
       VALUES (:u, ?, ?, ?, ?) RETURNING id`,
      [investimentoId, dados.data, dados.valor_centavos, agora.toISOString()],
    );
    await auditar(tx, { entidade: 'investimento_avaliacao', id, acao: 'criar', depois: { investimento_id: investimentoId, ...dados } });
    return obterInvestimento(tx, investimentoId);
  });
}

/** Remove uma avaliação; se o valor atual ficasse negativo, é recusado. */
export async function excluirAvaliacao(esc, investimentoId, avaliacaoId, { agora = new Date() }) {
  if (!(await obterLinha(esc, investimentoId))) throw naoEncontrado('Investimento');
  const avaliacoes = await avaliacoesDe(esc, investimentoId);
  const alvo = avaliacoes.find((a) => a.id === avaliacaoId);
  if (!alvo) throw naoEncontrado('Avaliação');
  if (valorAtual(await operacoesDe(esc, investimentoId), avaliacoes.filter((a) => a.id !== avaliacaoId)).valor_centavos < 0) {
    throw conflito('Remover esta avaliação deixaria o valor do investimento negativo.');
  }
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE investimentos_avaliacoes SET excluida_em = ? WHERE usuario_id = :u AND id = ?', [agora.toISOString(), avaliacaoId]);
    await auditar(tx, { entidade: 'investimento_avaliacao', id: avaliacaoId, acao: 'excluir', antes: { investimento_id: investimentoId, ...alvo } });
    return obterInvestimento(tx, investimentoId);
  });
}
