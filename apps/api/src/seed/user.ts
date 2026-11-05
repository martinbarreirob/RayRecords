import { ObjectId } from 'mongodb';
import type { Collections } from '../db/client';
import { hashPassword } from '../modules/auth/password';

/**
 * Development user created by the seeder. Only for _dev/_demo databases; override it with
 * SEED_USERNAME and SEED_PASSWORD.
 */
const DEFAULT_USERNAME = 'demo';
const DEFAULT_PASSWORD = 'abc123.';

/**
 * The app is single-user: any existing user is replaced by the development one, so the credentials
 * are always known after seeding. Previous sessions are closed.
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
