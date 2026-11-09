import { encontrarDuplicadas } from '../../dominio/duplicidade.js';
import { decodificarOfx, lerOfx } from '../../dominio/ofx.js';
import { invalido, naoEncontrado } from '../../erros.js';
import { auditar } from '../auditoria.js';
import { criarMovimentacao } from './movimentacoes.js';

function contaAtiva(db, contaId) {
  const conta = db.prepare('SELECT id, arquivada FROM contas WHERE id = ? AND excluida_em IS NULL').get(contaId);
  if (!conta) throw naoEncontrado('Conta');
  if (conta.arquivada === 1) throw invalido({ conta_id: 'Esta conta está arquivada.' });
}

/** FITIDs desta conta que ainda têm lançamento (se a pessoa excluiu o lançamento, o extrato pode entrar de novo). */
function jaImportada(db, contaId, fitid) {
  return !!db
    .prepare(
      `SELECT 1 FROM importacoes_ofx i JOIN movimentacoes m ON m.id = i.movimentacao_id
        WHERE i.conta_id = ? AND i.fitid = ? AND m.excluida_em IS NULL`,
    )
    .get(contaId, fitid);
}

const tipoDoValor = (v) => (v > 0 ? 'receita' : 'despesa');

/**
 * Prévia da importação (RF-26): lê o arquivo e marca cada transação como `nova`, `ja_importada` (mesmo FITID já
 * virou lançamento nesta conta) ou `possivel_duplicidade` (RF-09: mesmo tipo, valor, data, conta e descrição de um
 * lançamento existente; só avisa). Não grava nada. Só aceita extrato em BRL.
 */
export function previaOfx(db, contaId, conteudo) {
  contaAtiva(db, contaId);
  let lido;
  try {
    lido = lerOfx(decodificarOfx(conteudo));
  } catch (erro) {
    throw invalido({ arquivo: erro.message });
  }
  if (lido.moeda !== 'BRL') {
    throw invalido({ arquivo: `Este extrato é em ${lido.moeda}. Por enquanto só dá para importar extrato em reais (BRL).` });
  }

  const datas = lido.transacoes.map((t) => t.data).sort();
  const existentes = datas.length
    ? db
        .prepare(
          `SELECT id, tipo, valor_centavos, data_competencia, conta_id, conta_destino_id, descricao, transferencia_id
             FROM movimentacoes
            WHERE excluida_em IS NULL AND conta_id = ? AND tipo IN ('receita', 'despesa')
              AND data_competencia BETWEEN ? AND ?`,
        )
        .all(contaId, datas[0], datas[datas.length - 1])
    : [];

  const itens = lido.transacoes.map((t) => {
    let situacao = 'nova';
    if (jaImportada(db, contaId, t.fitid)) situacao = 'ja_importada';
    else {
      const candidata = {
        tipo: tipoDoValor(t.valor_centavos),
        valor_centavos: Math.abs(t.valor_centavos),
        data_competencia: t.data,
        conta_id: contaId,
        conta_destino_id: null,
        descricao: t.descricao,
        transferencia_id: null,
      };
      if (encontrarDuplicadas(candidata, existentes).length > 0) situacao = 'possivel_duplicidade';
    }
    return { ...t, situacao };
  });
  const contar = (s) => itens.filter((i) => i.situacao === s).length;
  return {
    banco: lido.banco,
    conta_do_arquivo: lido.conta,
    itens,
    invalidas: lido.invalidas,
    resumo: { total: itens.length, novas: contar('nova'), ja_importadas: contar('ja_importada'), possiveis_duplicidades: contar('possivel_duplicidade') },
  };
}

/**
 * Cria os lançamentos escolhidos (RF-27), liquidados na data da transação, tudo ou nada. Revalida no servidor:
 * transação cujo FITID já virou lançamento é ignorada (nunca entra duas vezes). Possível duplicidade só avisa.
 */
export function confirmarOfx(db, { conta_id: contaId, itens }, { hoje, agora = new Date() }) {
  contaAtiva(db, contaId);
  return db.transaction(() => {
    const ids = [];
    let ignoradas = 0;
    let avisosDeDuplicidade = 0;
    for (const t of itens) {
      if (jaImportada(db, contaId, t.fitid)) {
        ignoradas += 1;
        continue;
      }
      const { movimentacao, avisos } = criarMovimentacao(
        db,
        {
          tipo: tipoDoValor(t.valor_centavos),
          descricao: t.descricao,
          valor_centavos: Math.abs(t.valor_centavos),
          conta_id: contaId,
          categoria_id: t.categoria_id ?? null,
          divisoes: [],
          data_competencia: t.data,
          data_liquidacao: t.data,
          status: 'liquidada',
          observacao: 'Importado de extrato OFX.',
          tarifa_centavos: 0,
        },
        { hoje, agora },
      );
      db.prepare(
        `INSERT INTO importacoes_ofx (conta_id, fitid, movimentacao_id, importada_em) VALUES (?, ?, ?, ?)
         ON CONFLICT (conta_id, fitid) DO UPDATE SET movimentacao_id = excluded.movimentacao_id, importada_em = excluded.importada_em`,
      ).run(contaId, t.fitid, movimentacao.id, agora.toISOString());
      ids.push(movimentacao.id);
      if ((avisos ?? []).some((a) => a.codigo === 'possivel_duplicidade')) avisosDeDuplicidade += 1;
    }
    auditar(db, { entidade: 'importacao_ofx', id: contaId, acao: 'criar', depois: { importadas: ids.length, ignoradas, ids } });
    return { importadas: ids.length, ignoradas, avisos_de_duplicidade: avisosDeDuplicidade, ids };
  })();
}
