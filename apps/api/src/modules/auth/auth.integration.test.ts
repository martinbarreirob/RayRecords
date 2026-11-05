import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { connectDatabase, type Database } from '../../db/client';
import { ensureIndexes } from '../../db/indexes';
import { SESSION_COOKIE, hashToken } from './sessions';
import { upsertUser } from './users';

/**
 * Integración contra un Mongo real (`MONGO_URI`, por defecto el de `pnpm dev:db`) en una base
 * temporal que se borra al terminar. Si no hay Mongo accesible, el bloque se omite; en CI se
 * levanta un servicio Mongo para que se ejecute siempre.
 */
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME = `rayrecords_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = 'contraseña de prueba larga';

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

describe.skipIf(!database)('autenticación (integración)', () => {
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

  it('health es público', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
  });

  it('el resto de /api exige sesión y responde con el formato de error uniforme', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/lists' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'unauthorized', message: expect.any(String) },
    });
  });

  it('una ruta inexistente da 404 con el formato uniforme', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/no-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('login correcto: cookie httpOnly + SameSite=Strict, y /me devuelve el usuario', async () => {
    const response = await login();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ username: 'martin' });

    const setCookie = response.headers['set-cookie'] as string;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).not.toContain('Secure'); // petición HTTP

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieOf(response)! },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'martin' });
  });

  it('marca la cookie como Secure cuando llega por HTTPS (X-Forwarded-Proto)', async () => {
    const response = await login(PASSWORD, { 'x-forwarded-proto': 'https' });
    expect(response.headers['set-cookie']).toContain('Secure');
  });

  it('contraseña o usuario incorrectos dan el mismo 401', async () => {
    const wrongPassword = await login('incorrecta');
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nadie', password: PASSWORD },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(unknownUser.json()).toEqual(wrongPassword.json());
  });

  it('un cuerpo inválido da 400 con detalles de validación', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: '' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_error');
    expect(response.json().error.details.length).toBeGreaterThan(0);
  });

  it('logout revoca la sesión en el servidor', async () => {
    const cookie = cookieOf(await login())!;
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('una sesión caducada no vale aunque Mongo aún no la haya borrado', async () => {
    const cookie = cookieOf(await login())!;
    await database!.collections.sessions.updateMany({}, { $set: { expiresAt: new Date(0) } });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('renueva la sesión de forma deslizante y reenvía la cookie', async () => {
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

  it('rechaza peticiones que modifican datos desde otro origen', async () => {
    const response = await login(PASSWORD, { origin: 'https://malo.example', host: 'app.test' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('forbidden_origin');

    const ok = await login(PASSWORD, { origin: 'http://app.test', host: 'app.test' });
    expect(ok.statusCode).toBe(200);
  });

  it('el token no se guarda en claro', async () => {
    const response = await login();
    const token = cookieOf(response)!.split('=')[1]!;
    expect(await database!.collections.sessions.findOne({ _id: token })).toBeNull();
  });

  it('limita los intentos de login por IP (429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await login('incorrecta')).statusCode);
    expect(statuses).toContain(429);
  });

  // Al final: cambia la contraseña, y los tests anteriores necesitan la original.
  it('alta del usuario único: rechaza contraseñas cortas y un segundo usuario, y cambiar la contraseña cierra sesiones', async () => {
    const c = database!.collections;
    await expect(upsertUser(c, 'martin', 'corta')).rejects.toThrow(/al menos/);
    await expect(upsertUser(c, 'otro', PASSWORD)).rejects.toThrow(/un solo usuario/);

    await c.sessions.insertOne({
      _id: 'x',
      userId: (await c.users.findOne({}))!._id,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });
    expect(await upsertUser(c, 'martin', 'otra contraseña muy larga')).toBe('password-updated');
    expect(await c.sessions.countDocuments()).toBe(0);
  });
});
