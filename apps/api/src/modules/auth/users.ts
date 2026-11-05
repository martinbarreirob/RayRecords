import { MIN_PASSWORD_LENGTH } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import { hashPassword } from './password';

export type UpsertUserResult = 'created' | 'password-updated';

/**
 * Creates the single user (there is no web sign-up). If that username already exists its password
 * is changed and all its sessions are closed; if a different user exists, it is rejected.
 */
export async function upsertUser(
  c: Collections,
  username: string,
  password: string,
): Promise<UpsertUserResult> {
  if (!username.trim()) throw new Error('Username must not be empty');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const passwordHash = await hashPassword(password);
  const existing = await c.users.findOne({});
  if (existing) {
    if (existing.username !== username) {
      throw new Error(`User "${existing.username}" already exists: the app is single-user`);
    }
    await c.users.updateOne({ _id: existing._id }, { $set: { passwordHash } });
    await c.sessions.deleteMany({ userId: existing._id });
    return 'password-updated';
  }

  await c.users.insertOne({ _id: new ObjectId(), username, passwordHash, createdAt: new Date() });
  return 'created';
}
