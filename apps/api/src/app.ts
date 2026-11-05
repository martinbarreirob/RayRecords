import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from './config';
import type { Database } from './db/client';
import { registerErrorHandling } from './http/errors';
import { authRoutes } from './modules/auth/routes';
import { registerAuthGuard } from './modules/auth/guard';
import { expensesRoutes } from './modules/expenses/routes';
import { reviewRoutes } from './modules/expenses/review-routes';
import { healthRoutes } from './modules/health/routes';
import { accountsRoutes } from './modules/accounts/routes';
import { calendarRoutes } from './modules/calendar/routes';
import { captureRoutes } from './modules/capture/routes';
import { itemsRoutes } from './modules/items/routes';
import { listsRoutes } from './modules/lists/routes';
import { noteCardsRoutes } from './modules/note-cards/routes';
import { notesRoutes } from './modules/notes/routes';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface AppOptions {
  config: Pick<Config, 'nodeEnv' | 'logLevel'> & { allowedOrigins?: string[] };
  database: Database;
}

export async function buildApp({ config, database }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    // Detrás de nginx (y de `tailscale serve`): confiar en X-Forwarded-* para IP y protocolo.
    trustProxy: true,
    logger:
      config.nodeEnv === 'development'
        ? { level: config.logLevel, transport: { target: 'pino-pretty' } }
        : { level: config.logLevel },
  });

  // Los esquemas Zod de @rayrecords/shared validan las entradas y serializan las salidas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  app.decorate('db', database);
  await app.register(cookie);
  // Sin límite global: solo las rutas que declaran `config.rateLimit` (el login).
  await app.register(rateLimit, { global: false });

  // Todos los módulos cuelgan de /api, que es lo que nginx enruta hacia aquí.
  await app.register(
    async (api) => {
      // Va primero: sus hooks cubren todas las rutas registradas después. Todo /api exige sesión
      // salvo las rutas marcadas `config.public`.
      registerAuthGuard(api, { allowedOrigins: config.allowedOrigins ?? [] });

      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(listsRoutes);
      await api.register(itemsRoutes);
      await api.register(notesRoutes);
      await api.register(noteCardsRoutes);
      await api.register(captureRoutes);
      await api.register(calendarRoutes);
      await api.register(accountsRoutes);
      await api.register(expensesRoutes);
      await api.register(reviewRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
