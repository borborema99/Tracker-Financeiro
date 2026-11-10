import { invalido, naoEncontrado } from '../../erros.js';
import { descricaoDaParcela, gerarParcelas, resumoDaDivida } from '../../dominio/divida.js';
import { situacaoDoCompromisso } from '../../dominio/compromisso.js';
import { auditar } from '../auditoria.js';
import { inserirMovimentacaoAuditada, obterMovimentacao } from './movimentacoes.js';

const COLUNAS =
  'id, nome, credor, parcelas_total, valor_total_centavos, primeiro_vencimento, conta_id, categoria_id, observacao, criada_em, atualizada_em';

const obterLinha = async (esc, id) =>
  (await esc.um(`SELECT ${COLUNAS} FROM dividas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL`, [id])) ?? null;

const lancamentosDaDivida = (esc, id) =>
  esc.todos(
    `SELECT id, divida_parcela, status, valor_centavos, data_vencimento, data_competencia, data_liquidacao
       FROM movimentacoes WHERE usuario_id = :u AND divida_id = ? AND excluida_em IS NULL
      ORDER BY divida_parcela, data_competencia, id`,
    [id],
  );

const comResumo = async (esc, d, hoje) => ({ ...d, ...resumoDaDivida(await lancamentosDaDivida(esc, d.id), hoje) });

