/** Erro esperado de regra de negócio; vira resposta 4xx com a mensagem (e os campos, se houver). */
export class ErroDominio extends Error {
  constructor(statusCode, mensagem, campos) {
    super(mensagem);
    this.statusCode = statusCode;
    this.campos = campos;
  }
}

export const naoEncontrado = (o = 'Registro') => new ErroDominio(404, `${o} não encontrado.`);
export const invalido = (campos) => new ErroDominio(400, 'Dados inválidos.', campos);
export const conflito = (mensagem) => new ErroDominio(409, mensagem);
