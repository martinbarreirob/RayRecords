import { createHash, randomBytes } from 'node:crypto';
import type { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import type { SessionDoc } from '../../db/documents';

export const SESSION_COOKIE = 'rr_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** La renovación deslizante solo escribe en Mongo si ha pasado al menos esto desde la última. */
const RENEW_AFTER_MS = 60 * 60 * 1000;

/** En Mongo solo se guarda el hash del token: una copia de la BD no permite suplantar sesiones. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  c: Collections,
  userId: ObjectId,
  userAgent: string | undefined,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await c.sessions.insertOne({
    _id: hashToken(token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    ...(userAgent ? { userAgent: userAgent.slice(0, 200) } : {}),
  });
  return { token, expiresAt };
}

export interface ResolvedSession {
  session: SessionDoc;
  /** Nueva caducidad si se ha renovado (hay que reenviar la cookie), si no `undefined`. */
  renewedUntil?: Date;
}

/** Busca la sesión del token (el TTL de Mongo borra con retraso, así que se comprueba `expiresAt`). */
export async function resolveSession(
  c: Collections,
  token: string,
  now = new Date(),
): Promise<ResolvedSession | null> {
  const session = await c.sessions.findOne({ _id: hashToken(token) });
  if (!session || session.expiresAt <= now) return null;

  if (now.getTime() - session.lastSeenAt.getTime() < RENEW_AFTER_MS) return { session };
  const renewedUntil = new Date(now.getTime() + SESSION_TTL_MS);
  await c.sessions.updateOne(
    { _id: session._id },
    { $set: { lastSeenAt: now, expiresAt: renewedUntil } },
  );
  return { session, renewedUntil };
}

export function deleteSession(c: Collections, token: string) {
  return c.sessions.deleteOne({ _id: hashToken(token) });
}
