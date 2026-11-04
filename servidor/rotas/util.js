import { FUSO_PADRAO } from '../../contratos/config.js';
import { naoEncontrado } from '../erros.js';
import { lerConfig } from '../banco/config-db.js';
import { hojeNoFuso } from '../dominio/datas.js';
import { gerarOcorrencias } from '../banco/repositorios/recorrencias.js';

/** Id numérico do parâmetro :id; id inválido é "não encontrado". */
export function idDe(request) {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) throw naoEncontrado();
  return id;
}

export const fusoDe = (db) => lerConfig(db, 'fuso') ?? FUSO_PADRAO;

/** Data de hoje (AAAA-MM-DD) no fuso configurado. */
export const hojeDe = (db) => hojeNoFuso(fusoDe(db));

/** Contexto de uma escrita: "hoje" no fuso configurado e o instante atual (UTC). */
export function contextoDeEscrita(db) {
  const agora = new Date();
  return { agora, hoje: hojeNoFuso(fusoDe(db), agora) };
}

/**
 * Gera as ocorrências de recorrência que faltam (idempotente) e devolve o contexto. Chamado ao abrir o app
 * e nas listagens que dependem de compromissos: não existe processo em segundo plano.
 */
export function garantirOcorrencias(db) {
  const ctx = contextoDeEscrita(db);
  gerarOcorrencias(db, ctx);
  return ctx;
}
