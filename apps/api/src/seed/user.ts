import { ObjectId } from 'mongodb';
import type { Collections } from '../db/client';
import { hashPassword } from '../modules/auth/password';

/**
 * Usuario de desarrollo que crea el seeder. Solo sirve para BDs _dev/_demo; se puede cambiar con
 * SEED_USERNAME y SEED_PASSWORD (mínimo 12 caracteres).
 */
const DEFAULT_USERNAME = 'demo';
const DEFAULT_PASSWORD = 'abc123.';

/**
 * La app es de un solo usuario: se sustituye el que hubiera por el de desarrollo, de modo que tras
 * sembrar siempre se conocen las credenciales. Las sesiones anteriores se cierran.
 */
export async function seedUser(c: Collections, env: NodeJS.ProcessEnv): Promise<string> {
  const username = env.SEED_USERNAME?.trim() || DEFAULT_USERNAME;
  const password = env.SEED_PASSWORD || DEFAULT_PASSWORD;
  await c.users.deleteMany({});
  await c.sessions.deleteMany({});
  await c.users.insertOne({
    _id: new ObjectId(),
    username,
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
  });
  return username;
}
