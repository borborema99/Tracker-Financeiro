import { FUSO_PADRAO } from '../../contratos/config.js';
import { naoEncontrado } from '../erros.js';
import { lerConfig } from '../banco/config-db.js';
import { hojeNoFuso } from '../dominio/datas.js';
import { gerarOcorrencias } from '../banco/repositorios/recorrencias.js';

// Todas as funções daqui recebem o escopo do usuário da requisição (`request.esc`, montado em app.js depois de
// validar a sessão). Nenhuma rota de dados toca o banco sem passar por ele.

/** Id numérico do parâmetro :id; id inválido é "não encontrado". */
export function idDe(request) {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw naoEncontrado();
  return id;
}

export const fusoDe = async (esc) => (await lerConfig(esc, 'fuso')) ?? FUSO_PADRAO;

/** Data de hoje (AAAA-MM-DD) no fuso configurado. */
export const hojeDe = async (esc) => hojeNoFuso(await fusoDe(esc));

/** Contexto de uma escrita: "hoje" no fuso configurado e o instante atual (UTC). */
export async function contextoDeEscrita(esc) {
  const agora = new Date();
  return { agora, hoje: hojeNoFuso(await fusoDe(esc), agora) };
}

/**
 * Gera as ocorrências de recorrência que faltam (idempotente) e devolve o contexto. Chamado ao abrir o app
 * e nas listagens que dependem de compromissos: não existe processo em segundo plano.
 */
export async function garantirOcorrencias(esc) {
  const ctx = await contextoDeEscrita(esc);
  await gerarOcorrencias(esc, ctx);
  return ctx;
}
