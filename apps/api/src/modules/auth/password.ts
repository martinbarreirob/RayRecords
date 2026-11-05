import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Hash de contraseñas con scrypt de `node:crypto`: sin dependencias nativas, así la imagen Alpine
 * se construye igual en cualquier arquitectura. Formato: `scrypt$N$r$p$salt$hash` (base64).
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAXMEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: MAXMEM },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    Number(n),
    Number(r),
    Number(p),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash de relleno: se verifica contra él cuando el usuario no existe, para no delatarlo por el tiempo. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
