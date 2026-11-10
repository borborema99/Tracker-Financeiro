import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 64;

// A senha passa antes por um HMAC com o pepper (SENHA_PEPPER, só no servidor): quem roubar o banco sem o pepper
// não consegue testar senhas contra os hashes. O scrypt cuida do custo e do sal.
const comPepper = (senha, pepper) => createHmac('sha256', pepper).update(senha).digest();

export async function hashSenha(senha, pepper) {
  if (!pepper) throw new Error('SENHA_PEPPER não definido.');
  const sal = randomBytes(16);
  const derivada = await scryptAsync(comPepper(senha, pepper), sal, TAMANHO, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64'), derivada.toString('base64')].join('$');
}

export async function verificarSenha(senha, armazenado, pepper) {
  const [alg, n, r, p, sal, hash] = (armazenado ?? '').split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const derivada = await scryptAsync(comPepper(senha, pepper), Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(derivada, esperado);
}

/**
 * Hash de uma senha qualquer, calculado uma vez. Login de usuário que não existe confere contra ele, para gastar
 * o mesmo tempo de um login de verdade e a resposta não revelar quais nomes existem.
 */
let hashFalso;
export async function conferirContraFalso(senha, pepper) {
  hashFalso ??= await hashSenha(randomBytes(16).toString('hex'), pepper);
  await verificarSenha(senha, hashFalso, pepper);
  return false;
}
