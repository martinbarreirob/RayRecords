import { MIN_PASSWORD_LENGTH } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import { hashPassword } from './password';

export type UpsertUserResult = 'created' | 'password-updated';

/**
 * Alta del usuario único (no hay registro por la web). Si ya existe con ese nombre se cambia su
 * contraseña y se cierran todas sus sesiones; si existe otro usuario distinto, se rechaza.
 */
export async function upsertUser(
  c: Collections,
  username: string,
  password: string,
): Promise<UpsertUserResult> {
  if (!username.trim()) throw new Error('El nombre de usuario no puede estar vacío');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }

  const passwordHash = await hashPassword(password);
  const existing = await c.users.findOne({});
  if (existing) {
    if (existing.username !== username) {
      throw new Error(`Ya existe el usuario "${existing.username}": la app es de un solo usuario`);
    }
    await c.users.updateOne({ _id: existing._id }, { $set: { passwordHash } });
    await c.sessions.deleteMany({ userId: existing._id });
    return 'password-updated';
  }

  await c.users.insertOne({ _id: new ObjectId(), username, passwordHash, createdAt: new Date() });
  return 'created';
}
