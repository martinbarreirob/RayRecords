import { createHash, randomBytes } from 'node:crypto';
import type { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import type { SessionDoc } from '../../db/documents';

export const SESSION_COOKIE = 'rr_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding renewal only writes to Mongo if at least this much time passed since the last one. */
const RENEW_AFTER_MS = 60 * 60 * 1000;

/** Only the token hash is stored, so a copy of the database cannot be used to hijack sessions. */
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
  /** New expiry if the session was renewed (the cookie must be resent), otherwise `undefined`. */
  renewedUntil?: Date;
}

/** Looks up the token's session. Mongo's TTL cleanup lags, so `expiresAt` is checked here too. */
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
