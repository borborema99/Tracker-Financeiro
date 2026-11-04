import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { lerConfig, gravarConfig } from '../banco/config-db.js';

const scryptAsync = promisify(scrypt);
const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 64;

export async function hashSenha(senha) {
  const sal = randomBytes(16);
  const derivada = await scryptAsync(senha, sal, TAMANHO, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64'), derivada.toString('base64')].join('$');
}

export async function verificarSenha(senha, armazenado) {
  const [alg, n, r, p, sal, hash] = (armazenado ?? '').split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const derivada = await scryptAsync(senha, Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(derivada, esperado);
}

export function senhaDefinida(db) {
  return lerConfig(db, 'senha_hash') !== null;
}

export async function definirSenha(db, senha) {
  gravarConfig(db, 'senha_hash', await hashSenha(senha));
}

export async function conferirSenha(db, senha) {
  return verificarSenha(senha, lerConfig(db, 'senha_hash'));
}