/** Em atraso primeiro, depois em dia (pela próxima parcela), depois quitadas. */
export async function listarDividas(esc, hoje) {
  const ordem = { atrasada: 0, em_dia: 1, quitada: 2, sem_parcelas: 3 };
  const linhas = await esc.todos(`SELECT ${COLUNAS} FROM dividas WHERE usuario_id = :u AND excluida_em IS NULL`);
  const dividas = [];
  for (const d of linhas) dividas.push(await comResumo(esc, d, hoje));
  return dividas.sort(
    (a, b) =>
      ordem[a.situacao] - ordem[b.situacao] ||
      (a.proxima?.data_vencimento ?? '9999-99-99').localeCompare(b.proxima?.data_vencimento ?? '9999-99-99') ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Uma dívida com cada parcela (inclusive o restante de uma baixa parcial) e sua situação calculada. */
export async function obterDivida(esc, id, hoje) {
  const d = await obterLinha(esc, id);
  if (!d) return null;
  const parcelas = (await lancamentosDaDivida(esc, id)).map((l) => ({
    lancamento_id: l.id,
    numero: l.divida_parcela,
    valor_centavos: l.valor_centavos,
    status: l.status,
    data_vencimento: l.data_vencimento ?? l.data_competencia,
    data_liquidacao: l.data_liquidacao,
    situacao: situacaoDoCompromisso(l, hoje),
  }));
  return { ...(await comResumo(esc, d, hoje)), parcelas };
}

/** Resumo para o início: só existe se houver dívida com parcela em aberto (RF-10). */
export async function resumoDeDividas(esc, hoje) {
  const abertas = (await listarDividas(esc, hoje)).filter((d) => d.restante_centavos > 0);
  if (abertas.length === 0) return null;
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((d) => d.situacao === 'atrasada').length,
    restante_centavos: abertas.reduce((s, d) => s + d.restante_centavos, 0),
    atrasado_centavos: abertas.reduce((s, d) => s + d.atrasado_centavos, 0),
  };
}

async function validar(esc, d) {
  const campos = {};
  const conta = await esc.um('SELECT arquivada FROM contas WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [d.conta_id]);
  if (!conta) campos.conta_id = 'Conta não encontrada.';
  else if (conta.arquivada) campos.conta_id = 'Esta conta está arquivada.';
  if (d.categoria_id) {
    const c = await esc.um('SELECT tipo FROM categorias WHERE usuario_id = :u AND id = ? AND excluida_em IS NULL', [d.categoria_id]);
    if (!c) campos.categoria_id = 'Categoria não encontrada.';
    else if (c.tipo !== 'despesa') campos.categoria_id = 'Esta categoria não é de despesa.';
  }
  if (Object.keys(campos).length) throw invalido(campos);
}

/** Cria a dívida e as suas parcelas como despesas pendentes, tudo na mesma transação e com auditoria. */
export async function criarDivida(esc, dados, { hoje, agora = new Date() }) {
  await validar(esc, dados);
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    const [{ id }] = await tx.rodar(
      `INSERT INTO dividas (usuario_id, nome, credor, parcelas_total, valor_total_centavos, primeiro_vencimento, conta_id,
         categoria_id, observacao, criada_em, atualizada_em)
       VALUES (:u, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        dados.nome,
        dados.credor,
        dados.parcelas_total,
        dados.valor_total_centavos,
        dados.primeiro_vencimento,
        dados.conta_id,
        dados.categoria_id ?? null,
        dados.observacao,
        iso,
        iso,
      ],
    );
    await auditar(tx, { entidade: 'divida', id, acao: 'criar', depois: await obterLinha(tx, id) });
    for (const p of gerarParcelas(dados)) {
      await inserirMovimentacaoAuditada(
        tx,
        {
          tipo: 'despesa',
          descricao: descricaoDaParcela(dados.nome, p.numero, dados.parcelas_total),
          valor_centavos: p.valor_centavos,
          conta_id: dados.conta_id,
          categoria_id: dados.categoria_id ?? null,
          data_competencia: p.data_vencimento,
          data_vencimento: p.data_vencimento,
          status: 'pendente',
          observacao: dados.observacao,
          divida_id: id,
          divida_parcela: p.numero,
        },
        iso,
      );
    }
    return obterDivida(tx, id, hoje);
  });
}

/** Muda nome, credor e observação; o nome novo vai também para a descrição de cada parcela. */
export async function atualizarDivida(esc, id, dados, { hoje, agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Dívida');
  const iso = agora.toISOString();
  return esc.transacao(async (tx) => {
    await tx.rodar('UPDATE dividas SET nome = ?, credor = ?, observacao = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [
      dados.nome,
      dados.credor,
      dados.observacao,
      iso,
      id,
    ]);
    await auditar(tx, { entidade: 'divida', id, acao: 'editar', antes, depois: await obterLinha(tx, id) });
    if (dados.nome !== antes.nome) {
      for (const { id: movId, divida_parcela: n } of await lancamentosDaDivida(tx, id)) {
        const anterior = await obterMovimentacao(tx, movId);
        await tx.rodar('UPDATE movimentacoes SET descricao = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [
          descricaoDaParcela(dados.nome, n, antes.parcelas_total),
          iso,
          movId,
        ]);
        await auditar(tx, { entidade: 'movimentacao', id: movId, acao: 'editar', antes: anterior, depois: await obterMovimentacao(tx, movId) });
      }
    }
    return obterDivida(tx, id, hoje);
  });
}

/**
 * Exclui a dívida e as parcelas que ainda estão pendentes. O que já foi pago continua nos lançamentos
 * (é histórico de dinheiro que saiu da conta) e nada fica órfão: nenhuma parcela pendente sobra (RF-16).
 */
export async function excluirDivida(esc, id, { agora = new Date() }) {
  const antes = await obterLinha(esc, id);
  if (!antes) throw naoEncontrado('Dívida');
  const iso = agora.toISOString();
  await esc.transacao(async (tx) => {
    for (const l of (await lancamentosDaDivida(tx, id)).filter((x) => x.status === 'pendente')) {
      const anterior = await obterMovimentacao(tx, l.id);
      await tx.rodar('UPDATE movimentacoes SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, l.id]);
      await auditar(tx, { entidade: 'movimentacao', id: l.id, acao: 'excluir', antes: anterior });
    }
    await tx.rodar('UPDATE dividas SET excluida_em = ?, atualizada_em = ? WHERE usuario_id = :u AND id = ?', [iso, iso, id]);
    await auditar(tx, { entidade: 'divida', id, acao: 'excluir', antes });
  });
}
