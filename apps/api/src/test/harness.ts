import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { connectDatabase, type Database } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { SESSION_COOKIE } from '../modules/auth/sessions';
import { upsertUser } from '../modules/auth/users';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017';
const PASSWORD = 'contraseña de prueba larga';

export interface Harness {
  app: FastifyInstance;
  database: Database;
  /** Cabecera `cookie` de una sesión ya iniciada. */
  cookie: string;
  /** Petición autenticada. */
  call: (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
}

/**
 * Intenta preparar un entorno de integración contra un Mongo real, en una base temporal que se borra
 * al cerrar. Devuelve `null` si no hay Mongo accesible (los tests se omiten con `describe.skipIf`).
 */
export async function createHarness(): Promise<Harness | null> {
  const dbName = `rayrecords_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let database: Database;
  try {
    database = await connectDatabase({ mongoUri: MONGO_URI, mongoDb: dbName });
    await database.db.command({ ping: 1 });
  } catch {
    return null;
  }

  await ensureIndexes(database.collections);
  await upsertUser(database.collections, 'martin', PASSWORD);
  const app = await buildApp({ config: { nodeEnv: 'test', logLevel: 'silent' }, database });

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'martin', password: PASSWORD },
  });
  const cookie = `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`;

  return {
    app,
    database,
    cookie,
    call: async (method, url, payload) => {
      const response = await app.inject({
        method,
        url: `/api${url}`,
        headers: { cookie },
        ...(payload !== undefined && { payload: payload as object }),
      });
      const text = response.body;
      return { status: response.statusCode, body: text ? JSON.parse(text) : null };
    },
    close: async () => {
      await app.close();
      await database.db.dropDatabase();
      await database.close();
    },
  };
}
