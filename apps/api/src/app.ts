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
import { eventsRoutes } from './modules/calendar/events';
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
    // Runs behind a reverse proxy: trust X-Forwarded-* for client IP and protocol. The API port must
    // not be reachable directly, or clients could spoof their IP and dodge the login rate limit.
    trustProxy: true,
    logger:
      config.nodeEnv === 'development'
        ? { level: config.logLevel, transport: { target: 'pino-pretty' } }
        : { level: config.logLevel },
  });

  // Zod schemas from @rayrecords/shared validate input and serialize output.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  app.decorate('db', database);
  await app.register(cookie);

  // Responses are tied to the session, so they must never be cached. The other security headers
  // (nosniff, framing, referrer, CSP) are set once, by nginx.
  app.addHook('onSend', (_request, reply, payload, done) => {
    reply.header('Cache-Control', 'no-store');
    done(null, payload);
  });

  // No global limit: only routes that set `config.rateLimit` (login) are limited.
  await app.register(rateLimit, { global: false });

  // Every module lives under /api, the path the proxy forwards here.
  await app.register(
    async (api) => {
      // Registered first so its hooks cover every route added after it. All of /api requires a
      // session except routes marked `config.public`.
      registerAuthGuard(api, { allowedOrigins: config.allowedOrigins ?? [] });

      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(listsRoutes);
      await api.register(itemsRoutes);
      await api.register(notesRoutes);
      await api.register(noteCardsRoutes);
      await api.register(captureRoutes);
      await api.register(calendarRoutes);
      await api.register(eventsRoutes);
      await api.register(accountsRoutes);
      await api.register(expensesRoutes);
      await api.register(reviewRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
