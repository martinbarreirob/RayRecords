import { MIN_PASSWORD_LENGTH } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import { DATA_PREFIX, type Collections } from '../../db/client';
import { hashPassword } from './password';

export type UpsertUserResult = 'created' | 'password-updated';

/**
 * Creates a user (there is no web sign-up) or, if the username exists, changes its password and
 * closes all its sessions. `dataPrefix` is the prefix of the collections that will hold the data of
 * a new user (like `demo_`); without it the user works on the unprefixed ones, like the first did.
 */
export async function upsertUser(
  c: Collections,
  username: string,
  password: string,
  options: { dataPrefix?: string; allowWeakPassword?: boolean } = {},
): Promise<UpsertUserResult> {
  if (!username.trim()) throw new Error('Username must not be empty');
  // Only the public demo account opts out of the length rule (its password is shown on the login).
  if (!options.allowWeakPassword && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (options.dataPrefix !== undefined && !DATA_PREFIX.test(options.dataPrefix)) {
    throw new Error('The data prefix is lowercase letters and numbers and ends with an underscore');
  }

  const passwordHash = await hashPassword(password);
  const existing = await c.users.findOne({ username });
  if (existing) {
    await c.users.updateOne({ _id: existing._id }, { $set: { passwordHash } });
    await c.sessions.deleteMany({ userId: existing._id });
    return 'password-updated';
  }

  await c.users.insertOne({
    _id: new ObjectId(),
    username,
    passwordHash,
    ...(options.dataPrefix !== undefined && { dataPrefix: options.dataPrefix }),
    createdAt: new Date(),
  });
  return 'created';
}
