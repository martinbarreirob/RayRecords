import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { connectDatabase, type Database } from '../../db/client';
import { ensureIndexes } from '../../db/indexes';
import { SESSION_COOKIE, hashToken } from './sessions';
import { upsertUser } from './users';

/**
 * Integration against a real Mongo (`MONGO_URI`, defaulting to the `pnpm dev:db` one) in a temporary
 * database dropped at the end. Without a reachable Mongo the block is skipped; CI starts a Mongo
 * service so it always runs there.
 */
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME = `rayrecords_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = 'a long test password';

async function tryConnect(): Promise<Database | null> {
  try {
    const database = await connectDatabase({ mongoUri: MONGO_URI, mongoDb: DB_NAME });
    await database.db.command({ ping: 1 });
    return database;
  } catch {
    return null;
  }
}

const database = await tryConnect();

describe.skipIf(!database)('authentication (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await ensureIndexes(database!.collections);
    await upsertUser(database!.collections, 'martin', PASSWORD);
    app = await buildApp({
      config: { nodeEnv: 'test', logLevel: 'silent' },
      database: database!,
    });
  });

  afterAll(async () => {
    await app?.close();
    await database?.db.dropDatabase();
    await database?.close();
  });

  const login = (password = PASSWORD, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { username: 'martin', password },
    });

  const cookieOf = (response: Awaited<ReturnType<typeof login>>) => {
    const found = response.cookies.find((c) => c.name === SESSION_COOKIE);
    return found ? `${SESSION_COOKIE}=${found.value}` : undefined;
  };

  it('health is public', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
  });

  it('the rest of /api requires a session and uses the uniform error format', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/lists' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'unauthorized', message: expect.any(String) },
    });
  });

  it('disables caching of responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('an unknown route gives 404 in the uniform format', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('successful login: httpOnly + SameSite=Strict cookie, and /me returns the user', async () => {
    const response = await login();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ username: 'martin' });

    const setCookie = response.headers['set-cookie'] as string;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).not.toContain('Secure'); // plain HTTP request

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieOf(response)! },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'martin' });
  });

  it('marks the cookie Secure when the request arrives over HTTPS (X-Forwarded-Proto)', async () => {
    const response = await login(PASSWORD, { 'x-forwarded-proto': 'https' });
    expect(response.headers['set-cookie']).toContain('Secure');
  });

  it('a wrong password and an unknown user give the same 401', async () => {
    const wrongPassword = await login('wrong');
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: PASSWORD },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(unknownUser.json()).toEqual(wrongPassword.json());
  });

  it('an invalid body gives 400 with validation details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: '' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_error');
    expect(response.json().error.details.length).toBeGreaterThan(0);
  });

  it('logout revokes the session on the server', async () => {
    const cookie = cookieOf(await login())!;
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('an expired session is rejected even if Mongo has not deleted it yet', async () => {
    const cookie = cookieOf(await login())!;
    await database!.collections.sessions.updateMany({}, { $set: { expiresAt: new Date(0) } });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('renews the session with a sliding window and resends the cookie', async () => {
    const cookie = cookieOf(await login())!;
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await database!.collections.sessions.updateMany(
      {},
      { $set: { lastSeenAt: old, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
    );

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.cookies.find((c) => c.name === SESSION_COOKIE)).toBeDefined();
    const session = await database!.collections.sessions.findOne({
      _id: hashToken(cookie.split('=')[1]!),
    });
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it('rejects state-changing requests from another origin', async () => {
    const response = await login(PASSWORD, { origin: 'https://evil.example', host: 'app.test' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('forbidden_origin');

    const ok = await login(PASSWORD, { origin: 'http://app.test', host: 'app.test' });
    expect(ok.statusCode).toBe(200);
  });

  it('the token is not stored in clear text', async () => {
    const response = await login();
    const token = cookieOf(response)!.split('=')[1]!;
    expect(await database!.collections.sessions.findOne({ _id: token })).toBeNull();
  });

  it('rate-limits login attempts per IP (429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await login('wrong')).statusCode);
    expect(statuses).toContain(429);
  });

  // Last on purpose: it changes the password, and the earlier tests need the original.
  it('single user setup: rejects short passwords and a second user, and a password change closes sessions', async () => {
    const c = database!.collections;
    await expect(upsertUser(c, 'martin', 'short')).rejects.toThrow(/at least/);
    await expect(upsertUser(c, 'other', PASSWORD)).rejects.toThrow(/single-user/);

    await c.sessions.insertOne({
      _id: 'x',
      userId: (await c.users.findOne({}))!._id,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });
    expect(await upsertUser(c, 'martin', 'another very long password')).toBe('password-updated');
    expect(await c.sessions.countDocuments()).toBe(0);
  });
});
